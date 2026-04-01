import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestUser, deleteTestUser, makeUserClient, adminClient, TEST_PASSWORD } from "../helpers";

const EMAIL_A = "test-rls-a@life-on-track.test";
const EMAIL_B = "test-rls-b@life-on-track.test";

let userIdA: string;
let userIdB: string;
let clientA: Awaited<ReturnType<typeof makeUserClient>>;
let clientB: Awaited<ReturnType<typeof makeUserClient>>;

const TEST_DATE = "2099-01-01"; // Far future to avoid colliding with real data

beforeAll(async () => {
  userIdA = await createTestUser(EMAIL_A, TEST_PASSWORD);
  userIdB = await createTestUser(EMAIL_B, TEST_PASSWORD);
  clientA = await makeUserClient(EMAIL_A, TEST_PASSWORD);
  clientB = await makeUserClient(EMAIL_B, TEST_PASSWORD);

  // Seed a workout set for user A
  await adminClient.from("workout_sets").insert({
    user_id: userIdA,
    date: TEST_DATE,
    exercise: "Bench Press",
    sets: 3,
    reps: 10,
    weight_lbs: 135,
  });
});

afterAll(async () => {
  await adminClient.from("workout_sets").delete().in("user_id", [userIdA, userIdB]);
  await deleteTestUser(userIdA);
  await deleteTestUser(userIdB);
});

describe("workout_sets RLS", () => {
  it("user can read their own sets", async () => {
    const { data, error } = await clientA
      .from("workout_sets")
      .select("*")
      .eq("date", TEST_DATE);
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
    expect(data?.[0].exercise).toBe("Bench Press");
  });

  it("user cannot read another user's sets", async () => {
    const { data, error } = await clientB
      .from("workout_sets")
      .select("*")
      .eq("date", TEST_DATE);
    expect(error).toBeNull();
    expect(data?.length).toBe(0); // RLS returns empty, not an error
  });

  it("user cannot insert a set for another user", async () => {
    const { error } = await clientB.from("workout_sets").insert({
      user_id: userIdA, // attempting to write as user A
      date: TEST_DATE,
      exercise: "Squat",
    });
    expect(error).not.toBeNull();
  });

  it("user cannot update another user's set", async () => {
    const { data: sets } = await adminClient
      .from("workout_sets")
      .select("id")
      .eq("user_id", userIdA)
      .eq("date", TEST_DATE);
    const id = sets?.[0]?.id;

    const { error } = await clientB
      .from("workout_sets")
      .update({ reps: 999 })
      .eq("id", id);
    // Either error or 0 rows affected
    if (!error) {
      const { data } = await adminClient
        .from("workout_sets")
        .select("reps")
        .eq("id", id)
        .single();
      expect(data?.reps).not.toBe(999);
    }
  });

  it("user cannot delete another user's set", async () => {
    const { data: sets } = await adminClient
      .from("workout_sets")
      .select("id")
      .eq("user_id", userIdA)
      .eq("date", TEST_DATE);
    const id = sets?.[0]?.id;

    await clientB.from("workout_sets").delete().eq("id", id);

    // Record should still exist
    const { data } = await adminClient
      .from("workout_sets")
      .select("id")
      .eq("id", id);
    expect(data?.length).toBe(1);
  });

  it("unauthenticated client gets no data", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { data } = await anonClient
      .from("workout_sets")
      .select("*")
      .eq("date", TEST_DATE);
    expect(data?.length).toBe(0);
  });
});
