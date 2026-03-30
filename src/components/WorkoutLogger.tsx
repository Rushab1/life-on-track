"use client";

import { useState } from "react";
import { toDateString } from "@/lib/dates";
import { EXERCISES } from "@/config/exercises";
import { getGymLabel } from "@/config/schedule";
import { useWorkoutSets } from "@/hooks/useWorkoutSets";

interface WorkoutLoggerProps {
  date: Date;
  userId: string;
}

export default function WorkoutLogger({ date, userId }: WorkoutLoggerProps) {
  const dateStr = toDateString(date);
  const { sets: loggedSets, loading, add, remove } = useWorkoutSets(userId, dateStr);

  const [exercise, setExercise] = useState<string>(EXERCISES[0]);
  const [sets, setSets] = useState("");
  const [reps, setReps] = useState("");
  const [weight, setWeight] = useState("");
  const [duration, setDuration] = useState("");

  async function handleLogSet() {
    await add({
      exercise,
      sets: sets ? Number(sets) : null,
      reps: reps ? Number(reps) : null,
      weight_lbs: weight ? Number(weight) : null,
      duration_mins: duration ? Number(duration) : null,
    });
    setSets("");
    setReps("");
    setWeight("");
    setDuration("");
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4">
      <h3 className="text-sm font-medium text-gray-700 mb-3">
        Workout — {getGymLabel(date)}
      </h3>

      <select
        value={exercise}
        onChange={(e) => setExercise(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 mb-3 focus:outline-none focus:ring-2 focus:ring-gray-900"
      >
        {EXERCISES.map((ex) => (
          <option key={ex} value={ex}>
            {ex}
          </option>
        ))}
      </select>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <input
          type="number"
          placeholder="Sets"
          value={sets}
          onChange={(e) => setSets(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
        <input
          type="number"
          placeholder="Reps"
          value={reps}
          onChange={(e) => setReps(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
        <input
          type="number"
          placeholder="Weight (lbs)"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
        <input
          type="number"
          placeholder="Duration (min)"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>

      <button
        onClick={handleLogSet}
        disabled={loading}
        className="w-full py-2 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors mb-3"
      >
        {loading ? "Logging..." : "Log set"}
      </button>

      {loggedSets.length > 0 && (
        <div className="space-y-2">
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
