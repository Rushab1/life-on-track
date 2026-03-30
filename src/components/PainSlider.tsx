"use client";

import { PAIN_COLORS } from "@/config/constants";

interface PainSliderProps {
  value: number;
  onChange: (value: number) => void;
}

export default function PainSlider({ value, onChange }: PainSliderProps) {
  const color = PAIN_COLORS[value];

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-700">Pain Level</h3>
        <span
          className="text-sm font-bold px-2.5 py-0.5 rounded-full text-white"
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
        className="w-full h-2 rounded-lg appearance-none cursor-pointer"
        style={{
          background: `linear-gradient(to right, ${PAIN_COLORS[0]}, ${PAIN_COLORS[5]}, ${PAIN_COLORS[10]})`,
        }}
      />
      <div className="flex justify-between text-xs text-gray-400 mt-1">
        <span>None</span>
        <span>Severe</span>
      </div>
    </div>
  );
}
