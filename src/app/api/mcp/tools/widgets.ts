import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dateSchema, uuidSchema, safeErrorMessage } from "../validation";

/**
 * manage_widget — widget admin (list/create/delete/add_option/remove_option).
 * log_widget — log a widget value for a date (kept separate because it's
 * high-frequency and semantically distinct from admin).
 * delete_widget_value — delete a single logged widget value.
 */
export function registerWidgetTools(
  server: McpServer,
  client: SupabaseClient,
  userId: string,
) {
  server.tool(
    "manage_widget",
    'Widget admin. action="list" returns all widgets (presets + user). "create" requires name + type (slider|counter|boolean|text|select); optional config, scope (daily|activity|global), activity_filter. "delete" requires id (user-owned only). "add_option" / "remove_option" modify a select widget\'s options array (auto-forks preset widgets into a personal copy on first edit).',
    {
      action: z
        .enum(["list", "create", "delete", "add_option", "remove_option"])
        .describe("Widget admin action"),
      id: uuidSchema.optional().describe("Widget id (for delete/add_option/remove_option)"),
      name: z.string().max(100).optional(),
      type: z
        .enum(["slider", "counter", "boolean", "text", "select"])
        .optional(),
      config: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Type-specific config. slider/counter: {min,max,step,unit}. text: {placeholder}. select: {options:string[]}."),
      scope: z
        .enum(["daily", "activity", "global"])
        .optional()
        .describe("When to show this widget. Default: daily"),
      activity_filter: z
        .array(z.string())
        .optional()
        .describe("Activity codes this widget applies to (only for scope=activity)"),
      option: z
        .string()
        .max(200)
        .optional()
        .describe("Option string (for add_option/remove_option)"),
    },
    async ({ action, id, name, type, config, scope, activity_filter, option }) => {
      if (action === "list") {
        const { data, error } = await client
          .from("widget_definitions")
          .select("*")
          .or(`user_id.is.null,user_id.eq.${userId}`)
          .order("sort_order");

        if (error) {
          return {
            content: [{ type: "text" as const, text: safeErrorMessage(error) }],
          };
        }
        if (!data || data.length === 0) {
          return {
            content: [{ type: "text" as const, text: "No widgets available." }],
          };
        }
        const widgets = data.map((w: Record<string, unknown>) => ({
          id: w.id,
          name: w.name,
          type: w.type,
          config: w.config,
          scope: w.scope,
          activity_filter: w.activity_filter,
          preset: w.preset,
        }));
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(widgets, null, 2) },
          ],
        };
      }

      if (action === "create") {
        if (!name || !type) {
          return {
            content: [
              {
                type: "text" as const,
                text: "action=create requires name and type.",
              },
            ],
          };
        }
        const { data, error } = await client
          .from("widget_definitions")
          .insert({
            user_id: userId,
            name,
            type,
            config: config ?? {},
            scope: scope ?? "daily",
            activity_filter: activity_filter ?? null,
          })
          .select("id")
          .single();
        if (error) {
          return {
            content: [{ type: "text" as const, text: safeErrorMessage(error) }],
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: `Created widget "${name}" (${type}, id: ${data.id})`,
            },
          ],
        };
      }

      if (action === "delete") {
        if (!id) {
          return {
            content: [
              { type: "text" as const, text: "action=delete requires id." },
            ],
          };
        }
        const { error } = await client
          .from("widget_definitions")
          .delete()
          .eq("id", id)
          .eq("user_id", userId);
        if (error) {
          return {
            content: [{ type: "text" as const, text: safeErrorMessage(error) }],
          };
        }
        return {
          content: [{ type: "text" as const, text: `Widget ${id} deleted.` }],
        };
      }

      if (action === "add_option" || action === "remove_option") {
        if (!id || !option) {
          return {
            content: [
              {
                type: "text" as const,
                text: `action=${action} requires id and option.`,
              },
            ],
          };
        }

        const { data: widget, error: fetchErr } = await client
          .from("widget_definitions")
          .select("id, type, config, user_id, name, scope, activity_filter, sort_order")
          .or(`user_id.is.null,user_id.eq.${userId}`)
          .eq("id", id)
          .single();
        if (fetchErr || !widget) {
          return {
            content: [{ type: "text" as const, text: "Widget not found." }],
          };
        }
        if (widget.type !== "select") {
          return {
            content: [
              { type: "text" as const, text: "Widget is not a select type." },
            ],
          };
        }

        const widgetConfig = (widget.config ?? {}) as Record<string, unknown>;
        let options = Array.isArray(widgetConfig.options)
          ? [...(widgetConfig.options as string[])]
          : [];

        if (action === "add_option") {
          if (options.includes(option)) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `"${option}" already exists in the list.`,
                },
              ],
            };
          }
          options.push(option);
        } else {
          options = options.filter((o: string) => o !== option);
        }
        widgetConfig.options = options;

        // Preset widgets: user can't modify — fork into a personal copy
        if (widget.user_id === null) {
          if (action === "remove_option") {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Cannot remove options from a preset widget. Create a personal copy first by adding an option, then remove from that copy.",
                },
              ],
            };
          }
          const { data: copy, error: copyErr } = await client
            .from("widget_definitions")
            .insert({
              user_id: userId,
              name: widget.name,
              type: widget.type,
              config: widgetConfig,
              scope: widget.scope,
              activity_filter: widget.activity_filter,
              sort_order: widget.sort_order,
            })
            .select("id")
            .single();
          if (copyErr) {
            return {
              content: [
                { type: "text" as const, text: safeErrorMessage(copyErr) },
              ],
            };
          }
          return {
            content: [
              {
                type: "text" as const,
                text: `Added "${option}". Created personal copy of preset widget (new id: ${copy.id}).`,
              },
            ],
          };
        }

        const { error: updateErr } = await client
          .from("widget_definitions")
          .update({ config: widgetConfig })
          .eq("id", id)
          .eq("user_id", userId);
        if (updateErr) {
          return {
            content: [{ type: "text" as const, text: safeErrorMessage(updateErr) }],
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text:
                action === "add_option"
                  ? `Added "${option}" to widget options.`
                  : `Removed "${option}" from widget options.`,
            },
          ],
        };
      }

      return {
        content: [{ type: "text" as const, text: `Unknown action: ${action}` }],
      };
    },
  );

  server.tool(
    "log_widget",
    "Log a widget value for a date. For activity-scoped widgets, provide activity_type. Value type depends on widget: slider/counter → number, boolean → true/false, text → string, select → string (must be one of the widget's options).",
    {
      widget_id: uuidSchema.describe("Widget ID"),
      date: dateSchema.describe("Date in YYYY-MM-DD format"),
      value: z
        .unknown()
        .describe("The value to log. Type depends on widget type."),
      activity_type: z
        .string()
        .max(50)
        .optional()
        .describe("Activity code (required for activity-scoped widgets)"),
    },
    async ({ widget_id, date, value, activity_type }) => {
      const { data: widget, error: fetchErr } = await client
        .from("widget_definitions")
        .select("type, config, scope")
        .or(`user_id.is.null,user_id.eq.${userId}`)
        .eq("id", widget_id)
        .single();
      if (fetchErr || !widget) {
        return {
          content: [{ type: "text" as const, text: "Widget not found." }],
        };
      }

      if (widget.scope === "activity" && !activity_type) {
        return {
          content: [
            {
              type: "text" as const,
              text: "activity_type is required for activity-scoped widgets.",
            },
          ],
        };
      }

      const widgetConfig = (widget.config ?? {}) as Record<string, unknown>;
      switch (widget.type) {
        case "slider":
        case "counter": {
          if (typeof value !== "number") {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Expected a number for ${widget.type} widget.`,
                },
              ],
            };
          }
          const min = typeof widgetConfig.min === "number" ? widgetConfig.min : -Infinity;
          const max = typeof widgetConfig.max === "number" ? widgetConfig.max : Infinity;
          if (value < min || value > max) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Value must be between ${min} and ${max}.`,
                },
              ],
            };
          }
          break;
        }
        case "boolean":
          if (typeof value !== "boolean") {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Expected true or false for boolean widget.",
                },
              ],
            };
          }
          break;
        case "text":
          if (typeof value !== "string") {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Expected a string for text widget.",
                },
              ],
            };
          }
          if ((value as string).length > 5000) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Text value must be under 5000 characters.",
                },
              ],
            };
          }
          break;
        case "select": {
          if (typeof value !== "string") {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Expected a string for select widget.",
                },
              ],
            };
          }
          const options = Array.isArray(widgetConfig.options)
            ? (widgetConfig.options as string[])
            : [];
          if (options.length > 0 && !options.includes(value)) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Invalid option "${value}". Valid options: ${options.join(", ")}`,
                },
              ],
            };
          }
          break;
        }
      }

      const normalizedActivity = activity_type ?? null;
      let updateQuery = client
        .from("widget_values")
        .update({ value, updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("widget_id", widget_id)
        .eq("date", date);
      if (normalizedActivity) {
        updateQuery = updateQuery.eq("activity_type", normalizedActivity);
      } else {
        updateQuery = updateQuery.is("activity_type", null);
      }
      const { data: updated, error: updateErr } = await updateQuery.select("id");
      if (updateErr) {
        return {
          content: [{ type: "text" as const, text: safeErrorMessage(updateErr) }],
        };
      }

      if (!updated || updated.length === 0) {
        const { error: insertErr } = await client.from("widget_values").insert({
          user_id: userId,
          widget_id,
          date,
          activity_type: normalizedActivity,
          value,
          updated_at: new Date().toISOString(),
        });
        if (insertErr) {
          return {
            content: [{ type: "text" as const, text: safeErrorMessage(insertErr) }],
          };
        }
      }

      return {
        content: [{ type: "text" as const, text: `Widget value saved for ${date}.` }],
      };
    },
  );

  server.tool(
    "delete_widget_value",
    "Delete a logged widget value for a date.",
    {
      widget_id: uuidSchema.describe("Widget ID"),
      date: dateSchema.describe("Date in YYYY-MM-DD format"),
      activity_type: z
        .string()
        .max(50)
        .optional()
        .describe("Activity code (if activity-scoped)"),
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
      if (error) {
        return {
          content: [{ type: "text" as const, text: safeErrorMessage(error) }],
        };
      }
      return {
        content: [{ type: "text" as const, text: "Widget value deleted." }],
      };
    },
  );
}
