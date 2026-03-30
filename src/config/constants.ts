import type { ActivityType } from "@/lib/types";

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  lc: "LeetCode",
  ml: "ML/AI",
  sd: "System Design",
  beh: "Behavioral",
  oss: "FastMCP",
  vln: "Violin",
  dte: "Date Night",
  mck: "Mock Interview",
  out: "Outdoor Activity",
  psh: "Push",
  lgh: "Legs Heavy",
  rst: "Rest",
  pll: "Pull",
  lgl: "Legs Light",
  yga: "Yoga",
};

export const PAIN_COLORS = [
  "#22c55e",
  "#4ade80",
  "#86efac",
  "#bef264",
  "#fde047",
  "#fb923c",
  "#f97316",
  "#ef4444",
  "#dc2626",
  "#b91c1c",
  "#7f1d1d",
] as const;
