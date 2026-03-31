"use client";

import { useState } from "react";
import { toDateString, addDays, isSameDay } from "@/lib/dates";
import { getActivitiesForDate, isWorkoutDay, getGymType } from "@/config/schedule";
import { useDailyLog } from "@/hooks/useDailyLog";
import { useActivities } from "@/hooks/useActivities";
import { usePlans, getActivePlan } from "@/hooks/usePlans";
import { useCustomTopics } from "@/hooks/useCustomTopics";
import PainSlider from "./PainSlider";
import ActivityChecklist from "./ActivityChecklist";
import WorkoutLogger from "./WorkoutLogger";
import DailyNotes from "./DailyNotes";
import Calendar from "./Calendar";
import PlanManager from "./PlanManager";

interface DayLoggerProps {
  userId: string;
  onSignOut: () => void;
}

type Tab = "day" | "calendar" | "plans";

export default function DayLogger({ userId, onSignOut }: DayLoggerProps) {
  const today = new Date();
  const [selectedDate, setSelectedDate] = useState(today);
  const [tab, setTab] = useState<Tab>("day");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const dateStr = toDateString(selectedDate);
  const isToday = isSameDay(selectedDate, today);

  const { plans, create: createPlan, update: updatePlan, remove: removePlan } =
    usePlans(userId);
  const activePlan = getActivePlan(plans, dateStr);

  const {
    activityLabels,
    gymOptions,
    prepOptions,
    exercises: allExercises,
    workoutExercises,
    topics: customTopics,
    addTopic,
    removeTopic,
  } = useCustomTopics(userId);

  const activities = getActivitiesForDate(selectedDate, activePlan);
  const showWorkout = isWorkoutDay(selectedDate, activePlan);
  const gymType = getGymType(selectedDate, activePlan);
  const gymLabel = activityLabels[gymType] ?? gymType;

  const dailyLog = useDailyLog(userId, dateStr);
  const activityData = useActivities(userId, dateStr);

  const dayName = selectedDate.toLocaleDateString("en-US", { weekday: "long" });
  const dateDisplay = selectedDate.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  function goToPrevDay() {
    setSelectedDate((d) => addDays(d, -1));
    setShowDeleteConfirm(false);
  }

  function goToNextDay() {
    setSelectedDate((d) => addDays(d, 1));
    setShowDeleteConfirm(false);
  }

  function goToToday() {
    setSelectedDate(new Date());
    setShowDeleteConfirm(false);
  }

  function handleCalendarSelect(date: Date) {
    setSelectedDate(date);
    setTab("day");
    setShowDeleteConfirm(false);
  }

  async function handleDeleteDay() {
    await dailyLog.deleteLog();
    await activityData.clearAll();
    setShowDeleteConfirm(false);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-[600px] mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-gray-900">Life on Track</h1>
          <div className="flex items-center gap-3">
            {/* Autosave status */}
            {dailyLog.saving && (
              <span className="text-xs text-gray-400">Saving...</span>
            )}
            {dailyLog.saved && (
              <span className="text-xs text-green-500">Saved</span>
            )}
            <button
              onClick={onSignOut}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>

        {/* Date navigation */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={goToPrevDay}
            className="p-2 text-gray-500 hover:text-gray-900 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="text-center">
            <p className="text-sm font-medium text-gray-900">{dayName}</p>
            <p className="text-xs text-gray-500">{dateDisplay}</p>
            {!isToday && (
              <button
                onClick={goToToday}
                className="text-xs text-gray-400 hover:text-gray-700 mt-0.5 transition-colors"
              >
                Jump to today
              </button>
            )}
            {activePlan && (
              <p className="text-[10px] text-gray-400 mt-0.5">
                {activePlan.name}
              </p>
            )}
          </div>
          <button
            onClick={goToNextDay}
            className="p-2 text-gray-500 hover:text-gray-900 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6">
          {(["day", "calendar", "plans"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                tab === t
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500"
              }`}
            >
              {t === "day" ? "Day" : t === "calendar" ? "Calendar" : "Plans"}
            </button>
          ))}
        </div>

        {tab === "calendar" && (
          <Calendar
            userId={userId}
            selectedDate={selectedDate}
            onSelectDate={handleCalendarSelect}
          />
        )}

        {tab === "plans" && (
          <PlanManager
            plans={plans}
            gymOptions={gymOptions}
            prepOptions={prepOptions}
            activityLabels={activityLabels}
            customTopics={customTopics}
            onAddTopic={addTopic}
            onRemoveTopic={removeTopic}
            onCreate={createPlan}
            onUpdate={updatePlan}
            onDelete={removePlan}
          />
        )}

        {tab === "day" && (
          <div className="space-y-4">
            <PainSlider
              value={dailyLog.painLevel}
              onChange={dailyLog.setPainLevel}
            />

            <ActivityChecklist
              activities={activities}
              completions={activityData.completions}
              activityNotes={activityData.activityNotes}
              activityLabels={activityLabels}
              onToggle={activityData.toggle}
              onSetNote={activityData.setNote}
            />

            {showWorkout && (
              <WorkoutLogger
                date={selectedDate}
                userId={userId}
                plan={activePlan}
                exercises={allExercises}
                workoutExercises={workoutExercises}
                gymLabel={gymLabel}
                onAddExercise={(label) => addTopic("exercise", label)}
              />
            )}

            <DailyNotes
              value={dailyLog.notes}
              onChange={dailyLog.setNotes}
            />

            {/* Delete day */}
            {dailyLog.hasLog && (
              <div>
                {showDeleteConfirm ? (
                  <div className="flex gap-2">
                    <button
                      onClick={handleDeleteDay}
                      className="flex-1 py-2.5 bg-red-600 text-white rounded-2xl text-sm font-medium hover:bg-red-700 transition-colors"
                    >
                      Confirm delete
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-2xl text-sm font-medium hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="w-full py-2.5 text-red-500 text-sm hover:text-red-700 transition-colors"
                  >
                    Delete this day&apos;s log
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
