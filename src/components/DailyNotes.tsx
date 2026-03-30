"use client";

interface DailyNotesProps {
  value: string;
  onChange: (value: string) => void;
}

export default function DailyNotes({ value, onChange }: DailyNotesProps) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-4">
      <h3 className="text-sm font-medium text-gray-700 mb-3">Daily Notes</h3>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="How was your day?"
        rows={4}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
      />
    </div>
  );
}
