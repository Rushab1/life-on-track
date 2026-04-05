import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dateSchema, uuidSchema, safeErrorMessage } from "../validation";

export function registerWidgetTools(server: McpServer, client: SupabaseClient, userId: string) {

  // --- Widget definitions ---

  server.tool(
    "get_widgets",
    "List all available widgets (presets + user-created). Widgets are configurable trackers that can be attached to daily logs or specific activities. Types: slider (numeric range), counter (numeric input), boolean (toggle), text (freeform), select (dropdown with user-managed options).",
    {},
    async () => {
      const { data, error } = await client
        .from("widget_definitions")
        .select("*")
        .or(`user_id.is.null,user_id.eq.${userId}`)
        .order("sort_order");

      if (error) return { content: [{ type: "text" as const, text: safeErrorMessage(error) }] };
      if (!data || data.length === 0) return { content: [{ type: "text" as const, text: "No widgets available." }] };

      const widgets = data.map((w: Record<string, unknown>) => ({
        id: w.id, name: w.name, type: w.type, config: w.config,
        scope: w.scope, activity_filter: w.activity_filter,
        preset: w.preset,
      }));
      return { content: [{ type: "text" as const, text: JSON.stringify(widgets, null, 2) }] };
    }
  );

  server.tool(
    "create_widget",
    "Create a custom widget. Types: slider (needs min/max/step in config), counter (needs min/max/step/unit), boolean, text (optional placeholder in config), select (needs options array in config). Scope: 'daily' (shows every day), 'activity' (shows on specific activities — set activity_filter), 'global' (always available).",
    {
      name: z.string().max(100).describe("Widget name"),
      type: z.enum(["slider", "counter", "boolean", "text", "select"]).describe("Widget type"),
      config: z.record(z.string(), z.unknown()).optional().describe("Type-specific config. Slider/counter: {min, max, step, unit}. Text: {placeholder}. Select: {options: string[]}"),
      scope: z.enum(["daily", "activity", "global"]).optional().describe("When to show this widget. Default: daily"),
      activity_filter: z.array(z.string()).optional().describe("Activity codes this widget applies to (only for scope=activity)"),
    },
    async ({ name, type, config, scope, activity_filter }) => {
      const { data, error } = await client.from("widget_definitions").insert({
        user_id: userId,
        name,
        type,
        config: config ?? {},
        scope: scope ?? "daily",
        activity_filter: activity_filter ?? null,
      }).select("id").single();

      if (error) return { content: [{ type: "text" as const, text: safeErrorMessage(error) }] };
      return { content: [{ type: "text" as const, text: `Created widget "${name}" (${type}, id: ${data.id})` }] };
    }
  );

  server.tool(
    "delete_widget",
    "Delete a user-created widget. Cannot delete preset widgets.",
    { id: uuidSchema.describe("Widget ID") },
    async ({ id }) => {
      const { error } = await client
        .from("widget_definitions")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);

      if (error) return { content: [{ type: "text" as const, text: safeErrorMessage(error) }] };
      return { content: [{ type: "text" as const, text: `Widget ${id} deleted.` }] };
    }
  );

  // --- Select widget option management ---

  server.tool(
    "add_select_option",
    "Add a new option to a select-type widget's dropdown list.",
    {
      widget_id: uuidSchema.describe("Widget ID (must be a select-type widget)"),
      option: z.string().max(200).describe("New option to add"),
    },
    async ({ widget_id, option }) => {
      // Fetch current widget
      const { data: widget, error: fetchErr } = await client
        .from("widget_definitions")
        .select("id, type, config, user_id")
        .or(`user_id.is.null,user_id.eq.${userId}`)
        .eq("id", widget_id)
        .single();

      if (fetchErr || !widget) return { content: [{ type: "text" as const, text: "Widget not found." }] };
      if (widget.type !== "select") return { content: [{ type: "text" as const, text: "Widget is not a select type." }] };

      const config = (widget.config ?? {}) as Record<string, unknown>;
      const options = Array.isArray(config.options) ? [...config.options] : [];

      if (options.includes(option)) {
        return { content: [{ type: "text" as const, text: `"${option}" already exists in the list.` }] };
      }

      options.push(option);
      config.options = options;

      // Preset widgets: user can't modify directly — create a user copy
      if (widget.user_id === null) {
        const { data: copy, error: copyErr } = await client.from("widget_definitions").insert({
          user_id: userId,
          name: (widget as Record<string, unknown>).name,
          type: widget.type,
          config,
          scope: (widget as Record<string, unknown>).scope,
          activity_filter: (widget as Record<string, unknown>).activity_filter,
        }).select("id").single();

        if (copyErr) return { content: [{ type: "text" as const, text: safeErrorMessage(copyErr) }] };
        return { content: [{ type: "text" as const, text: `Added "${option}". Created personal copy of preset widget (new id: ${copy.id}).` }] };
      }

      const { error: updateErr } = await client
        .from("widget_definitions")
        .update({ config })
        .eq("id", widget_id)
        .eq("user_id", userId);

      if (updateErr) return { content: [{ type: "text" as const, text: safeErrorMessage(updateErr) }] };
      return { content: [{ type: "text" as const, text: `Added "${option}" to widget options.` }] };
    }
  );

  server.tool(
    "remove_select_option",
    "Remove an option from a select-type widget's dropdown list.",
    {
      widget_id: uuidSchema.describe("Widget ID (must be a select-type widget you own)"),
      option: z.string().max(200).describe("Option to remove"),
    },
    async ({ widget_id, option }) => {
      const { data: widget, error: fetchErr } = await client
        .from("widget_definitions")
        .select("id, type, config")
        .eq("id", widget_id)
        .eq("user_id", userId)
        .single();

      if (fetchErr || !widget) return { content: [{ type: "text" as const, text: "Widget not found or not yours." }] };
      if (widget.type !== "select") return { content: [{ type: "text" as const, text: "Widget is not a select type." }] };

      const config = (widget.config ?? {}) as Record<string, unknown>;
      const options = Array.isArray(config.options) ? config.options.filter((o: string) => o !== option) : [];
      config.options = options;

      const { error: updateErr } = await client
        .from("widget_definitions")
        .update({ config })
        .eq("id", widget_id)
        .eq("user_id", userId);

      if (updateErr) return { content: [{ type: "text" as const, text: safeErrorMessage(updateErr) }] };
      return { content: [{ type: "text" as const, text: `Removed "${option}" from widget options.` }] };
    }
  );

  // --- Widget values ---

  server.tool(
    "log_widget",
    "Log a widget value for a date. For activity-scoped widgets, provide activity_type. Value type depends on widget: slider/counter → number, boolean → true/false, text → string, select → string (must be one of the widget's options).",
    {
      widget_id: uuidSchema.describe("Widget ID"),
      date: dateSchema.describe("Date in YYYY-MM-DD format"),
      value: z.unknown().describe("The value to log. Type depends on widget type."),
      activity_type: z.string().max(50).optional().describe("Activity code (required for activity-scoped widgets)"),
    },
    async ({ widget_id, date, value, activity_type }) => {
      const { error } = await client.from("widget_values").upsert(
        {
          user_id: userId,
          widget_id,
          date,
          activity_type: activity_type ?? null,
          value,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,widget_id,date,activity_type" },
      );

      if (error) return { content: [{ type: "text" as const, text: safeErrorMessage(error) }] };
      return { content: [{ type: "text" as const, text: `Widget value saved for ${date}.` }] };
    }
  );

  server.tool(
    "get_widget_values",
    "Get all widget values logged for a date. Returns widget name, type, and value for each logged widget.",
    {
      date: dateSchema.describe("Date in YYYY-MM-DD format"),
      activity_type: z.string().max(50).optional().describe("Filter to a specific activity"),
    },
    async ({ date, activity_type }) => {
      let query = client
        .from("widget_values")
        .select("widget_id, value, activity_type, widget_definitions(name, type, config)")
        .eq("user_id", userId)
        .eq("date", date);

      if (activity_type) {
        query = query.eq("activity_type", activity_type);
      }

      const { data, error } = await query;
      if (error) return { content: [{ type: "text" as const, text: safeErrorMessage(error) }] };
      if (!data || data.length === 0) return { content: [{ type: "text" as const, text: `No widget values for ${date}.` }] };

      const values = data.map((v: Record<string, unknown>) => {
        const def = v.widget_definitions as Record<string, unknown> | null;
        return {
          widget_id: v.widget_id,
          widget_name: def?.name ?? "Unknown",
          widget_type: def?.type,
          activity_type: v.activity_type,
          value: v.value,
        };
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(values, null, 2) }] };
    }
  );

  server.tool(
    "delete_widget_value",
    "Delete a logged widget value for a date.",
    {
      widget_id: uuidSchema.describe("Widget ID"),
      date: dateSchema.describe("Date in YYYY-MM-DD format"),
      activity_type: z.string().max(50).optional().describe("Activity code (if activity-scoped)"),
    },
    async ({ widget_id, date, activity_type }) => {
      let query = client
        .from("widget_values")
        .delete()
        .eq("user_id", userId)
        .eq("widget_id", widget_id)
        .eq("date", date);

      if (activity_type) {
        query = query.eq("activity_type", activity_type);
      } else {
        query = query.is("activity_type", null);
      }

      const { error } = await query;
      if (error) return { content: [{ type: "text" as const, text: safeErrorMessage(error) }] };
      return { content: [{ type: "text" as const, text: "Widget value deleted." }] };
    }
  );
}
