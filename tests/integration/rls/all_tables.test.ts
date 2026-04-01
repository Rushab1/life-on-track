/**
 * Cross-table RLS isolation tests.
 * Verifies that user B cannot read, write, or delete user A's data
 * across all tables: daily_logs, activity_completions, plans, custom_topics, mcp_tokens.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestUser, deleteTestUser, makeUserClient, adminClient, TEST_PASSWORD } from "../helpers";

const EMAIL_A = "test-rls2-a@life-on-track.test";
const EMAIL_B = "test-rls2-b@life-on-track.test";
const TEST_DATE = "2099-02-01";

let userIdA: string;
let userIdB: string;
let clientA: Awaited<ReturnType<typeof makeUserClient>>;
let clientB: Awaited<ReturnType<typeof makeUserClient>>;

beforeAll(async () => {
  userIdA = await createTestUser(EMAIL_A, TEST_PASSWORD);
  userIdB = await createTestUser(EMAIL_B, TEST_PASSWORD);
  clientA = await makeUserClient(EMAIL_A, TEST_PASSWORD);
  clientB = await makeUserClient(EMAIL_B, TEST_PASSWORD);

  // Seed one row per table for user A
  await adminClient.from("daily_logs").insert({ user_id: userIdA, date: TEST_DATE, pain_level: 2 });
  await adminClient.from("activity_completions").insert({ user_id: userIdA, date: TEST_DATE, activity_type: "psh" });
  await adminClient.from("plans").insert({
    user_id: userIdA,
    name: "Test Plan",
    start_date: TEST_DATE,
    end_date: TEST_DATE,
    gym_schedule: {},
    prep_schedule: {},
  });
  await adminClient.from("custom_topics").insert({ user_id: userIdA, category: "exercise", code: "test_ex", label: "Test Exercise" });
});

afterAll(async () => {
  await adminClient.from("daily_logs").delete().in("user_id", [userIdA, userIdB]);
  await adminClient.from("activity_completions").delete().in("user_id", [userIdA, userIdB]);
  await adminClient.from("plans").delete().in("user_id", [userIdA, userIdB]);
  await adminClient.from("custom_topics").delete().in("user_id", [userIdA, userIdB]);
  await adminClient.from("mcp_tokens").delete().in("user_id", [userIdA, userIdB]);
  await deleteTestUser(userIdA);
  await deleteTestUser(userIdB);
});

const tables = [
  { name: "daily_logs", insertPayload: (uid: string) => ({ user_id: uid, date: TEST_DATE, pain_level: 5 }) },
  { name: "activity_completions", insertPayload: (uid: string) => ({ user_id: uid, date: TEST_DATE, activity_type: "pll" }) },
  { name: "custom_topics", insertPayload: (uid: string) => ({ user_id: uid, category: "exercise", code: "steal_ex", label: "Stolen" }) },
] as const;

for (const table of tables) {
  describe(`${table.name} RLS`, () => {
    it("user A can read their own rows", async () => {
      const { data, error } = await clientA.from(table.name).select("*");
      expect(error).toBeNull();
      expect((data ?? []).length).toBeGreaterThan(0);
    });

    it("user B sees no rows from user A", async () => {
      const { data, error } = await clientB.from(table.name).select("*");
      expect(error).toBeNull();
      expect((data ?? []).length).toBe(0);
    });

    it("user B cannot insert a row owned by user A", async () => {
      const { error } = await clientB.from(table.name).insert(table.insertPayload(userIdA) as never);
      expect(error).not.toBeNull();
    });
  });
}

describe("plans RLS", () => {
  it("user A can read their own plans", async () => {
    const { data, error } = await clientA.from("plans").select("*");
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  it("user B sees no plans from user A", async () => {
    const { data, error } = await clientB.from("plans").select("*");
    expect(error).toBeNull();
    expect((data ?? []).length).toBe(0);
  });

  it("user B cannot insert a plan owned by user A", async () => {
    const { error } = await clientB.from("plans").insert({
      user_id: userIdA,
      name: "Stolen Plan",
      start_date: TEST_DATE,
      end_date: TEST_DATE,
      gym_schedule: {},
      prep_schedule: {},
    });
    expect(error).not.toBeNull();
  });
});

describe("mcp_tokens RLS", () => {
  it("user B sees no mcp_tokens from user A", async () => {
    // Seed a token for user A via admin
    await adminClient.from("mcp_tokens").insert({
      user_id: userIdA,
      name: "test-token",
      token_hash: "abc123hash",
    });
    const { data, error } = await clientB.from("mcp_tokens").select("*");
    expect(error).toBeNull();
    expect((data ?? []).length).toBe(0);
  });

  it("user B cannot insert a token for user A", async () => {
    const { error } = await clientB.from("mcp_tokens").insert({
      user_id: userIdA,
      name: "stolen-token",
      token_hash: "xyz",
    });
    expect(error).not.toBeNull();
  });
});
