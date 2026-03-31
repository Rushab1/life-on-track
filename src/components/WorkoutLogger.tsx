"use client";

import { useState } from "react";
import { toDateString } from "@/lib/dates";
import { getGymType } from "@/config/schedule";
import { WORKOUT_META } from "@/config/exercises";
import { useWorkoutSets } from "@/hooks/useWorkoutSets";
import { useLastWorkout } from "@/hooks/useLastWorkout";
import type { LastSetRow } from "@/hooks/useLastWorkout";
import type { Plan, WorkoutSet } from "@/lib/types";

interface WorkoutLoggerProps {
  date: Date;
  userId: string;
  plan?: Plan | null;
  exercises: string[];
  workoutExercises: Record<string, string[]>;
  gymLabel: string;
  onAddExercise: (label: string) => Promise<void>;
}

export default function WorkoutLogger({
  date,
  userId,
  plan,
  exercises,
  workoutExercises,
  gymLabel,
  onAddExercise,
}: WorkoutLoggerProps) {
  const dateStr = toDateString(date);
  const gymType = getGymType(date, plan);
  const defaultExercises = workoutExercises[gymType] ?? [];
  const meta = WORKOUT_META[gymType] ?? { warmup: [], cardio: [] };
  const { sets: loggedSets, add, update, remove } = useWorkoutSets(userId, dateStr);
  const allExercisesForHistory = [...meta.warmup, ...defaultExercises, ...meta.cardio];
  const lastSets = useLastWorkout(userId, dateStr, allExercisesForHistory);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [extraExercise, setExtraExercise] = useState("");
  const [addingExercise, setAddingExercise] = useState(false);
  const [newExerciseName, setNewExerciseName] = useState("");

  function toggleExpand(exercise: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(exercise)) next.delete(exercise);
      else next.add(exercise);
      return next;
    });
  }

  async function handleAddExercise() {
    if (!newExerciseName.trim()) return;
    await onAddExercise(newExerciseName.trim());
    setExtraExercise(newExerciseName.trim());
    setExpanded((prev) => new Set(prev).add(newExerciseName.trim()));
    setNewExerciseName("");
    setAddingExercise(false);
  }

  // Group logged sets by exercise
  const loggedByExercise: Record<string, WorkoutSet[]> = {};
  for (const s of loggedSets) {
    if (!loggedByExercise[s.exercise]) loggedByExercise[s.exercise] = [];
    loggedByExercise[s.exercise].push(s);
  }

  function renderAccordions(list: string[]) {
    return list.map((exercise) => (
      <ExerciseAccordion
        key={exercise}
        exercise={exercise}
        isOpen={expanded.has(exercise)}
        onToggle={() => toggleExpand(exercise)}
        loggedSets={loggedByExercise[exercise] ?? []}
        historySets={lastSets[exercise] ?? []}
        onLog={add}
        onUpdate={update}
        onRemove={remove}
      />
    ));
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 space-y-4">
      <h3 className="text-sm font-medium text-gray-700">
        Workout — {gymLabel}
      </h3>

      {/* Warmup */}
      {meta.warmup.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Warmup</p>
          <div className="space-y-1">{renderAccordions(meta.warmup)}</div>
        </div>
      )}

      {/* Main exercises */}
      {defaultExercises.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Exercises</p>
          <div className="space-y-1">{renderAccordions(defaultExercises)}</div>
        </div>
      )}

      {/* Cardio */}
      {meta.cardio.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Cardio</p>
          <div className="space-y-1">{renderAccordions(meta.cardio)}</div>
        </div>
      )}

      {/* Add other exercise */}
      <div className="pt-1 border-t border-gray-100">
        <select
          value={extraExercise}
          onChange={(e) => {
            if (e.target.value === "__add_new__") {
              setAddingExercise(true);
              return;
            }
            setExtraExercise(e.target.value);
            if (e.target.value) {
              setExpanded((prev) => new Set(prev).add(e.target.value));
            }
          }}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          <option value="">+ Add other exercise...</option>
          {exercises
            .filter((ex) => !defaultExercises.includes(ex))
            .map((ex) => (
              <option key={ex} value={ex}>{ex}</option>
            ))}
          <option value="__add_new__">+ Create new exercise...</option>
        </select>

        {addingExercise && (
          <div className="flex items-center gap-2 mt-2">
            <input
              type="text"
              value={newExerciseName}
              onChange={(e) => setNewExerciseName(e.target.value)}
              placeholder="Exercise name..."
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddExercise(); } }}
              className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
              autoFocus
            />
            <button onClick={handleAddExercise} className="px-3 py-1.5 bg-gray-900 text-white text-xs rounded-lg hover:bg-gray-800 transition-colors">Add</button>
            <button onClick={() => { setAddingExercise(false); setNewExerciseName(""); }} className="px-3 py-1.5 text-gray-500 text-xs">Cancel</button>
          </div>
        )}

        {extraExercise && (
          <div className="mt-2">
            <ExerciseAccordion
              exercise={extraExercise}
              isOpen={true}
              onToggle={() => {}}
              loggedSets={loggedByExercise[extraExercise] ?? []}
              historySets={[]}
              onLog={add}
              onUpdate={update}
              onRemove={remove}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/** A single editable set row — saved or pending. */
function SetRow({
  index,
  savedSet,
  prefill,
  onSave,
  onUpdate,
  onRemove,
}: {
  index: number;
  savedSet?: WorkoutSet;
  prefill?: LastSetRow;
  onSave: (reps: number | null, weight: number | null, duration: number | null) => Promise<void>;
  onUpdate: (reps: number | null, weight: number | null, duration: number | null) => Promise<void>;
  onRemove: () => void;
}) {
  const [reps, setReps] = useState(savedSet?.reps?.toString() ?? "");
  const [weight, setWeight] = useState(savedSet?.weight_lbs?.toString() ?? "");
  const [duration, setDuration] = useState(savedSet?.duration_mins?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  async function handleBlur() {
    const r = reps ? Number(reps) : null;
    const w = weight ? Number(weight) : null;
    const d = duration ? Number(duration) : null;
    if (r === null && w === null && d === null) return;
    setSaving(true);
    if (savedSet) {
      await onUpdate(r, w, d);
    } else {
      await onSave(r, w, d);
      setReps(""); setWeight(""); setDuration("");
    }
    setSaving(false);
  }

  const repsPlaceholder = savedSet ? undefined : (prefill?.reps?.toString() ?? "Reps");
  const weightPlaceholder = savedSet ? undefined : (prefill?.weight_lbs?.toString() ?? "lbs");
  const durationPlaceholder = savedSet ? undefined : (prefill?.duration_mins?.toString() ?? "min");

  return (
    <div className={`flex items-center gap-1.5 px-1 py-0.5 rounded-lg ${savedSet ? "bg-green-50" : ""}`}>
      <span className="text-xs text-gray-400 w-8 flex-shrink-0 text-center">{index + 1}</span>
      <input
        type="number"
        placeholder={repsPlaceholder}
        value={reps}
        onChange={(e) => setReps(e.target.value)}
        onBlur={handleBlur}
        className="flex-1 px-2 py-1 border border-gray-200 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 placeholder-gray-300 bg-transparent"
      />
      <span className="text-xs text-gray-300">@</span>
      <input
        type="number"
        placeholder={weightPlaceholder}
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
        onBlur={handleBlur}
        className="flex-1 px-2 py-1 border border-gray-200 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 placeholder-gray-300 bg-transparent"
      />
      <input
        type="number"
        placeholder={durationPlaceholder}
        value={duration}
        onChange={(e) => setDuration(e.target.value)}
        onBlur={handleBlur}
        className="w-14 px-2 py-1 border border-gray-200 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 placeholder-gray-300 bg-transparent"
      />
      {saving
        ? <span className="text-[10px] text-gray-400 w-5">…</span>
        : <button onClick={onRemove} className="text-gray-300 hover:text-red-400 text-base leading-none w-5 text-center flex-shrink-0">&times;</button>
      }
    </div>
  );
}

/** Collapsible exercise section with per-set rows. */
function ExerciseAccordion({
  exercise,
  isOpen,
  onToggle,
  loggedSets,
  historySets,
  onLog,
  onUpdate,
  onRemove,
}: {
  exercise: string;
  isOpen: boolean;
  onToggle: () => void;
  loggedSets: WorkoutSet[];
  historySets: LastSetRow[];
  onLog: (entry: {
    exercise: string;
    sets: number | null;
    reps: number | null;
    weight_lbs: number | null;
    duration_mins: number | null;
  }) => Promise<void>;
  onUpdate: (id: string, entry: Partial<{ reps: number | null; weight_lbs: number | null; duration_mins: number | null }>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [showPending, setShowPending] = useState(false);
  const setCount = loggedSets.length;
  const histSummary = historySets.length > 0 ? `${historySets.length} sets` : "";
  const prefill = historySets[historySets.length - 1];

  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? "rotate-90" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-sm font-medium text-gray-800">{exercise}</span>
          {setCount > 0 && (
            <span className="text-[10px] bg-gray-900 text-white px-1.5 py-0.5 rounded-full">{setCount}</span>
          )}
        </div>
        {!isOpen && histSummary && (
          <span className="text-[10px] text-gray-400">last: {histSummary}</span>
        )}
      </button>

      {isOpen && (
        <div className="px-2 pb-3 space-y-1">
          {/* Column headers */}
          <div className="flex items-center gap-1.5 px-1 pb-0.5">
            <span className="w-8" />
            <span className="flex-1 text-[10px] text-gray-400 text-center">reps</span>
            <span className="w-3" />
            <span className="flex-1 text-[10px] text-gray-400 text-center">lbs</span>
            <span className="w-14 text-[10px] text-gray-400 text-center">min</span>
            <span className="w-5" />
          </div>

          {/* Saved set rows */}
          {loggedSets.map((s, i) => (
            <SetRow
              key={s.id}
              index={i}
              savedSet={s}
              onSave={async () => {}}
              onUpdate={async (r, w, d) => onUpdate(s.id, { reps: r, weight_lbs: w, duration_mins: d })}
              onRemove={() => onRemove(s.id)}
            />
          ))}

          {/* Pending new set row */}
          {showPending && (
            <SetRow
              key="pending"
              index={setCount}
              prefill={prefill}
              onSave={async (r, w, d) => {
                await onLog({ exercise, sets: null, reps: r, weight_lbs: w, duration_mins: d });
                setShowPending(false);
              }}
              onUpdate={async () => {}}
              onRemove={() => setShowPending(false)}
            />
          )}

          {/* + Add set button */}
          {!showPending && (
            <button
              onClick={() => setShowPending(true)}
              className="ml-1 mt-1 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors"
            >
              <span className="w-5 h-5 rounded-full border border-gray-300 flex items-center justify-center text-base leading-none hover:border-gray-500">+</span>
              Add set
            </button>
          )}

          {/* History preview */}
          {historySets.length > 0 && (
            <div className="text-[10px] text-gray-400 pt-1 pl-1">
              Last:{" "}
              {historySets.map((h, i) => (
                <span key={i}>
                  {i > 0 && ", "}
                  {h.reps ? `${h.reps}r` : ""}
                  {h.weight_lbs ? `@${h.weight_lbs}` : ""}
                  {h.duration_mins ? `${h.duration_mins}min` : ""}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
