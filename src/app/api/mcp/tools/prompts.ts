import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * workout-logging — the canonical workout logging protocol as an MCP prompt.
 *
 * This is the full doc; the tool descriptions on get_day / log_workout /
 * get_history / save_day / manage_exercise carry condensed copies because
 * some clients (claude.ai) do not auto-inject MCP prompts into context.
 * Keep this text and those descriptions in sync: the prompt is the canonical
 * doc, the descriptions are the enforcement layer.
 */
const WORKOUT_LOGGING_PROTOCOL = `# Workout Logging Protocol

- Session start: call get_day first. Show notes + today's plan. Then a baseline pain panel (multiple-choice body parts from the last 7 days of logs + today's notes) BEFORE any sets. Save via save_day.
- Set entry: ONE single-select question per set. Options are weight×reps derived from the user's actual previous session of that exercise, shown inline as "(prev: 45, 50, 50)". NEVER use the phrase "top set" or ask for a whole session at once.
- Batching: do NOT call log_workout per set. Hold answered sets and call it ONCE per exercise (or once per superset pair) when the user says done. Note superset pairings and PRs in set notes.
- After EACH exercise/superset: a short pain panel scoped to the body sites that exercise loads, plus any site flagged at baseline. Append to notes via save_day.
- Session end: summary of all sets, cardio/HR-zone comparison vs the most recent session of the same activity (get_history), then mark the activity complete.

## Worked example — one superset round (Incline DB Press + Chest-Supported Row)

1. get_history Mode B for both exercises → previous session: Incline DB Press 45×10, 50×8, 50×8; Chest-Supported Row 90×12, 100×10, 100×10.
2. Ask ONE single-select question: "Incline DB Press — set 1? (prev: 45, 50, 50)" with options like 45×10 / 50×8 / 50×10 / other.
3. After the answer, ask the paired exercise's set: "Chest-Supported Row — set 1? (prev: 90, 100, 100)".
4. Alternate one question at a time until the user says they are done with the superset. Do NOT call log_workout yet.
5. On "done": ONE log_workout call containing all sets of both exercises. Set notes record the pairing and any PR, e.g. "superset w/ Chest-Supported Row" and "50×10 — PR, prev best 50×8".
6. Immediately run a short pain panel scoped to the sites this superset loads (e.g. shoulders, chest, elbows, upper back) plus any baseline-flagged site, and append the result to today's notes via save_day (append mode).
`;

export function registerPrompts(server: McpServer) {
  server.registerPrompt(
    "workout-logging",
    {
      title: "Workout Logging Protocol",
      description:
        "The full workout logging session protocol: baseline pain panel before any sets, one single-select question per set with (prev: ...) options from get_history, one log_workout call per exercise/superset, a pain panel after each block, and an end-of-session summary with cardio comparison.",
    },
    async () => ({
      messages: [
        {
          role: "user" as const,
          content: { type: "text" as const, text: WORKOUT_LOGGING_PROTOCOL },
        },
      ],
    }),
  );
}
