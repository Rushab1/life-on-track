"use client";

import { useState } from "react";
import type { ActivityType } from "@/lib/types";

interface ActivityChecklistProps {
  activities: ActivityType[];
  completions: Record<string, boolean>;
  activityNotes: Record<string, string>;
  activityLabels: Record<string, string>;
  onToggle: (activity: ActivityType) => void;
  onSetNote: (activity: ActivityType, text: string) => void;
}

export default function ActivityChecklist({
  activities,
  completions,
  activityNotes,
  activityLabels,
  onToggle,
  onSetNote,
}: ActivityChecklistProps) {
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());

  function toggleExpand(activity: string) {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(activity)) next.delete(activity);
      else next.add(activity);
      return next;
    });
  }

  return (
    <div className="card p-4">
      <h3 className="text-sm font-medium text-stone-300 mb-3">Activities</h3>
      <div className="space-y-2">
        {activities.map((activity) => (
          <div key={activity}>
            <div className="flex items-center gap-3">
              <button
                onClick={() => onToggle(activity)}
                aria-label={`Toggle ${activityLabels[activity] ?? activity}`}
                aria-pressed={!!completions[activity]}
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 ${
                  completions[activity]
                    ? "bg-indigo-500 border-indigo-400"
                    : "border-white/15"
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
                    ? "text-stone-500 line-through"
                    : "text-stone-300"
                }`}
              >
                {activityLabels[activity] ?? activity}
              </span>
              <button
                onClick={() => toggleExpand(activity)}
                className="btn btn-ghost text-xs px-2 py-1"
              >
                notes
              </button>
            </div>
            {expandedNotes.has(activity) && (
              <div className="ml-9 mt-2">
                <input
                  type="text"
                  value={activityNotes[activity] || ""}
                  onChange={(e) => onSetNote(activity, e.target.value)}
                  placeholder="Add a note (autosaves)..."
                  className="input py-1.5 text-sm"
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
