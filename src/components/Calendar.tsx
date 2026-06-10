"use client";

import { useState } from "react";
import { toDateString, isSameDay } from "@/lib/dates";
import { useLoggedDays } from "@/hooks/useLoggedDays";

interface CalendarProps {
  userId: string;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
}

const DAY_NAMES = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export default function Calendar({
  userId,
  selectedDate,
  onSelectDate,
}: CalendarProps) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(selectedDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(selectedDate.getMonth());

  const { loggedDates } = useLoggedDays(userId, viewYear, viewMonth);

  const firstDayOfMonth = new Date(viewYear, viewMonth, 1);
  const startDow = firstDayOfMonth.getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  function prevMonth() {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  const monthLabel = new Date(viewYear, viewMonth).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  // Build grid: empty cells for offset, then day numbers
  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="card p-4">
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={prevMonth}
          aria-label="Previous month"
          className="p-1.5 rounded-full text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h3 className="text-sm font-semibold text-stone-900">{monthLabel}</h3>
        <button
          onClick={nextMonth}
          aria-label="Next month"
          className="p-1.5 rounded-full text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAY_NAMES.map((d) => (
          <div key={d} className="text-center text-xs font-medium text-stone-400 py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={`empty-${i}`} />;
          }

          const cellDate = new Date(viewYear, viewMonth, day);
          const dateStr = toDateString(cellDate);
          const isSelected = isSameDay(cellDate, selectedDate);
          const isToday = isSameDay(cellDate, today);
          const hasLog = loggedDates.has(dateStr);

          return (
            <button
              key={day}
              onClick={() => onSelectDate(cellDate)}
              className={`relative aspect-square flex items-center justify-center text-sm rounded-lg transition-colors ${
                isSelected
                  ? "bg-indigo-600 text-white"
                  : isToday
                    ? "ring-1 ring-inset ring-indigo-600 text-indigo-700 font-semibold"
                    : "text-stone-700 hover:bg-stone-50"
              }`}
            >
              {day}
              {hasLog && !isSelected && (
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-indigo-600" />
              )}
              {hasLog && isSelected && (
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-white" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
