"use client";

import { useState } from "react";
import { toDateString } from "@/lib/dates";
import { getActivitiesForDate, isWorkoutDay } from "@/config/schedule";
import { useDailyLog } from "@/hooks/useDailyLog";
import { useActivities } from "@/hooks/useActivities";
import PainSlider from "./PainSlider";
import ActivityChecklist from "./ActivityChecklist";
import WorkoutLogger from "./WorkoutLogger";
import DailyNotes from "./DailyNotes";

interface DayLoggerProps {
  userId: string;
  onSignOut: () => void;
}

export default function DayLogger({ userId, onSignOut }: DayLoggerProps) {
  const today = new Date();
  const dateStr = toDateString(today);
  const activities = getActivitiesForDate(today);
  const showWorkout = isWorkoutDay(today);

  const [tab, setTab] = useState<"today" | "calendar">("today");
  const dailyLog = useDailyLog(userId, dateStr);
  const activityData = useActivities(userId, dateStr);

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
            <PainSlider
              value={dailyLog.painLevel}
              onChange={dailyLog.setPainLevel}
            />

            <ActivityChecklist
              activities={activities}
              completions={activityData.completions}
              activityNotes={activityData.activityNotes}
              onToggle={activityData.toggle}
              onSaveNote={activityData.saveNote}
              onSetNote={activityData.setNote}
            />

            {showWorkout && (
              <WorkoutLogger date={today} userId={userId} />
            )}

            <DailyNotes
              value={dailyLog.notes}
              onChange={dailyLog.setNotes}
            />

            <button
              onClick={dailyLog.save}
              disabled={dailyLog.saving}
              className="w-full py-3 bg-gray-900 text-white rounded-2xl font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              {dailyLog.saving
                ? "Saving..."
                : dailyLog.saved
                  ? "Saved!"
                  : "Save today's log"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
