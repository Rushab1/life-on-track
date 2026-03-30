"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { EXERCISES, getGymType, getLocalDateString } from "@/lib/types";
import type { WorkoutSet } from "@/lib/types";

interface WorkoutLoggerProps {
  date: Date;
  userId: string;
}

export default function WorkoutLogger({ date, userId }: WorkoutLoggerProps) {
  const [exercise, setExercise] = useState(EXERCISES[0]);
  const [sets, setSets] = useState("");
  const [reps, setReps] = useState("");
  const [weight, setWeight] = useState("");
  const [duration, setDuration] = useState("");
  const [loggedSets, setLoggedSets] = useState<WorkoutSet[]>([]);
  const [loading, setLoading] = useState(false);

  const dateStr = getLocalDateString(date);

  useEffect(() => {
    fetchSets();
  }, [dateStr]);

  async function fetchSets() {
    const { data } = await supabase
      .from("workout_sets")
      .select("*")
      .eq("user_id", userId)
      .eq("date", dateStr)
      .order("created_at", { ascending: true });

    if (data) setLoggedSets(data);
  }

  async function logSet() {
    setLoading(true);
    await supabase.from("workout_sets").insert({
      user_id: userId,
      date: dateStr,
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
    await fetchSets();
    setLoading(false);
  }

  async function deleteSet(id: string) {
    await supabase.from("workout_sets").delete().eq("id", id);
    setLoggedSets((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4">
      <h3 className="text-sm font-medium text-gray-700 mb-3">
        Workout — {getGymType(date)}
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
        onClick={logSet}
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
                onClick={() => deleteSet(s.id)}
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
