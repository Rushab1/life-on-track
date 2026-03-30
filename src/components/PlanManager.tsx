"use client";

import { useState } from "react";
import { ACTIVITY_LABELS } from "@/config/constants";
import {
  DEFAULT_GYM_SCHEDULE,
  DEFAULT_PREP_SCHEDULE,
} from "@/config/schedule";
import type { ActivityType, GymType, Plan } from "@/lib/types";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const GYM_OPTIONS: { value: GymType; label: string }[] = [
  { value: "rst", label: "Rest" },
  { value: "psh", label: "Push" },
  { value: "lgh", label: "Legs Heavy" },
  { value: "pll", label: "Pull" },
  { value: "lgl", label: "Legs Light" },
  { value: "yga", label: "Yoga" },
];

const PREP_OPTIONS: { value: ActivityType; label: string }[] = [
  { value: "lc", label: "LeetCode" },
  { value: "ml", label: "ML/AI" },
  { value: "sd", label: "System Design" },
  { value: "beh", label: "Behavioral" },
  { value: "oss", label: "FastMCP" },
  { value: "vln", label: "Violin" },
  { value: "dte", label: "Date Night" },
  { value: "mck", label: "Mock Interview" },
  { value: "out", label: "Outdoor Activity" },
];

interface PlanManagerProps {
  plans: Plan[];
  onCreate: (plan: {
    name: string;
    start_date: string;
    end_date: string;
    gym_schedule: Record<string, string>;
    prep_schedule: Record<string, string[]>;
  }) => Promise<void>;
  onUpdate: (
    id: string,
    updates: Partial<{
      name: string;
      start_date: string;
      end_date: string;
      gym_schedule: Record<string, string>;
      prep_schedule: Record<string, string[]>;
    }>
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export default function PlanManager({
  plans,
  onCreate,
  onUpdate,
  onDelete,
}: PlanManagerProps) {
  const [editing, setEditing] = useState<string | null>(null); // plan id or "new"
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {/* Existing plans */}
      {plans.map((plan) => (
        <div key={plan.id}>
          {editing === plan.id ? (
            <PlanForm
              initial={plan}
              onSave={async (data) => {
                await onUpdate(plan.id, data);
                setEditing(null);
              }}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-medium text-gray-900">{plan.name}</h3>
                  <p className="text-xs text-gray-500">
                    {plan.start_date} to {plan.end_date}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditing(plan.id)}
                    className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    Edit
                  </button>
                  {deleteConfirm === plan.id ? (
                    <div className="flex gap-1">
                      <button
                        onClick={async () => {
                          await onDelete(plan.id);
                          setDeleteConfirm(null);
                        }}
                        className="text-xs text-red-600 font-medium"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        className="text-xs text-gray-500"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirm(plan.id)}
                      className="text-xs text-red-500 hover:text-red-700 transition-colors"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
              {/* Summary */}
              <div className="grid grid-cols-7 gap-1 mt-3">
                {DAY_NAMES.map((day, i) => {
                  const gym = plan.gym_schedule[String(i)] ?? "rst";
                  const prep = plan.prep_schedule[String(i)] ?? [];
                  return (
                    <div key={i} className="text-center">
                      <p className="text-[10px] font-medium text-gray-400 mb-0.5">
                        {day}
                      </p>
                      <p className="text-[10px] text-gray-700">
                        {ACTIVITY_LABELS[gym as ActivityType]}
                      </p>
                      {prep.map((a: string) => (
                        <p key={a} className="text-[10px] text-gray-400">
                          {ACTIVITY_LABELS[a as ActivityType]}
                        </p>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Create new plan */}
      {editing === "new" ? (
        <PlanForm
          onSave={async (data) => {
            await onCreate(data);
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <button
          onClick={() => setEditing("new")}
          className="w-full py-3 border-2 border-dashed border-gray-300 text-gray-500 rounded-2xl text-sm font-medium hover:border-gray-400 hover:text-gray-700 transition-colors"
        >
          + Create new plan
        </button>
      )}
    </div>
  );
}

/** Reusable form for creating / editing a plan. */
function PlanForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Plan;
  onSave: (data: {
    name: string;
    start_date: string;
    end_date: string;
    gym_schedule: Record<string, string>;
    prep_schedule: Record<string, string[]>;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [startDate, setStartDate] = useState(initial?.start_date ?? "");
  const [endDate, setEndDate] = useState(initial?.end_date ?? "");
  const [gymSchedule, setGymSchedule] = useState<Record<string, string>>(
    initial?.gym_schedule ?? { ...DEFAULT_GYM_SCHEDULE }
  );
  const [prepSchedule, setPrepSchedule] = useState<Record<string, string[]>>(
    initial?.prep_schedule ?? JSON.parse(JSON.stringify(DEFAULT_PREP_SCHEDULE))
  );
  const [saving, setSaving] = useState(false);

  function setGym(day: string, value: string) {
    setGymSchedule((prev) => ({ ...prev, [day]: value }));
  }

  function togglePrep(day: string, activity: ActivityType) {
    setPrepSchedule((prev) => {
      const current = prev[day] ?? [];
      const next = current.includes(activity)
        ? current.filter((a) => a !== activity)
        : [...current, activity];
      return { ...prev, [day]: next };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await onSave({
      name,
      start_date: startDate,
      end_date: endDate,
      gym_schedule: gymSchedule,
      prep_schedule: prepSchedule,
    });
    setSaving(false);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-2xl shadow-sm p-4 space-y-4"
    >
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Plan name"
        required
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
      />

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Start date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">End date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
      </div>

      {/* Schedule builder */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-2">
          Weekly Schedule
        </h4>
        <div className="space-y-3">
          {DAY_NAMES.map((dayName, i) => {
            const day = String(i);
            return (
              <div
                key={i}
                className="border border-gray-100 rounded-lg p-3"
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-sm font-medium text-gray-700 w-10">
                    {dayName}
                  </span>
                  <select
                    value={gymSchedule[day] ?? "rst"}
                    onChange={(e) => setGym(day, e.target.value)}
                    className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
                  >
                    {GYM_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-wrap gap-1.5 ml-[52px]">
                  {PREP_OPTIONS.map((opt) => {
                    const active = (prepSchedule[day] ?? []).includes(
                      opt.value
                    );
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => togglePrep(day, opt.value)}
                        className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
                          active
                            ? "bg-gray-900 text-white"
                            : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 py-2.5 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving..." : initial ? "Update plan" : "Create plan"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
