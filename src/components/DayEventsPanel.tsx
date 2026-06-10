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
    <div className="card p-4 space-y-3">
      <h3 className="text-sm font-semibold text-stone-100">Calendar &amp; Events</h3>

      {/* Read-only events imported from Google Calendar */}
      {calendarEvents.length > 0 && (
        <div className="space-y-1.5">
          {calendarEvents.map((e) => (
            <div key={e.id} className="flex items-center gap-2 text-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
              <span className="text-stone-500 text-xs w-24 flex-shrink-0">
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
                  className="text-stone-200 hover:underline truncate"
                >
                  {e.title}
                </a>
              ) : (
                <span className="text-stone-200 truncate">{e.title}</span>
              )}
            </div>
          ))}
          <p className="text-[10px] text-stone-500">
            From Google Calendar · read-only
          </p>
        </div>
      )}

      {/* Editable life events */}
      {lifeEvents.length > 0 && (
        <div className="space-y-1.5">
          {lifeEvents.map((e) => (
            <div key={e.id} className="flex items-center gap-2 text-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
              <span className="text-stone-200 truncate flex-1">{e.title}</span>
              <button
                onClick={() => deleteLifeEvent(e.id)}
                className="btn btn-danger-ghost text-xs px-1.5 py-0.5 text-stone-500 hover:text-rose-300"
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
          className="input flex-1 text-sm py-1.5"
        />
        <button
          onClick={handleAdd}
          disabled={adding || !newTitle.trim()}
          className="btn btn-primary px-3 py-1.5"
        >
          Add
        </button>
      </div>
    </div>
  );
}
