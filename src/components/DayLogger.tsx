"use client";

import { useState } from "react";
import { toDateString, addDays, isSameDay } from "@/lib/dates";
import { getActivitiesForDate, isWorkoutDay, getGymType } from "@/config/schedule";
import { useDailyLog } from "@/hooks/useDailyLog";
import { useActivities } from "@/hooks/useActivities";
import { usePlans, getActivePlan } from "@/hooks/usePlans";
import { useCustomTopics } from "@/hooks/useCustomTopics";
import { useExercises } from "@/hooks/useExercises";
import { useDayOverride } from "@/hooks/useDayOverride";
import { useWorkoutSets } from "@/hooks/useWorkoutSets";
import PainSlider from "./PainSlider";
import ActivityChecklist from "./ActivityChecklist";
import WorkoutLogger from "./WorkoutLogger";
import DailyNotes from "./DailyNotes";
import Calendar from "./Calendar";
import PlanManager from "./PlanManager";
import McpTokenManager from "./McpTokenManager";

interface DayLoggerProps {
  userId: string;
  onSignOut: () => void;
}

type Tab = "day" | "calendar" | "plans" | "settings";

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
    topics: customTopics,
    addTopic,
    removeTopic,
  } = useCustomTopics(userId);

  const { exercises: allExercises, addExercise } = useExercises(userId);

  const { override: dayOverride, setOverride } = useDayOverride(
    userId,
    dateStr,
  );
  const [showSwap, setShowSwap] = useState(false);
  const { sets: workoutSetsForDay } = useWorkoutSets(userId, dateStr);

  const activities = getActivitiesForDate(selectedDate, activePlan, dayOverride);
  const gymType = getGymType(selectedDate, activePlan, dayOverride);
  const gymLabel = activityLabels[gymType] ?? gymType;
  // Show workout panel if the day's gym type is a workout, OR if an override
  // made it one, OR if any sets already exist (e.g. user logged a workout on
  // a rest day via MCP — don't hide the data just because the plan says rest).
  const showWorkout =
    isWorkoutDay(selectedDate, activePlan, dayOverride) ||
    workoutSetsForDay.length > 0;

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
          {(["day", "calendar", "plans", "settings"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                tab === t
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500"
              }`}
            >
              {t === "day" ? "Day" : t === "calendar" ? "Calendar" : t === "plans" ? "Plans" : "Settings"}
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

        {tab === "settings" && (
          <McpTokenManager userId={userId} />
        )}

        {tab === "plans" && (
          <PlanManager
            plans={plans}
            gymOptions={gymOptions}
            prepOptions={prepOptions}
            activityLabels={activityLabels}
            customTopics={customTopics}
            allExercises={allExercises}
            onAddExercise={addExercise}
            onAddTopic={addTopic}
            onRemoveTopic={removeTopic}
            onCreate={createPlan}
            onUpdate={updatePlan}
            onDelete={removePlan}
          />
        )}

        {tab === "day" && (
          <div className="space-y-4">
            {/* Today's gym + swap control */}
            <div className="flex items-center justify-between bg-white rounded-2xl shadow-sm px-4 py-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs text-gray-500">Today:</span>
                <span className="text-sm font-medium text-gray-800 truncate">
                  {gymLabel}
                </span>
                {dayOverride && (
                  <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">
                    Swapped
                  </span>
                )}
              </div>
              <div className="relative flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setShowSwap((s) => !s)}
                  className="text-xs text-gray-500 hover:text-gray-800 transition-colors"
                >
                  Swap workout
                </button>
                {showSwap && (
                  <div className="absolute right-0 top-6 z-10 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[160px] py-1">
                    {gymOptions.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={async () => {
                          await setOverride(opt.value);
                          setShowSwap(false);
                        }}
                        className="block w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        {opt.label}
                      </button>
                    ))}
                    {dayOverride && (
                      <>
                        <div className="border-t border-gray-100 my-1" />
                        <button
                          type="button"
                          onClick={async () => {
                            await setOverride(null);
                            setShowSwap(false);
                          }}
                          className="block w-full text-left px-3 py-1.5 text-xs text-red-500 hover:bg-gray-50"
                        >
                          Clear override
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

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
                override={dayOverride}
                exercises={allExercises}
                gymLabel={gymLabel}
                onAddExercise={addExercise}
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
