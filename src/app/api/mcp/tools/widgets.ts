import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dateSchema, uuidSchema, safeErrorMessage } from "../validation";
import { widgetSites } from "@/lib/widgets";

/**
 * activity_type and site are two names for one column (see lib/widgets). Both
 * given with different values means the caller is confused about which row it
 * wants, so say so rather than silently picking one.
 */
function conflictingSubject(activityType?: string, site?: string) {
  if (activityType && site && activityType !== site) {
    return {
      content: [
        {
          type: "text" as const,
          text: `activity_type ("${activityType}") and site ("${site}") both given and differ — they are the same field. Pass just one.`,
        },
      ],
    };
  }
  return null;
}

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
    'Widget admin. action="list" returns all widgets (presets + user). "create" requires name + type (slider|counter|boolean|text|select); optional config, scope (daily|activity|global|sites), activity_filter. scope="sites" logs one value per body site per day (config.sites lists them) so a 4 at the kneecap stays distinct from a 4 at the ankle — pass the site to log_widget. "delete" requires id (user-owned only). "add_option" / "remove_option" modify a select widget\'s options array, or a sites-scoped widget\'s site list (auto-forks preset widgets into a personal copy on first edit).',
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
        .describe("Type-specific config. slider/counter: {min,max,step,unit}. text: {placeholder}. select: {options:string[]}. Plus {sites:string[]} for scope=sites."),
      scope: z
        .enum(["daily", "activity", "global", "sites"])
        .optional()
        .describe("When to show this widget. Default: daily. sites = one value per body site per day."),
      activity_filter: z
        .array(z.string())
        .optional()
        .describe("Activity codes this widget applies to (only for scope=activity)"),
      option: z
        .string()
        .max(200)
        .optional()
        .describe(
          "For add_option/remove_option: a select widget's option, or a sites-scoped widget's site name.",
        ),
      site: z
        .string()
        .max(50)
        .optional()
        .describe("Alias for `option` when editing a sites-scoped widget's site list."),
    },
    async ({ action, id, name, type, config, scope, activity_filter, option, site }) => {
      const entry = option ?? site;
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
        if (scope === "sites" && widgetSites({ scope, config: config ?? {} }).length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: 'scope="sites" requires config.sites — a non-empty array of site names, e.g. {"sites":["kneecap","ankle","ITB"]}.',
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
        if (!id || !entry) {
          return {
            content: [
              {
                type: "text" as const,
                text: `action=${action} requires id and option (or site).`,
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
        // A sites-scoped widget keeps its list in config.sites whatever its
        // control type; only select widgets keep one in config.options.
        const isSites = widget.scope === "sites";
        if (!isSites && widget.type !== "select") {
          return {
            content: [
              {
                type: "text" as const,
                text: "Widget has no editable list: it is neither a select type nor sites-scoped.",
              },
            ],
          };
        }
        const listKey = isSites ? "sites" : "options";

        const widgetConfig = (widget.config ?? {}) as Record<string, unknown>;
        let list = Array.isArray(widgetConfig[listKey])
          ? [...(widgetConfig[listKey] as string[])]
          : [];

        if (action === "add_option") {
          if (list.includes(entry)) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `"${entry}" already exists in the list.`,
                },
              ],
            };
          }
          list.push(entry);
        } else {
          if (isSites && list.length === 1 && list[0] === entry) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Cannot remove the last site — a sites-scoped widget needs at least one. Delete the widget instead.",
                },
              ],
            };
          }
          list = list.filter((o: string) => o !== entry);
        }
        widgetConfig[listKey] = list;

        // Preset widgets: user can't modify — fork into a personal copy
        if (widget.user_id === null) {
          if (action === "remove_option") {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Cannot remove entries from a preset widget. Create a personal copy first by adding one, then remove from that copy.",
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
                text: `Added "${entry}". Created personal copy of preset widget (new id: ${copy.id}).`,
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
                  ? `Added "${entry}" to widget ${listKey}.`
                  : `Removed "${entry}" from widget ${listKey}.`,
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
    "Log a widget value for a date. For activity-scoped widgets, provide activity_type. For sites-scoped widgets, provide site — one value per body site per day, so call it once per site you're recording. Value type depends on widget: slider/counter → number, boolean → true/false, text → string, select → string (must be one of the widget's options).",
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
      site: z
        .string()
        .max(50)
        .optional()
        .describe(
          "Body site, one of the widget's configured sites (required for sites-scoped widgets). Stored in the same column as activity_type.",
        ),
    },
    async ({ widget_id, date, value, activity_type, site }) => {
      const subjectErr = conflictingSubject(activity_type, site);
      if (subjectErr) return subjectErr;
      const subject = site ?? activity_type ?? null;

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

      if (widget.scope === "activity" && !subject) {
        return {
          content: [
            {
              type: "text" as const,
              text: "activity_type is required for activity-scoped widgets.",
            },
          ],
        };
      }

      if (widget.scope === "sites") {
        const sites = widgetSites(widget);
        if (!subject) {
          return {
            content: [
              {
                type: "text" as const,
                text: `site is required for sites-scoped widgets. Configured sites: ${sites.join(", ")}`,
              },
            ],
          };
        }
        if (!sites.includes(subject)) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Unknown site "${subject}". Configured sites: ${sites.join(", ")}. Add it with manage_widget action="add_option".`,
              },
            ],
          };
        }
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

      let updateQuery = client
        .from("widget_values")
        .update({ value, updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("widget_id", widget_id)
        .eq("date", date);
      if (subject) {
        updateQuery = updateQuery.eq("activity_type", subject);
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
          activity_type: subject,
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
        content: [
          {
            type: "text" as const,
            text: subject
              ? `Widget value saved for ${date} (${subject}).`
              : `Widget value saved for ${date}.`,
          },
        ],
      };
    },
  );

  server.tool(
    "delete_widget_value",
    "Delete a logged widget value for a date. Deletes one row: pass activity_type (activity-scoped) or site (sites-scoped) to say which.",
    {
      widget_id: uuidSchema.describe("Widget ID"),
      date: dateSchema.describe("Date in YYYY-MM-DD format"),
      activity_type: z
        .string()
        .max(50)
        .optional()
        .describe("Activity code (if activity-scoped)"),
      site: z
        .string()
        .max(50)
        .optional()
        .describe("Body site (if sites-scoped)"),
    },
    async ({ widget_id, date, activity_type, site }) => {
      const subjectErr = conflictingSubject(activity_type, site);
      if (subjectErr) return subjectErr;
      const subject = site ?? activity_type ?? null;

      let query = client
        .from("widget_values")
        .delete()
        .eq("user_id", userId)
        .eq("widget_id", widget_id)
        .eq("date", date);
      if (subject) {
        query = query.eq("activity_type", subject);
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
