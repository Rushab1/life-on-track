"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import {
  getLocalDateString,
  getActivitiesForDate,
  isWorkoutDay,
  ACTIVITY_LABELS,
} from "@/lib/types";
import type { ActivityType, ActivityCompletion } from "@/lib/types";
import PainSlider from "./PainSlider";
import WorkoutLogger from "./WorkoutLogger";

interface DayLoggerProps {
  userId: string;
  onSignOut: () => void;
}

export default function DayLogger({ userId, onSignOut }: DayLoggerProps) {
  const today = new Date();
  const dateStr = getLocalDateString(today);
  const activities = getActivitiesForDate(today);
  const showWorkout = isWorkoutDay(today);

  const [tab, setTab] = useState<"today" | "calendar">("today");
  const [painLevel, setPainLevel] = useState(0);
  const [notes, setNotes] = useState("");
  const [completions, setCompletions] = useState<Record<ActivityType, boolean>>(
    {} as Record<ActivityType, boolean>
  );
  const [activityNotes, setActivityNotes] = useState<
    Record<ActivityType, string>
  >({} as Record<ActivityType, string>);
  const [expandedNotes, setExpandedNotes] = useState<Set<ActivityType>>(
    new Set()
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    // Load daily log
    const { data: log } = await supabase
      .from("daily_logs")
      .select("*")
      .eq("user_id", userId)
      .eq("date", dateStr)
      .single();

    if (log) {
      setPainLevel(log.pain_level ?? 0);
      setNotes(log.notes ?? "");
    }

    // Load activity completions
    const { data: comps } = await supabase
      .from("activity_completions")
      .select("*")
      .eq("user_id", userId)
      .eq("date", dateStr);

    if (comps) {
      const compMap: Record<string, boolean> = {};
      const noteMap: Record<string, string> = {};
      comps.forEach((c: ActivityCompletion) => {
        compMap[c.activity_type] = c.completed;
        if (c.notes) noteMap[c.activity_type] = c.notes;
      });
      setCompletions(compMap as Record<ActivityType, boolean>);
      setActivityNotes(noteMap as Record<ActivityType, string>);
    }
  }

  async function toggleActivity(activity: ActivityType) {
    const newVal = !completions[activity];
    setCompletions((prev) => ({ ...prev, [activity]: newVal }));

    await supabase.from("activity_completions").upsert(
      {
        user_id: userId,
        date: dateStr,
        activity_type: activity,
        completed: newVal,
      },
      { onConflict: "user_id,date,activity_type" }
    );
  }

  async function saveActivityNote(activity: ActivityType) {
    await supabase.from("activity_completions").upsert(
      {
        user_id: userId,
        date: dateStr,
        activity_type: activity,
        completed: completions[activity] ?? false,
        notes: activityNotes[activity] || null,
      },
      { onConflict: "user_id,date,activity_type" }
    );
  }

  async function saveLog() {
    setSaving(true);
    await supabase.from("daily_logs").upsert(
      {
        user_id: userId,
        date: dateStr,
        pain_level: painLevel,
        notes: notes || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,date" }
    );
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const dayName = today.toLocaleDateString("en-US", { weekday: "long" });
  const dateDisplay = today.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-[600px] mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Life on Track</h1>
            <p className="text-sm text-gray-500">
              {dayName}, {dateDisplay}
            </p>
          </div>
          <button
            onClick={onSignOut}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Sign out
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6">
          <button
            onClick={() => setTab("today")}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              tab === "today"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500"
            }`}
          >
            Today
          </button>
          <button
            onClick={() => setTab("calendar")}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              tab === "calendar"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500"
            }`}
          >
            Calendar
          </button>
        </div>

        {tab === "calendar" ? (
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
            <p className="text-gray-400">Coming soon</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Pain Slider */}
            <PainSlider value={painLevel} onChange={setPainLevel} />

            {/* Activity Checklist */}
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                Activities
              </h3>
              <div className="space-y-2">
                {activities.map((activity) => (
                  <div key={activity}>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleActivity(activity)}
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          completions[activity]
                            ? "bg-gray-900 border-gray-900"
                            : "border-gray-300"
                        }`}
                      >
                        {completions[activity] && (
                          <svg
                            className="w-3.5 h-3.5 text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={3}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        )}
                      </button>
                      <span
                        className={`text-sm flex-1 ${
                          completions[activity]
                            ? "text-gray-400 line-through"
                            : "text-gray-700"
                        }`}
                      >
                        {ACTIVITY_LABELS[activity]}
                      </span>
                      <button
                        onClick={() =>
                          setExpandedNotes((prev) => {
                            const next = new Set(prev);
                            if (next.has(activity)) next.delete(activity);
                            else next.add(activity);
                            return next;
                          })
                        }
                        className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        notes
                      </button>
                    </div>
                    {expandedNotes.has(activity) && (
                      <div className="ml-9 mt-2 flex gap-2">
                        <input
                          type="text"
                          value={activityNotes[activity] || ""}
                          onChange={(e) =>
                            setActivityNotes((prev) => ({
                              ...prev,
                              [activity]: e.target.value,
                            }))
                          }
                          placeholder="Add a note..."
                          className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
                        />
                        {completions[activity] && (
                          <button
                            onClick={() => saveActivityNote(activity)}
                            className="px-3 py-1.5 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 transition-colors"
                          >
                            Save
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Workout Logger */}
            {showWorkout && (
              <WorkoutLogger date={today} userId={userId} />
            )}

            {/* Daily Notes */}
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                Daily Notes
              </h3>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="How was your day?"
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
              />
            </div>

            {/* Save Button */}
            <button
              onClick={saveLog}
              disabled={saving}
              className="w-full py-3 bg-gray-900 text-white rounded-2xl font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving..." : saved ? "Saved!" : "Save today's log"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
