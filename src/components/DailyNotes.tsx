"use client";

interface DailyNotesProps {
  value: string;
  onChange: (value: string) => void;
}

export default function DailyNotes({ value, onChange }: DailyNotesProps) {
  return (
    <div className="card p-4">
      <h3 className="text-sm font-medium text-stone-300 mb-3">Daily Notes</h3>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="How was your day?"
        rows={4}
        className="input resize-none"
      />
    </div>
  );
}
