"use client";

import { PAIN_COLORS } from "@/config/constants";

interface PainSliderProps {
  value: number;
  onChange: (value: number) => void;
}

export default function PainSlider({ value, onChange }: PainSliderProps) {
  const color = PAIN_COLORS[value];

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-stone-700">Pain Level</h3>
        <span
          className="badge text-sm font-bold px-2.5 text-white"
          style={{ backgroundColor: color }}
        >
          {value}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={10}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Pain level"
        className="w-full h-2 rounded-lg appearance-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
        style={{
          background: `linear-gradient(to right, ${PAIN_COLORS[0]}, ${PAIN_COLORS[5]}, ${PAIN_COLORS[10]})`,
        }}
      />
      <div className="flex justify-between text-xs text-stone-400 mt-1">
        <span>None</span>
        <span>Severe</span>
      </div>
    </div>
  );
}
