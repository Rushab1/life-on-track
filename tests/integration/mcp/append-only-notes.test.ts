import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  createTestUser,
  deleteTestUser,
  makeUserClient,
  adminClient,
  TEST_PASSWORD,
} from "../helpers";

const EMAIL = "test-append-notes@life-on-track.test";
let userId: string;
let client: Awaited<ReturnType<typeof makeUserClient>>;

const TEST_DATE = "2099-06-15";

beforeAll(async () => {
  userId = await createTestUser(EMAIL, TEST_PASSWORD);
  client = await makeUserClient(EMAIL, TEST_PASSWORD);

  // Seed a known activity so activity-level tests pass validation
  await adminClient.from("activities").upsert(
    { user_id: userId, code: "tst", name: "Test Activity", category: "other" },
    { onConflict: "user_id,code" },
  );

  // Seed a workout exercise
  await adminClient.from("exercises").upsert(
    { user_id: userId, name: "Test Press" },
    { onConflict: "user_id,name" },
  );
});

afterAll(async () => {
  // Clean up all test data
  await adminClient.from("daily_logs").delete().eq("user_id", userId);
  await adminClient.from("activity_completions").delete().eq("user_id", userId);
  await adminClient.from("workout_sets").delete().eq("user_id", userId);
  await adminClient.from("activities").delete().eq("user_id", userId);
  await adminClient.from("exercises").delete().eq("user_id", userId);
  await deleteTestUser(userId);
});

beforeEach(async () => {
  // Clear per-test rows so tests are independent
  await adminClient.from("daily_logs").delete().eq("user_id", userId).eq("date", TEST_DATE);
  await adminClient.from("activity_completions").delete().eq("user_id", userId).eq("date", TEST_DATE);
  await adminClient.from("workout_sets").delete().eq("user_id", userId).eq("date", TEST_DATE);
});

// ---------------------------------------------------------------------------
// Helper: directly call the save_day / log_workout logic via DB operations
// to mirror what the MCP tools do. Since these are integration tests against
// the database, we test the append semantics at the DB level.
// ---------------------------------------------------------------------------

describe("daily log notes — append mode", () => {
  it("first write with append mode just sets the note", async () => {
    await client.from("daily_logs").upsert(
      { user_id: userId, date: TEST_DATE, notes: "First entry" },
      { onConflict: "user_id,date" },
    );

    const { data } = await client
      .from("daily_logs")
      .select("notes")
      .eq("date", TEST_DATE)
      .single();

    expect(data?.notes).toBe("First entry");
  });

  it("append mode concatenates with newline", async () => {
    // Seed initial note
    await client.from("daily_logs").upsert(
      { user_id: userId, date: TEST_DATE, notes: "Morning note" },
      { onConflict: "user_id,date" },
    );

    // Simulate append: fetch existing, concat, upsert
    const { data: existing } = await client
      .from("daily_logs")
      .select("notes")
      .eq("user_id", userId)
      .eq("date", TEST_DATE)
      .maybeSingle();
    const prev = existing?.notes as string | null;
    const appended = prev ? `${prev}\nEvening note` : "Evening note";

    await client.from("daily_logs").upsert(
      { user_id: userId, date: TEST_DATE, notes: appended },
      { onConflict: "user_id,date" },
    );

    const { data } = await client
      .from("daily_logs")
      .select("notes")
      .eq("date", TEST_DATE)
      .single();

    expect(data?.notes).toBe("Morning note\nEvening note");
  });

  it("multiple appends accumulate correctly", async () => {
    const entries = ["Entry 1", "Entry 2", "Entry 3"];

    for (const entry of entries) {
      const { data: existing } = await client
        .from("daily_logs")
        .select("notes")
        .eq("user_id", userId)
        .eq("date", TEST_DATE)
        .maybeSingle();
      const prev = (existing?.notes as string | null) ?? null;
      const newNotes = prev ? `${prev}\n${entry}` : entry;

      await client.from("daily_logs").upsert(
        { user_id: userId, date: TEST_DATE, notes: newNotes },
        { onConflict: "user_id,date" },
      );
    }

    const { data } = await client
      .from("daily_logs")
      .select("notes")
      .eq("date", TEST_DATE)
      .single();

    expect(data?.notes).toBe("Entry 1\nEntry 2\nEntry 3");
  });

  it("write mode replaces existing notes entirely", async () => {
    // Seed initial note
    await client.from("daily_logs").upsert(
      { user_id: userId, date: TEST_DATE, notes: "Old notes" },
      { onConflict: "user_id,date" },
    );

    // Write mode: just overwrite
    await client.from("daily_logs").upsert(
      { user_id: userId, date: TEST_DATE, notes: "Replacement" },
      { onConflict: "user_id,date" },
    );

    const { data } = await client
      .from("daily_logs")
      .select("notes")
      .eq("date", TEST_DATE)
      .single();

    expect(data?.notes).toBe("Replacement");
  });

  it("write mode with empty string clears notes", async () => {
    await client.from("daily_logs").upsert(
      { user_id: userId, date: TEST_DATE, notes: "Something" },
      { onConflict: "user_id,date" },
    );

    // Write mode with null clears
    await client.from("daily_logs").upsert(
      { user_id: userId, date: TEST_DATE, notes: null },
      { onConflict: "user_id,date" },
    );

    const { data } = await client
      .from("daily_logs")
      .select("notes")
      .eq("date", TEST_DATE)
      .single();

    expect(data?.notes).toBeNull();
  });
});

describe("activity notes — append mode", () => {
  it("first activity note with append mode just sets the note", async () => {
    await client.from("activity_completions").upsert(
      { user_id: userId, date: TEST_DATE, activity_type: "tst", completed: true, notes: "Did well" },
      { onConflict: "user_id,date,activity_type" },
    );

    const { data } = await client
      .from("activity_completions")
      .select("notes")
      .eq("date", TEST_DATE)
      .eq("activity_type", "tst")
      .single();

    expect(data?.notes).toBe("Did well");
  });

  it("append mode concatenates activity notes", async () => {
    // Seed
    await client.from("activity_completions").upsert(
      { user_id: userId, date: TEST_DATE, activity_type: "tst", completed: true, notes: "Morning session" },
      { onConflict: "user_id,date,activity_type" },
    );

    // Append
    const { data: existing } = await client
      .from("activity_completions")
      .select("notes")
      .eq("user_id", userId)
      .eq("date", TEST_DATE)
      .eq("activity_type", "tst")
      .maybeSingle();
    const prev = existing?.notes as string | null;
    const appended = prev ? `${prev}\nAfternoon followup` : "Afternoon followup";

    await client.from("activity_completions").upsert(
      { user_id: userId, date: TEST_DATE, activity_type: "tst", completed: true, notes: appended },
      { onConflict: "user_id,date,activity_type" },
    );

    const { data } = await client
      .from("activity_completions")
      .select("notes")
      .eq("date", TEST_DATE)
      .eq("activity_type", "tst")
      .single();

    expect(data?.notes).toBe("Morning session\nAfternoon followup");
  });

  it("write mode replaces activity notes", async () => {
    await client.from("activity_completions").upsert(
      { user_id: userId, date: TEST_DATE, activity_type: "tst", completed: true, notes: "Old note" },
      { onConflict: "user_id,date,activity_type" },
    );

    await client.from("activity_completions").upsert(
      { user_id: userId, date: TEST_DATE, activity_type: "tst", completed: true, notes: "New note" },
      { onConflict: "user_id,date,activity_type" },
    );

    const { data } = await client
      .from("activity_completions")
      .select("notes")
      .eq("date", TEST_DATE)
      .eq("activity_type", "tst")
      .single();

    expect(data?.notes).toBe("New note");
  });
});

describe("workout set notes — append mode", () => {
  it("new insert just sets notes regardless of mode", async () => {
    await client.from("workout_sets").insert({
      user_id: userId,
      date: TEST_DATE,
      exercise: "Test Press",
      reps: 10,
      notes: "Felt strong",
    });

    const { data } = await client
      .from("workout_sets")
      .select("notes")
      .eq("date", TEST_DATE)
      .eq("exercise", "Test Press")
      .single();

    expect(data?.notes).toBe("Felt strong");
  });

  it("update with append mode concatenates notes", async () => {
    // Insert initial set
    const { data: inserted } = await client
      .from("workout_sets")
      .insert({
        user_id: userId,
        date: TEST_DATE,
        exercise: "Test Press",
        reps: 10,
        notes: "Set 1 good form",
      })
      .select("id")
      .single();
    const setId = inserted!.id;

    // Simulate append on update
    const { data: existing } = await client
      .from("workout_sets")
      .select("notes")
      .eq("user_id", userId)
      .eq("id", setId)
      .maybeSingle();
    const prev = (existing?.notes as string | null) ?? null;
    const appended = prev ? `${prev}\nGrip slipped on last rep` : "Grip slipped on last rep";

    await client
      .from("workout_sets")
      .update({ notes: appended })
      .eq("user_id", userId)
      .eq("id", setId);

    const { data } = await client
      .from("workout_sets")
      .select("notes")
      .eq("id", setId)
      .single();

    expect(data?.notes).toBe("Set 1 good form\nGrip slipped on last rep");
  });

  it("update with write mode replaces notes", async () => {
    const { data: inserted } = await client
      .from("workout_sets")
      .insert({
        user_id: userId,
        date: TEST_DATE,
        exercise: "Test Press",
        reps: 8,
        notes: "Original note",
      })
      .select("id")
      .single();
    const setId = inserted!.id;

    // Write mode: just overwrite
    await client
      .from("workout_sets")
      .update({ notes: "Completely different note" })
      .eq("user_id", userId)
      .eq("id", setId);

    const { data } = await client
      .from("workout_sets")
      .select("notes")
      .eq("id", setId)
      .single();

    expect(data?.notes).toBe("Completely different note");
  });

  it("update append on null notes starts fresh", async () => {
    const { data: inserted } = await client
      .from("workout_sets")
      .insert({
        user_id: userId,
        date: TEST_DATE,
        exercise: "Test Press",
        reps: 5,
        notes: null,
      })
      .select("id")
      .single();
    const setId = inserted!.id;

    // Append to null = just sets the value
    const { data: existing } = await client
      .from("workout_sets")
      .select("notes")
      .eq("user_id", userId)
      .eq("id", setId)
      .maybeSingle();
    const prev = (existing?.notes as string | null) ?? null;
    const appended = prev ? `${prev}\nNew note` : "New note";

    await client
      .from("workout_sets")
      .update({ notes: appended })
      .eq("user_id", userId)
      .eq("id", setId);

    const { data } = await client
      .from("workout_sets")
      .select("notes")
      .eq("id", setId)
      .single();

    expect(data?.notes).toBe("New note");
  });
});
