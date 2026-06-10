"use client";

import { useState } from "react";
import { useDayEvents } from "@/hooks/useDayEvents";

function fmtTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

interface Props {
  userId: string;
  dateStr: string;
  refreshKey?: number;
}

export default function DayEventsPanel({ userId, dateStr, refreshKey }: Props) {
  const { lifeEvents, calendarEvents, createLifeEvent, deleteLifeEvent } =
    useDayEvents(userId, dateStr, refreshKey);
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);

  async function handleAdd() {
    const title = newTitle.trim();
    if (!title) return;
    setAdding(true);
    await createLifeEvent(title);
    setNewTitle("");
    setAdding(false);
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-900">Calendar &amp; Events</h3>

      {/* Read-only events imported from Google Calendar */}
      {calendarEvents.length > 0 && (
        <div className="space-y-1.5">
          {calendarEvents.map((e) => (
            <div key={e.id} className="flex items-center gap-2 text-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
              <span className="text-gray-400 text-xs w-24 flex-shrink-0">
                {e.all_day
                  ? "All day"
                  : `${fmtTime(e.start_time)}${
                      e.end_time ? `–${fmtTime(e.end_time)}` : ""
                    }`}
              </span>
              {e.html_link ? (
                <a
                  href={e.html_link}
                  target="_blank"
                  rel="noreferrer"
                  className="text-gray-800 hover:underline truncate"
                >
                  {e.title}
                </a>
              ) : (
                <span className="text-gray-800 truncate">{e.title}</span>
              )}
            </div>
          ))}
          <p className="text-[10px] text-gray-300">
            From Google Calendar · read-only
          </p>
        </div>
      )}

      {/* Editable life events */}
      {lifeEvents.length > 0 && (
        <div className="space-y-1.5">
          {lifeEvents.map((e) => (
            <div key={e.id} className="flex items-center gap-2 text-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
              <span className="text-gray-800 truncate flex-1">{e.title}</span>
              <button
                onClick={() => deleteLifeEvent(e.id)}
                className="text-gray-300 hover:text-red-500 text-xs px-1"
                aria-label="Delete event"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add a life event */}
      <div className="flex gap-2">
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
          placeholder="Add an event…"
          className="flex-1 text-sm px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400"
        />
        <button
          onClick={handleAdd}
          disabled={adding || !newTitle.trim()}
          className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-lg disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </div>
  );
}
