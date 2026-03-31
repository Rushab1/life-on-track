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
    <div className="bg-white rounded-2xl shadow-sm p-4">
      <h3 className="text-sm font-medium text-gray-700 mb-3">Activities</h3>
      <div className="space-y-2">
        {activities.map((activity) => (
          <div key={activity}>
            <div className="flex items-center gap-3">
              <button
                onClick={() => onToggle(activity)}
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
                {activityLabels[activity] ?? activity}
              </span>
              <button
                onClick={() => toggleExpand(activity)}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
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
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
