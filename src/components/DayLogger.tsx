"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
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
import DayEventsPanel from "./DayEventsPanel";
import Calendar from "./Calendar";
import PlanManager from "./PlanManager";
import WidgetConfigurator from "./WidgetConfigurator";
import GoogleConnector from "./GoogleConnector";
import OuraConnector from "./OuraConnector";
import OuraPanel from "./OuraPanel";
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
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const searchParams = useSearchParams();
  useEffect(() => {
    const google = searchParams.get("google");
    if (google === "connected") {
      setToast({ type: "success", message: "Google Calendar connected!" });
      window.history.replaceState({}, "", "/");
    } else if (google === "error") {
      setToast({ type: "error", message: "Google Calendar connection failed. Try again." });
      window.history.replaceState({}, "", "/");
    }
    const oura = searchParams.get("oura");
    if (oura === "connected") {
      setToast({ type: "success", message: "Oura Ring connected!" });
      window.history.replaceState({}, "", "/");
    } else if (oura === "error") {
      setToast({ type: "error", message: "Oura connection failed. Try again." });
      window.history.replaceState({}, "", "/");
    } else if (oura === "unconfigured") {
      setToast({ type: "error", message: "Oura is not configured on the server (missing OURA_CLIENT_ID)." });
      window.history.replaceState({}, "", "/");
    }
  }, [searchParams]);

  // Pull the latest Google Calendar events once per session so the day view
  // stays fresh between daily cron runs. Fire-and-forget; bumps calRefresh so
  // the events panel reloads when the import lands.
  const [calRefresh, setCalRefresh] = useState(0);
  const [ouraRefresh, setOuraRefresh] = useState(0);
  const pulledRef = useRef(false);
  useEffect(() => {
    if (pulledRef.current) return;
    pulledRef.current = true;
    fetch("/api/google/pull", { method: "POST" })
      .then(() => setCalRefresh((k) => k + 1))
      .catch(() => {});
    fetch("/api/oura/sync", { method: "POST" })
      .then(() => setOuraRefresh((k) => k + 1))
      .catch(() => {});
  }, []);

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
    <div className="min-h-screen">
      <div className="max-w-xl md:max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" aria-hidden="true" />
            <h1 className="text-xl font-bold tracking-tight text-stone-900">
              Life on Track
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {/* Autosave status */}
            {dailyLog.saving && (
              <span className="text-xs text-stone-400">Saving...</span>
            )}
            {dailyLog.saved && (
              <span className="text-xs text-emerald-600">Saved</span>
            )}
            <button onClick={onSignOut} className="btn btn-ghost text-sm">
              Sign out
            </button>
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div
            role="status"
            className={`flex items-center justify-between px-4 py-2.5 rounded-xl mb-4 text-sm border ${
              toast.type === "success"
                ? "bg-emerald-50 text-emerald-800 border-emerald-200/70"
                : "bg-rose-50 text-rose-800 border-rose-200/70"
            }`}
          >
            <span>{toast.message}</span>
            <button
              onClick={() => setToast(null)}
              className="ml-3 font-medium hover:opacity-70"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Date navigation */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={goToPrevDay}
            aria-label="Previous day"
            className="p-2 rounded-full text-stone-500 hover:text-stone-900 hover:bg-stone-200/70 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="text-center">
            <p className="text-sm font-semibold text-stone-900">{dayName}</p>
            <p className="text-xs text-stone-500">{dateDisplay}</p>
            {!isToday && (
              <button
                onClick={goToToday}
                className="text-xs text-indigo-600 hover:text-indigo-700 font-medium mt-0.5 transition-colors"
              >
                Jump to today
              </button>
            )}
            {activePlan && (
              <p className="text-[10px] text-stone-400 mt-0.5">
                {activePlan.name}
              </p>
            )}
          </div>
          <button
            onClick={goToNextDay}
            aria-label="Next day"
            className="p-2 rounded-full text-stone-500 hover:text-stone-900 hover:bg-stone-200/70 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-stone-200/70 rounded-xl p-1 mb-6">
          {(["day", "calendar", "plans", "settings"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                tab === t
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-stone-500 hover:text-stone-700"
              }`}
            >
              {t === "day" ? "Day" : t === "calendar" ? "Calendar" : t === "plans" ? "Plan & Customize" : "Settings"}
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
          <div className="space-y-8">
            <div className="space-y-3">
              <GoogleConnector userId={userId} />
              <OuraConnector userId={userId} />
            </div>
            <McpTokenManager userId={userId} />
          </div>
        )}

        {tab === "plans" && (
          <div className="space-y-8">
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
            <WidgetConfigurator userId={userId} />
          </div>
        )}

        {tab === "day" && (
          <div className="space-y-4">
            {/* Today's gym + swap control */}
            <div className="card flex items-center justify-between px-4 py-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs text-stone-500">Today:</span>
                <span className="text-sm font-medium text-stone-800 truncate">
                  {gymLabel}
                </span>
                {dayOverride && (
                  <span className="badge bg-amber-100 text-amber-700">
                    Swapped
                  </span>
                )}
              </div>
              <div className="relative flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setShowSwap((s) => !s)}
                  className="text-xs text-indigo-600 hover:text-indigo-700 font-medium transition-colors"
                >
                  Swap workout
                </button>
                {showSwap && (
                  <div className="absolute right-0 top-6 z-10 bg-white border border-stone-200 rounded-xl shadow-lg min-w-[160px] py-1 overflow-hidden">
                    {gymOptions.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={async () => {
                          await setOverride(opt.value);
                          setShowSwap(false);
                        }}
                        className="block w-full text-left px-3 py-1.5 text-xs text-stone-700 hover:bg-stone-50"
                      >
                        {opt.label}
                      </button>
                    ))}
                    {dayOverride && (
                      <>
                        <div className="border-t border-stone-100 my-1" />
                        <button
                          type="button"
                          onClick={async () => {
                            await setOverride(null);
                            setShowSwap(false);
                          }}
                          className="block w-full text-left px-3 py-1.5 text-xs text-rose-500 hover:bg-rose-50"
                        >
                          Clear override
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            <OuraPanel userId={userId} dateStr={dateStr} refresh={ouraRefresh} />

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

            <DayEventsPanel
              userId={userId}
              dateStr={dateStr}
              refreshKey={calRefresh}
            />

            {/* Delete day */}
            {dailyLog.hasLog && (
              <div>
                {showDeleteConfirm ? (
                  <div className="flex gap-2">
                    <button
                      onClick={handleDeleteDay}
                      className="btn btn-danger flex-1 py-2.5"
                    >
                      Confirm delete
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="btn btn-secondary flex-1 py-2.5"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="w-full py-2.5 text-rose-500 text-sm hover:text-rose-700 transition-colors"
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
