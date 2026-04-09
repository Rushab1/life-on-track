"use client";

import { useState, useMemo } from "react";
import {
  DEFAULT_GYM_SCHEDULE,
  DEFAULT_PREP_SCHEDULE,
} from "@/config/schedule";
import type { Plan, CustomTopic } from "@/lib/types";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface PlanManagerProps {
  plans: Plan[];
  gymOptions: { value: string; label: string }[];
  prepOptions: { value: string; label: string }[];
  activityLabels: Record<string, string>;
  customTopics: CustomTopic[];
  allExercises: string[];
  onAddExercise: (name: string, category?: string) => Promise<void>;
  onAddTopic: (
    category: "activity" | "gym_type",
    label: string
  ) => Promise<void>;
  onRemoveTopic: (id: string) => Promise<void>;
  onCreate: (plan: {
    name: string;
    start_date: string;
    end_date: string;
    gym_schedule: Record<string, string>;
    prep_schedule: Record<string, string[]>;
    workout_templates: Record<string, string[]>;
  }) => Promise<void>;
  onUpdate: (
    id: string,
    updates: Partial<{
      name: string;
      start_date: string;
      end_date: string;
      gym_schedule: Record<string, string>;
      prep_schedule: Record<string, string[]>;
      workout_templates: Record<string, string[]>;
    }>
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export default function PlanManager({
  plans,
  gymOptions,
  prepOptions,
  activityLabels,
  customTopics,
  allExercises,
  onAddExercise,
  onAddTopic,
  onRemoveTopic,
  onCreate,
  onUpdate,
  onDelete,
}: PlanManagerProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showManage, setShowManage] = useState(false);

  return (
    <div className="space-y-4">
      {/* Existing plans */}
      {plans.map((plan) => (
        <div key={plan.id}>
          {editing === plan.id ? (
            <PlanForm
              initial={plan}
              gymOptions={gymOptions}
              prepOptions={prepOptions}
              allExercises={allExercises}
              onAddTopic={onAddTopic}
              onAddExercise={onAddExercise}
              onSave={async (data) => {
                await onUpdate(plan.id, data);
                setEditing(null);
              }}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-medium text-gray-900">{plan.name}</h3>
                  <p className="text-xs text-gray-500">
                    {plan.start_date} to {plan.end_date}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditing(plan.id)}
                    className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    Edit
                  </button>
                  {deleteConfirm === plan.id ? (
                    <div className="flex gap-1">
                      <button
                        onClick={async () => {
                          await onDelete(plan.id);
                          setDeleteConfirm(null);
                        }}
                        className="text-xs text-red-600 font-medium"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        className="text-xs text-gray-500"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirm(plan.id)}
                      className="text-xs text-red-500 hover:text-red-700 transition-colors"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
              {/* Summary */}
              <div className="grid grid-cols-7 gap-1 mt-3">
                {DAY_NAMES.map((day, i) => {
                  const gym = plan.gym_schedule[String(i)] ?? "rst";
                  const prep = plan.prep_schedule[String(i)] ?? [];
                  return (
                    <div key={i} className="text-center">
                      <p className="text-[10px] font-medium text-gray-400 mb-0.5">
                        {day}
                      </p>
                      <p className="text-[10px] text-gray-700">
                        {activityLabels[gym] ?? gym}
                      </p>
                      {prep.map((a: string) => (
                        <p key={a} className="text-[10px] text-gray-400">
                          {activityLabels[a] ?? a}
                        </p>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Create new plan */}
      {editing === "new" ? (
        <PlanForm
          gymOptions={gymOptions}
          prepOptions={prepOptions}
          allExercises={allExercises}
          onAddTopic={onAddTopic}
          onAddExercise={onAddExercise}
          onSave={async (data) => {
            await onCreate(data);
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <button
          onClick={() => setEditing("new")}
          className="w-full py-3 border-2 border-dashed border-gray-300 text-gray-500 rounded-2xl text-sm font-medium hover:border-gray-400 hover:text-gray-700 transition-colors"
        >
          + Create new plan
        </button>
      )}

      {/* Manage custom topics */}
      {customTopics.length > 0 && (
        <div>
          <button
            onClick={() => setShowManage(!showManage)}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            {showManage ? "Hide" : "Manage"} custom topics (
            {customTopics.length})
          </button>
          {showManage && (
            <div className="mt-2 bg-white rounded-2xl shadow-sm p-4 space-y-2">
              {customTopics.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between"
                >
                  <div>
                    <span className="text-sm text-gray-700">{t.label}</span>
                    <span className="text-xs text-gray-400 ml-2">
                      {t.category === "gym_type" ? "workout" : t.category}
                    </span>
                  </div>
                  <button
                    onClick={() => onRemoveTopic(t.id)}
                    className="text-xs text-red-400 hover:text-red-600 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Reusable form for creating / editing a plan. */
function PlanForm({
  initial,
  gymOptions,
  prepOptions,
  allExercises,
  onAddTopic,
  onAddExercise,
  onSave,
  onCancel,
}: {
  initial?: Plan;
  gymOptions: { value: string; label: string }[];
  prepOptions: { value: string; label: string }[];
  allExercises: string[];
  onAddTopic: (
    category: "activity" | "gym_type",
    label: string
  ) => Promise<void>;
  onAddExercise: (name: string, category?: string) => Promise<void>;
  onSave: (data: {
    name: string;
    start_date: string;
    end_date: string;
    gym_schedule: Record<string, string>;
    prep_schedule: Record<string, string[]>;
    workout_templates: Record<string, string[]>;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [startDate, setStartDate] = useState(initial?.start_date ?? "");
  const [endDate, setEndDate] = useState(initial?.end_date ?? "");
  const [gymSchedule, setGymSchedule] = useState<Record<string, string>>(
    initial?.gym_schedule ?? { ...DEFAULT_GYM_SCHEDULE }
  );
  const [prepSchedule, setPrepSchedule] = useState<Record<string, string[]>>(
    initial?.prep_schedule ?? JSON.parse(JSON.stringify(DEFAULT_PREP_SCHEDULE))
  );
  const [workoutTemplates, setWorkoutTemplates] = useState<
    Record<string, string[]>
  >(initial?.workout_templates ?? {});
  const [saving, setSaving] = useState(false);

  const [adding, setAdding] = useState<"gym_type" | "activity" | null>(null);
  const [newLabel, setNewLabel] = useState("");

  // Gym types referenced by this plan's schedule, minus rest. These are the
  // workouts the user actually trains, so they're the ones that need
  // workout_templates.
  const trainedGymTypes = useMemo(() => {
    const seen = new Set<string>();
    for (const gym of Object.values(gymSchedule)) {
      if (gym && gym !== "rst") seen.add(gym);
    }
    return Array.from(seen);
  }, [gymSchedule]);

  function addExerciseToTemplate(gymType: string, exercise: string) {
    setWorkoutTemplates((prev) => {
      const current = prev[gymType] ?? [];
      if (current.includes(exercise)) return prev;
      return { ...prev, [gymType]: [...current, exercise] };
    });
  }

  function removeExerciseFromTemplate(gymType: string, index: number) {
    setWorkoutTemplates((prev) => {
      const current = prev[gymType] ?? [];
      const next = [...current];
      next.splice(index, 1);
      return { ...prev, [gymType]: next };
    });
  }

  function moveExercise(gymType: string, index: number, dir: -1 | 1) {
    setWorkoutTemplates((prev) => {
      const current = prev[gymType] ?? [];
      const next = [...current];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...prev, [gymType]: next };
    });
  }

  function setGym(day: string, value: string) {
    setGymSchedule((prev) => ({ ...prev, [day]: value }));
  }

  function togglePrep(day: string, activity: string) {
    setPrepSchedule((prev) => {
      const current = prev[day] ?? [];
      const next = current.includes(activity)
        ? current.filter((a) => a !== activity)
        : [...current, activity];
      return { ...prev, [day]: next };
    });
  }

  async function handleAddTopic() {
    if (!newLabel.trim() || !adding) return;
    await onAddTopic(adding, newLabel.trim());
    setNewLabel("");
    setAdding(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    // Trim templates to gym types still in the schedule so we don't carry
    // dead entries forever.
    const trimmedTemplates: Record<string, string[]> = {};
    for (const gym of trainedGymTypes) {
      trimmedTemplates[gym] = workoutTemplates[gym] ?? [];
    }
    await onSave({
      name,
      start_date: startDate,
      end_date: endDate,
      gym_schedule: gymSchedule,
      prep_schedule: prepSchedule,
      workout_templates: trimmedTemplates,
    });
    setSaving(false);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-2xl shadow-sm p-4 space-y-4"
    >
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Plan name"
        required
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
      />

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Start date
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">End date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
      </div>

      {/* Schedule builder */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-2">
          Weekly Schedule
        </h4>
        <div className="space-y-3">
          {DAY_NAMES.map((dayName, i) => {
            const day = String(i);
            return (
              <div
                key={i}
                className="border border-gray-100 rounded-lg p-3"
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-sm font-medium text-gray-700 w-10">
                    {dayName}
                  </span>
                  <select
                    value={gymSchedule[day] ?? "rst"}
                    onChange={(e) => {
                      if (e.target.value === "__add_gym__") {
                        setAdding("gym_type");
                        setNewLabel("");
                      } else {
                        setGym(day, e.target.value);
                      }
                    }}
                    className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
                  >
                    {gymOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                    <option value="__add_gym__">+ New workout type...</option>
                  </select>
                </div>
                <div className="flex flex-wrap gap-1.5 ml-[52px]">
                  {prepOptions.map((opt) => {
                    const active = (prepSchedule[day] ?? []).includes(
                      opt.value
                    );
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => togglePrep(day, opt.value)}
                        className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
                          active
                            ? "bg-gray-900 text-white"
                            : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => {
                      setAdding("activity");
                      setNewLabel("");
                    }}
                    className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-400 hover:bg-gray-200 transition-colors"
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Inline add topic form */}
        {adding && (
          <div className="flex items-center gap-2 mt-3 p-3 border border-dashed border-gray-300 rounded-lg">
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder={
                adding === "gym_type"
                  ? "New workout type name..."
                  : "New activity name..."
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddTopic();
                }
              }}
              className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
              autoFocus
            />
            <button
              type="button"
              onClick={handleAddTopic}
              className="px-3 py-1 bg-gray-900 text-white text-xs rounded-lg hover:bg-gray-800 transition-colors"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => setAdding(null)}
              className="px-3 py-1 text-gray-500 text-xs"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Workout templates: which exercises make up each workout type */}
      {trainedGymTypes.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">
            Workout templates
          </h4>
          <div className="space-y-3">
            {trainedGymTypes.map((gymType) => {
              const label =
                gymOptions.find((o) => o.value === gymType)?.label ?? gymType;
              const list = workoutTemplates[gymType] ?? [];
              return (
                <WorkoutTemplateEditor
                  key={gymType}
                  label={label}
                  exercises={list}
                  allExercises={allExercises}
                  onAdd={(ex) => addExerciseToTemplate(gymType, ex)}
                  onRemove={(idx) => removeExerciseFromTemplate(gymType, idx)}
                  onMove={(idx, dir) => moveExercise(gymType, idx, dir)}
                  onCreateExercise={async (newName) => {
                    await onAddExercise(newName);
                    addExerciseToTemplate(gymType, newName);
                  }}
                />
              );
            })}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 py-2.5 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving..." : initial ? "Update plan" : "Create plan"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Editable, ordered list of exercises for a single gym type. */
function WorkoutTemplateEditor({
  label,
  exercises,
  allExercises,
  onAdd,
  onRemove,
  onMove,
  onCreateExercise,
}: {
  label: string;
  exercises: string[];
  allExercises: string[];
  onAdd: (exercise: string) => void;
  onRemove: (index: number) => void;
  onMove: (index: number, dir: -1 | 1) => void;
  onCreateExercise: (name: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const available = allExercises.filter((ex) => !exercises.includes(ex));

  function handleSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    if (value === "__create__") {
      setCreating(true);
      return;
    }
    if (value) {
      onAdd(value);
      setSelected("");
    }
  }

  async function handleCreate() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    await onCreateExercise(trimmed);
    setNewName("");
    setCreating(false);
  }

  return (
    <div className="border border-gray-100 rounded-lg p-3">
      <p className="text-xs font-medium text-gray-700 mb-2">{label}</p>
      {exercises.length === 0 ? (
        <p className="text-xs text-gray-400 mb-2">No exercises yet</p>
      ) : (
        <ul className="space-y-1 mb-2">
          {exercises.map((ex, i) => (
            <li
              key={`${ex}-${i}`}
              className="flex items-center gap-1 text-sm text-gray-700"
            >
              <span className="flex-1 truncate">{ex}</span>
              <button
                type="button"
                onClick={() => onMove(i, -1)}
                disabled={i === 0}
                className="px-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                aria-label="Move up"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => onMove(i, 1)}
                disabled={i === exercises.length - 1}
                className="px-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                aria-label="Move down"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="px-1.5 text-gray-400 hover:text-red-500"
                aria-label="Remove"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {creating ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New exercise name..."
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleCreate();
              }
            }}
            className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
            autoFocus
          />
          <button
            type="button"
            onClick={handleCreate}
            className="px-3 py-1 bg-gray-900 text-white text-xs rounded-lg hover:bg-gray-800 transition-colors"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => {
              setCreating(false);
              setNewName("");
            }}
            className="px-3 py-1 text-gray-500 text-xs"
          >
            Cancel
          </button>
        </div>
      ) : (
        <select
          value={selected}
          onChange={handleSelect}
          className="w-full px-2 py-1 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          <option value="">+ Add exercise...</option>
          {available.map((ex) => (
            <option key={ex} value={ex}>
              {ex}
            </option>
          ))}
          <option value="__create__">+ Create new exercise...</option>
        </select>
      )}
    </div>
  );
}
