"use client";

import { useState, useEffect } from "react";
import { toDateString } from "@/lib/dates";
import { EXERCISES, WORKOUT_EXERCISES } from "@/config/exercises";
import { getGymLabel, getGymType } from "@/config/schedule";
import { useWorkoutSets } from "@/hooks/useWorkoutSets";
import { useLastWorkout } from "@/hooks/useLastWorkout";
import type { Plan } from "@/lib/types";

interface WorkoutLoggerProps {
  date: Date;
  userId: string;
  plan?: Plan | null;
}

interface RowState {
  sets: string;
  reps: string;
  weight: string;
  duration: string;
}

export default function WorkoutLogger({ date, userId, plan }: WorkoutLoggerProps) {
  const dateStr = toDateString(date);
  const gymType = getGymType(date, plan);
  const defaultExercises = WORKOUT_EXERCISES[gymType] ?? [];
  const {
    sets: loggedSets,
    loading: logLoading,
    add,
    remove,
  } = useWorkoutSets(userId, dateStr);
  const lastSets = useLastWorkout(userId, dateStr, defaultExercises);

  // Row state for each prefilled exercise
  const [rows, setRows] = useState<Record<string, RowState>>({});

  // Extra exercise via dropdown (for exercises not in the preset)
  const [extraExercise, setExtraExercise] = useState("");
  const [extraRow, setExtraRow] = useState<RowState>({
    sets: "",
    reps: "",
    weight: "",
    duration: "",
  });

  // Prefill rows when lastSets loads
  useEffect(() => {
    const newRows: Record<string, RowState> = {};
    for (const ex of defaultExercises) {
      const last = lastSets[ex];
      newRows[ex] = {
        sets: last?.sets?.toString() ?? "",
        reps: last?.reps?.toString() ?? "",
        weight: last?.weight_lbs?.toString() ?? "",
        duration: last?.duration_mins?.toString() ?? "",
      };
    }
    setRows(newRows);
  }, [lastSets, defaultExercises.join(",")]);

  function updateRow(exercise: string, field: keyof RowState, value: string) {
    setRows((prev) => ({
      ...prev,
      [exercise]: { ...prev[exercise], [field]: value },
    }));
  }

  async function logRow(exercise: string, row: RowState) {
    await add({
      exercise,
      sets: row.sets ? Number(row.sets) : null,
      reps: row.reps ? Number(row.reps) : null,
      weight_lbs: row.weight ? Number(row.weight) : null,
      duration_mins: row.duration ? Number(row.duration) : null,
    });
  }

  async function logExtra() {
    if (!extraExercise) return;
    await add({
      exercise: extraExercise,
      sets: extraRow.sets ? Number(extraRow.sets) : null,
      reps: extraRow.reps ? Number(extraRow.reps) : null,
      weight_lbs: extraRow.weight ? Number(extraRow.weight) : null,
      duration_mins: extraRow.duration ? Number(extraRow.duration) : null,
    });
    setExtraRow({ sets: "", reps: "", weight: "", duration: "" });
    setExtraExercise("");
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4">
      <h3 className="text-sm font-medium text-gray-700 mb-3">
        Workout — {getGymLabel(date, plan)}
      </h3>

      {/* Prefilled exercise rows */}
      {defaultExercises.length > 0 && (
        <div className="space-y-3 mb-4">
          {defaultExercises.map((exercise) => {
            const row = rows[exercise] ?? {
              sets: "",
              reps: "",
              weight: "",
              duration: "",
            };
            const last = lastSets[exercise];
            return (
              <div key={exercise}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-800">
                    {exercise}
                  </span>
                  {last && (
                    <span className="text-[10px] text-gray-400">
                      last: {last.sets && last.reps ? `${last.sets}x${last.reps}` : ""}
                      {last.weight_lbs ? ` @ ${last.weight_lbs}lbs` : ""}
                      {last.duration_mins ? ` ${last.duration_mins}min` : ""}
                    </span>
                  )}
                </div>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    placeholder="Sets"
                    value={row.sets}
                    onChange={(e) => updateRow(exercise, "sets", e.target.value)}
                    className="w-1/4 px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                  <input
                    type="number"
                    placeholder="Reps"
                    value={row.reps}
                    onChange={(e) => updateRow(exercise, "reps", e.target.value)}
                    className="w-1/4 px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                  <input
                    type="number"
                    placeholder="Wt(lbs)"
                    value={row.weight}
                    onChange={(e) =>
                      updateRow(exercise, "weight", e.target.value)
                    }
                    className="w-1/4 px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                  <button
                    onClick={() => logRow(exercise, row)}
                    disabled={logLoading}
                    className="px-3 py-1.5 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors flex-shrink-0"
                  >
                    Log
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add other exercise */}
      <div className="border-t border-gray-100 pt-3">
        <p className="text-xs text-gray-400 mb-2">Add other exercise</p>
        <select
          value={extraExercise}
          onChange={(e) => setExtraExercise(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 mb-2 focus:outline-none focus:ring-2 focus:ring-gray-900 text-sm"
        >
          <option value="">Select exercise...</option>
          {EXERCISES.filter((ex) => !defaultExercises.includes(ex)).map(
            (ex) => (
              <option key={ex} value={ex}>
                {ex}
              </option>
            )
          )}
        </select>
        {extraExercise && (
          <div className="flex gap-1.5 mb-2">
            <input
              type="number"
              placeholder="Sets"
              value={extraRow.sets}
              onChange={(e) =>
                setExtraRow((r) => ({ ...r, sets: e.target.value }))
              }
              className="w-1/4 px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <input
              type="number"
              placeholder="Reps"
              value={extraRow.reps}
              onChange={(e) =>
                setExtraRow((r) => ({ ...r, reps: e.target.value }))
              }
              className="w-1/4 px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <input
              type="number"
              placeholder="Wt(lbs)"
              value={extraRow.weight}
              onChange={(e) =>
                setExtraRow((r) => ({ ...r, weight: e.target.value }))
              }
              className="w-1/4 px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <button
              onClick={logExtra}
              disabled={logLoading}
              className="px-3 py-1.5 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors flex-shrink-0"
            >
              Log
            </button>
          </div>
        )}
      </div>

      {/* Logged sets */}
      {loggedSets.length > 0 && (
        <div className="border-t border-gray-100 pt-3 mt-3 space-y-2">
          <p className="text-xs text-gray-400 mb-1">Logged today</p>
          {loggedSets.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-lg text-sm"
            >
              <div className="text-gray-700">
                <span className="font-medium">{s.exercise}</span>
                {s.sets && s.reps && (
                  <span className="text-gray-500">
                    {" "}
                    — {s.sets}x{s.reps}
                  </span>
                )}
                {s.weight_lbs && (
                  <span className="text-gray-500"> @ {s.weight_lbs}lbs</span>
                )}
                {s.duration_mins && (
                  <span className="text-gray-500"> {s.duration_mins}min</span>
                )}
              </div>
              <button
                onClick={() => remove(s.id)}
                className="text-gray-400 hover:text-red-500 font-bold text-lg leading-none"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
