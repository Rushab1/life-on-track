"use client";

import { useState } from "react";
import { toDateString } from "@/lib/dates";
import { EXERCISES, WORKOUT_EXERCISES } from "@/config/exercises";
import { getGymLabel, getGymType } from "@/config/schedule";
import { useWorkoutSets } from "@/hooks/useWorkoutSets";
import { useLastWorkout } from "@/hooks/useLastWorkout";
import type { LastSetRow } from "@/hooks/useLastWorkout";
import type { Plan, WorkoutSet } from "@/lib/types";

interface WorkoutLoggerProps {
  date: Date;
  userId: string;
  plan?: Plan | null;
}

export default function WorkoutLogger({ date, userId, plan }: WorkoutLoggerProps) {
  const dateStr = toDateString(date);
  const gymType = getGymType(date, plan);
  const defaultExercises = WORKOUT_EXERCISES[gymType] ?? [];
  const { sets: loggedSets, loading, add, remove } = useWorkoutSets(userId, dateStr);
  const lastSets = useLastWorkout(userId, dateStr, defaultExercises);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [extraExercise, setExtraExercise] = useState("");

  function toggleExpand(exercise: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(exercise)) next.delete(exercise);
      else next.add(exercise);
      return next;
    });
  }

  // Group logged sets by exercise
  const loggedByExercise: Record<string, WorkoutSet[]> = {};
  for (const s of loggedSets) {
    if (!loggedByExercise[s.exercise]) loggedByExercise[s.exercise] = [];
    loggedByExercise[s.exercise].push(s);
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4">
      <h3 className="text-sm font-medium text-gray-700 mb-3">
        Workout — {getGymLabel(date, plan)}
      </h3>

      <div className="space-y-1">
        {defaultExercises.map((exercise) => {
          const isOpen = expanded.has(exercise);
          const logged = loggedByExercise[exercise] ?? [];
          const history = lastSets[exercise] ?? [];
          const setCount = logged.length;

          return (
            <ExerciseAccordion
              key={exercise}
              exercise={exercise}
              isOpen={isOpen}
              onToggle={() => toggleExpand(exercise)}
              loggedSets={logged}
              historySets={history}
              setCount={setCount}
              loading={loading}
              onLog={add}
              onRemove={remove}
            />
          );
        })}
      </div>

      {/* Add other exercise */}
      <div className="mt-3 pt-3 border-t border-gray-100">
        <select
          value={extraExercise}
          onChange={(e) => {
            setExtraExercise(e.target.value);
            if (e.target.value) {
              setExpanded((prev) => new Set(prev).add(e.target.value));
            }
          }}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          <option value="">+ Add other exercise...</option>
          {EXERCISES.filter((ex) => !defaultExercises.includes(ex)).map((ex) => (
            <option key={ex} value={ex}>{ex}</option>
          ))}
        </select>
        {extraExercise && (
          <div className="mt-2">
            <ExerciseAccordion
              exercise={extraExercise}
              isOpen={true}
              onToggle={() => {}}
              loggedSets={loggedByExercise[extraExercise] ?? []}
              historySets={[]}
              setCount={(loggedByExercise[extraExercise] ?? []).length}
              loading={loading}
              onLog={add}
              onRemove={remove}
            />
          </div>
        )}
      </div>
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
  setCount,
  loading,
  onLog,
  onRemove,
}: {
  exercise: string;
  isOpen: boolean;
  onToggle: () => void;
  loggedSets: WorkoutSet[];
  historySets: LastSetRow[];
  setCount: number;
  loading: boolean;
  onLog: (entry: {
    exercise: string;
    sets: number | null;
    reps: number | null;
    weight_lbs: number | null;
    duration_mins: number | null;
  }) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [reps, setReps] = useState("");
  const [weight, setWeight] = useState("");

  // Prefill from the next unlogged set in history
  const nextSetIndex = setCount;
  const prefill = historySets[nextSetIndex] ?? historySets[historySets.length - 1];

  // Summary for collapsed state
  const histSummary = historySets.length > 0
    ? `${historySets.length} sets`
    : "";

  async function handleLog() {
    const finalReps = reps || prefill?.reps?.toString() || "";
    const finalWeight = weight || prefill?.weight_lbs?.toString() || "";
    await onLog({
      exercise,
      sets: null,
      reps: finalReps ? Number(finalReps) : null,
      weight_lbs: finalWeight ? Number(finalWeight) : null,
      duration_mins: null,
    });
    setReps("");
    setWeight("");
  }

  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? "rotate-90" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-sm font-medium text-gray-800">{exercise}</span>
          {setCount > 0 && (
            <span className="text-[10px] bg-gray-900 text-white px-1.5 py-0.5 rounded-full">
              {setCount}
            </span>
          )}
        </div>
        {!isOpen && histSummary && (
          <span className="text-[10px] text-gray-400">last: {histSummary}</span>
        )}
      </button>

      {/* Expanded content */}
      {isOpen && (
        <div className="px-3 pb-3 space-y-2">
          {/* Logged sets */}
          {loggedSets.map((s, i) => (
            <div
              key={s.id}
              className="flex items-center justify-between bg-green-50 px-2.5 py-1.5 rounded-lg text-sm"
            >
              <div className="flex items-center gap-2 text-gray-700">
                <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-gray-500 text-xs">Set {i + 1}</span>
                {s.reps && <span>{s.reps} reps</span>}
                {s.weight_lbs && <span className="text-gray-500">@ {s.weight_lbs}lbs</span>}
              </div>
              <button
                onClick={() => onRemove(s.id)}
                className="text-gray-400 hover:text-red-500 text-lg leading-none"
              >
                &times;
              </button>
            </div>
          ))}

          {/* New set input row */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400 w-10 flex-shrink-0">
              Set {setCount + 1}
            </span>
            <input
              type="number"
              placeholder={prefill?.reps?.toString() ?? "Reps"}
              value={reps}
              onChange={(e) => setReps(e.target.value)}
              className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 placeholder-gray-300"
            />
            <input
              type="number"
              placeholder={prefill?.weight_lbs?.toString() ?? "lbs"}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 placeholder-gray-300"
            />
            <button
              onClick={handleLog}
              disabled={loading}
              className="px-3 py-1.5 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors flex-shrink-0"
            >
              Log
            </button>
          </div>

          {/* History preview */}
          {historySets.length > 0 && (
            <div className="text-[10px] text-gray-400 pt-1">
              Last session: {historySets.map((h, i) => (
                <span key={i}>
                  {i > 0 && ", "}
                  {h.reps}r{h.weight_lbs ? `@${h.weight_lbs}` : ""}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
