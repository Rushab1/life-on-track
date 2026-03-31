# Life on Track MCP Server

Log workouts, activities, and daily health data through Claude conversations.

## Setup

### 1. Generate a Token

1. Open the Life on Track app and sign in
2. Go to the **Settings** tab
3. Click **Generate** with a name for this device (e.g. "My Laptop")
4. Copy the token — it won't be shown again

### 2. Install

#### Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on Mac, `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "life-on-track": {
      "command": "npx",
      "args": ["life-on-track-mcp"],
      "env": {
        "LOT_SUPABASE_URL": "https://your-project.supabase.co",
        "LOT_SUPABASE_ANON_KEY": "your-anon-key",
        "LOT_MCP_TOKEN": "lot_your-token-here"
      }
    }
  }
}
```

#### Claude Code

Add to your Claude Code settings (`.claude/settings.json`):

```json
{
  "mcpServers": {
    "life-on-track": {
      "command": "npx",
      "args": ["life-on-track-mcp"],
      "env": {
        "LOT_SUPABASE_URL": "https://your-project.supabase.co",
        "LOT_SUPABASE_ANON_KEY": "your-anon-key",
        "LOT_MCP_TOKEN": "lot_your-token-here"
      }
    }
  }
}
```

## Available Tools

### Daily Logs
- **get_daily_log** — Get pain level and notes for a date
- **save_daily_log** — Save/update pain level and notes
- **delete_daily_log** — Delete a day's log

### Activities
- **get_activities** — Get completions + scheduled activities for a date
- **toggle_activity** — Toggle an activity's completion status
- **complete_activities** — Mark multiple activities as done
- **set_activity_note** — Add a note to an activity

### Workouts
- **get_workout_sets** — Get all sets logged for a date
- **log_workout_set** — Log a single exercise
- **log_workout** — Log a full workout (multiple exercises at once)
- **delete_workout_set** — Remove a logged set
- **get_last_workout** — Get previous session data for progressive overload

### Plans
- **get_plans** — List all plans
- **get_active_plan** — Get the plan for a specific date
- **create_plan** — Create a new plan with schedules
- **update_plan** — Update an existing plan
- **delete_plan** — Delete a plan

### Summaries
- **get_day_summary** — Full day overview (pain, activities, workouts, plan)
- **get_week_summary** — Aggregated stats for a date range

## Example Prompts

- "Log today's push workout: bench press 3x10 at 185, incline press 3x12 at 50"
- "Mark LeetCode and ML/AI as done today"
- "What did I do last week?"
- "Log pain level 3 with notes: lower back tight after deadlifts"
- "What were my last bench press numbers?"

## Revoking Access

Open the Life on Track app → Settings → click **Revoke** next to the token. The MCP server will stop working immediately.

## Development

```bash
cd mcp-server
npm install
npm run build
npm start
```

Test with the MCP inspector:
```bash
npx @modelcontextprotocol/inspector node dist/index.js
```
