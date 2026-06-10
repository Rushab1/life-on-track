import { describe, it, expect, beforeAll } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { registerAllTools } from "@/app/api/mcp/tools";

/**
 * The workout logging protocol lives in MCP tool descriptions (enforcement
 * layer) and the workout-logging prompt (canonical doc). These tests pin the
 * protocol so a description rewrite can't silently drop it.
 * Registration-time only — no tool handlers are invoked, so a stub Supabase
 * client suffices.
 */
describe("MCP workout logging protocol", () => {
  let descriptions: Record<string, string>;
  let client: Client;

  beforeAll(async () => {
    const server = new McpServer({ name: "test", version: "0.0.0" });
    registerAllTools(server, {} as unknown as SupabaseClient, "test-user");

    client = new Client({ name: "test-client", version: "0.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      client.connect(clientTransport),
      server.connect(serverTransport),
    ]);

    const { tools } = await client.listTools();
    descriptions = Object.fromEntries(
      tools.map((t) => [t.name, t.description ?? ""]),
    );
  });

  it("get_day carries the session-start protocol", () => {
    const d = descriptions.get_day;
    expect(d).toContain("WORKOUT LOGGING PROTOCOL");
    expect(d).toContain("baseline pain panel");
    expect(d).toContain("BEFORE any sets");
    expect(d).toContain("save_day");
  });

  it("log_workout carries the per-set and batching protocol", () => {
    const d = descriptions.log_workout;
    expect(d).toContain("one single-select question per set");
    expect(d).toContain('"(prev: 45, 50, 50)"');
    expect(d).toContain('Never use the phrase "top set"');
    expect(d).toContain("ONCE per exercise or superset");
    expect(d).toContain("pain panel");
    expect(d).toContain('action="list"');
  });

  it("get_history carries the prev-options and cardio-comparison protocol", () => {
    const d = descriptions.get_history;
    expect(d).toContain("Mode B (per-exercise recent sessions) BEFORE offering set options");
    expect(d).toContain("cardio/HR-zone");
  });

  it("save_day carries the phased-notes protocol", () => {
    const d = descriptions.save_day;
    expect(d).toContain(
      "baseline pain → post-exercise pain after each block → post-session summary",
    );
    expect(d).toContain("never overwrite earlier phases");
    expect(d).toContain("mark the day's activity complete");
  });

  it("manage_exercise carries the near-match protocol", () => {
    const d = descriptions.manage_exercise;
    expect(d).toContain('ALWAYS action="list"');
    expect(d).toContain("near-matches and synonyms");
  });

  it("every protocol tool points at the workout-logging prompt", () => {
    for (const name of [
      "get_day",
      "log_workout",
      "get_history",
      "save_day",
      "manage_exercise",
    ]) {
      expect(
        descriptions[name],
        `${name} should reference the workout-logging prompt`,
      ).toContain("Follow the workout-logging prompt for the full session protocol");
    }
  });

  it("serves the workout-logging prompt with the full protocol", async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name)).toContain("workout-logging");

    const { messages } = await client.getPrompt({ name: "workout-logging" });
    const text = messages
      .map((m) => (m.content.type === "text" ? m.content.text : ""))
      .join("\n");
    expect(text).toContain("call get_day first");
    expect(text).toContain("ONE single-select question per set");
    expect(text).toContain('NEVER use the phrase "top set"');
    expect(text).toContain("ONCE per exercise (or once per superset pair)");
    expect(text).toContain("After EACH exercise/superset");
    expect(text).toContain("cardio/HR-zone comparison");
    expect(text).toContain("Worked example");
  });
});
