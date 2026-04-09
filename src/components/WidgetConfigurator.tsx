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
    text: "bg-yellow-100 text-yellow-700",
    select: "bg-orange-100 text-orange-700",
  };
  return colors[type] ?? "bg-gray-100 text-gray-700";
}

export default function WidgetConfigurator({ userId }: { userId: string }) {
  const { widgets, loading, create, remove } = useWidgets(userId);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Widgets</h3>
        <p className="text-sm text-gray-500">
          Custom trackers that appear on your daily log.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading widgets...</p>
      ) : widgets.length === 0 ? (
        <p className="text-sm text-gray-400">No widgets configured.</p>
      ) : (
        <div className="space-y-2">
          {widgets.map((w) => (
            <div
              key={w.id}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
            >
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-gray-900">{w.name}</p>
                <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${typeBadge(w.type)}`}>
                  {w.type}
                </span>
                {w.scope !== "daily" && (
                  <span className="text-[10px] text-gray-400">{w.scope}</span>
                )}
              </div>
              {w.preset ? (
                <span className="text-xs text-gray-400">Preset</span>
              ) : (
                <button
                  onClick={() => remove(w.id)}
                  className="px-3 py-1 text-sm text-red-600 hover:text-red-700 hover:bg-red-50
                             rounded transition-colors"
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
          className="w-full py-3 border-2 border-dashed border-gray-300 text-gray-500
                     rounded-2xl text-sm font-medium hover:border-gray-400 hover:text-gray-700
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
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm p-4 space-y-4">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Widget name"
        required
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900
                   focus:outline-none focus:ring-2 focus:ring-gray-900"
      />

      {/* Type selector */}
      <div>
        <label className="block text-xs text-gray-500 mb-1.5">Type</label>
        <div className="flex flex-wrap gap-1.5">
          {WIDGET_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setType(t.value)}
              className={`px-3 py-1 text-xs rounded-full transition-colors ${
                type === t.value
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
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
            <label className="block text-xs text-gray-500 mb-1">Min</label>
            <input type="number" value={min} onChange={(e) => setMin(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900
                         focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Max</label>
            <input type="number" value={max} onChange={(e) => setMax(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900
                         focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Step</label>
            <input type="number" value={step} onChange={(e) => setStep(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900
                         focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
          <div className="col-span-3">
            <label className="block text-xs text-gray-500 mb-1">Unit (optional)</label>
            <input type="text" value={unit} onChange={(e) => setUnit(e.target.value)}
              placeholder="e.g. hours, lbs"
              className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900
                         focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
        </div>
      )}

      {type === "text" && (
        <div>
          <label className="block text-xs text-gray-500 mb-1">Placeholder (optional)</label>
          <input type="text" value={placeholder} onChange={(e) => setPlaceholder(e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900
                       focus:outline-none focus:ring-2 focus:ring-gray-900" />
        </div>
      )}

      {type === "select" && (
        <div className="space-y-2">
          <label className="block text-xs text-gray-500">Options</label>
          {options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-sm text-gray-700 flex-1">{opt}</span>
              <button type="button" onClick={() => setOptions(options.filter((_, j) => j !== i))}
                className="text-xs text-red-400 hover:text-red-600 transition-colors">
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
              className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900
                         focus:outline-none focus:ring-2 focus:ring-gray-900" />
            <button type="button"
              onClick={() => { if (newOption.trim()) { setOptions([...options, newOption.trim()]); setNewOption(""); } }}
              className="px-3 py-1.5 bg-gray-100 text-gray-700 text-xs rounded-lg hover:bg-gray-200 transition-colors">
              Add
            </button>
          </div>
        </div>
      )}

      {/* Scope selector */}
      <div>
        <label className="block text-xs text-gray-500 mb-1.5">Scope</label>
        <div className="flex gap-1.5">
          {SCOPE_OPTIONS.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setScope(s.value)}
              className={`px-3 py-1 text-xs rounded-full transition-colors ${
                scope === s.value
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button type="submit" disabled={saving}
          className="flex-1 py-2.5 bg-gray-900 text-white rounded-lg font-medium
                     hover:bg-gray-800 disabled:opacity-50 transition-colors">
          {saving ? "Creating..." : "Create widget"}
        </button>
        <button type="button" onClick={onCancel}
          className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium
                     hover:bg-gray-50 transition-colors">
          Cancel
        </button>
      </div>
    </form>
  );
}
