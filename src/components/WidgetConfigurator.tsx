"use client";

import { useState } from "react";
import { useWidgets } from "@/hooks/useWidgets";
import type { WidgetDefinition } from "@/lib/types";

const WIDGET_TYPES: { value: WidgetDefinition["type"]; label: string }[] = [
  { value: "slider", label: "Slider" },
  { value: "counter", label: "Counter" },
  { value: "boolean", label: "Toggle" },
  { value: "text", label: "Text" },
  { value: "select", label: "Select" },
];

const SCOPE_OPTIONS: { value: WidgetDefinition["scope"]; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "activity", label: "Activity" },
  { value: "global", label: "Global" },
];

function typeBadge(type: string) {
  const colors: Record<string, string> = {
    slider: "bg-blue-100 text-blue-700",
    counter: "bg-purple-100 text-purple-700",
    boolean: "bg-green-100 text-green-700",
    text: "bg-amber-100 text-amber-700",
    select: "bg-orange-100 text-orange-700",
  };
  return colors[type] ?? "bg-stone-100 text-stone-700";
}

export default function WidgetConfigurator({ userId }: { userId: string }) {
  const { widgets, loading, create, remove } = useWidgets(userId);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-stone-900 mb-1">Widgets</h3>
        <p className="text-sm text-stone-500">
          Custom trackers that appear on your daily log.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-stone-400">Loading widgets...</p>
      ) : widgets.length === 0 ? (
        <p className="text-sm text-stone-400">No widgets configured.</p>
      ) : (
        <div className="space-y-2">
          {widgets.map((w) => (
            <div
              key={w.id}
              className="flex items-center justify-between p-3 bg-stone-50 rounded-lg"
            >
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-stone-900">{w.name}</p>
                <span className={`badge ${typeBadge(w.type)}`}>
                  {w.type}
                </span>
                {w.scope !== "daily" && (
                  <span className="text-[10px] text-stone-400">{w.scope}</span>
                )}
              </div>
              {w.preset ? (
                <span className="text-xs text-stone-400">Preset</span>
              ) : (
                <button
                  onClick={() => remove(w.id)}
                  className="btn btn-danger-ghost text-sm px-3 py-1"
                >
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {creating ? (
        <CreateWidgetForm
          onSave={async (data) => {
            await create(data);
            setCreating(false);
          }}
          onCancel={() => setCreating(false)}
        />
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="w-full py-3 border-2 border-dashed border-stone-300 text-stone-500
                     rounded-2xl text-sm font-medium hover:border-stone-400 hover:text-stone-700
                     transition-colors"
        >
          + Create widget
        </button>
      )}
    </div>
  );
}

function CreateWidgetForm({
  onSave,
  onCancel,
}: {
  onSave: (data: {
    name: string;
    type: WidgetDefinition["type"];
    config: Record<string, unknown>;
    scope: WidgetDefinition["scope"];
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<WidgetDefinition["type"]>("slider");
  const [scope, setScope] = useState<WidgetDefinition["scope"]>("daily");
  const [saving, setSaving] = useState(false);

  // Type-specific config
  const [min, setMin] = useState("0");
  const [max, setMax] = useState("10");
  const [step, setStep] = useState("1");
  const [unit, setUnit] = useState("");
  const [placeholder, setPlaceholder] = useState("");
  const [options, setOptions] = useState<string[]>([]);
  const [newOption, setNewOption] = useState("");

  function buildConfig(): Record<string, unknown> {
    switch (type) {
      case "slider":
      case "counter":
        return {
          min: Number(min),
          max: Number(max),
          step: Number(step),
          ...(unit ? { unit } : {}),
        };
      case "text":
        return placeholder ? { placeholder } : {};
      case "select":
        return { options };
      case "boolean":
      default:
        return {};
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    await onSave({ name: name.trim(), type, config: buildConfig(), scope });
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="card p-4 space-y-4">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Widget name"
        required
        className="input"
      />

      {/* Type selector */}
      <div>
        <label className="label">Type</label>
        <div className="flex flex-wrap gap-1.5">
          {WIDGET_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setType(t.value)}
              className={`px-3 py-1 text-xs rounded-full transition-colors ${
                type === t.value
                  ? "bg-indigo-600 text-white"
                  : "bg-stone-100 text-stone-500 hover:bg-stone-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Type-specific config */}
      {(type === "slider" || type === "counter") && (
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="label">Min</label>
            <input type="number" value={min} onChange={(e) => setMin(e.target.value)}
              className="input text-sm py-1.5" />
          </div>
          <div>
            <label className="label">Max</label>
            <input type="number" value={max} onChange={(e) => setMax(e.target.value)}
              className="input text-sm py-1.5" />
          </div>
          <div>
            <label className="label">Step</label>
            <input type="number" value={step} onChange={(e) => setStep(e.target.value)}
              className="input text-sm py-1.5" />
          </div>
          <div className="col-span-3">
            <label className="label">Unit (optional)</label>
            <input type="text" value={unit} onChange={(e) => setUnit(e.target.value)}
              placeholder="e.g. hours, lbs"
              className="input text-sm py-1.5" />
          </div>
        </div>
      )}

      {type === "text" && (
        <div>
          <label className="label">Placeholder (optional)</label>
          <input type="text" value={placeholder} onChange={(e) => setPlaceholder(e.target.value)}
            className="input text-sm py-1.5" />
        </div>
      )}

      {type === "select" && (
        <div className="space-y-2">
          <label className="label mb-0">Options</label>
          {options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-sm text-stone-700 flex-1">{opt}</span>
              <button type="button" onClick={() => setOptions(options.filter((_, j) => j !== i))}
                className="btn btn-danger-ghost text-xs px-2 py-1">
                Remove
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <input type="text" value={newOption} onChange={(e) => setNewOption(e.target.value)}
              placeholder="Add option..."
              onKeyDown={(e) => {
                if (e.key === "Enter" && newOption.trim()) {
                  e.preventDefault();
                  setOptions([...options, newOption.trim()]);
                  setNewOption("");
                }
              }}
              className="input flex-1 text-sm py-1.5" />
            <button type="button"
              onClick={() => { if (newOption.trim()) { setOptions([...options, newOption.trim()]); setNewOption(""); } }}
              className="btn btn-secondary text-xs px-3 py-1.5">
              Add
            </button>
          </div>
        </div>
      )}

      {/* Scope selector */}
      <div>
        <label className="label">Scope</label>
        <div className="flex gap-1.5">
          {SCOPE_OPTIONS.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setScope(s.value)}
              className={`px-3 py-1 text-xs rounded-full transition-colors ${
                scope === s.value
                  ? "bg-indigo-600 text-white"
                  : "bg-stone-100 text-stone-500 hover:bg-stone-200"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button type="submit" disabled={saving}
          className="btn btn-primary flex-1 py-2.5">
          {saving ? "Creating..." : "Create widget"}
        </button>
        <button type="button" onClick={onCancel}
          className="btn btn-secondary flex-1 py-2.5">
          Cancel
        </button>
      </div>
    </form>
  );
}
