"use client";

import React from "react";

interface SeverityBadgeProps {
  score: number;
}

export default function SeverityBadge({ score }: SeverityBadgeProps) {
  let bg = "bg-bg-elevated";
  let border = "border-border-default";
  let text = "text-text-muted";
  let dot = "⚪";
  let label = "MINOR";

  switch (score) {
    case 5:
      bg = "bg-[#2D0808]";
      border = "border-[#DC2626]";
      text = "text-[#FF6B6B]";
      dot = "🔴";
      label = "CRITICAL";
      break;
    case 4:
      bg = "bg-[#2D1808]";
      border = "border-[#EA580C]";
      text = "text-[#FF8C42]";
      dot = "🟠";
      label = "HIGH";
      break;
    case 3:
      bg = "bg-[#2D2508]";
      border = "border-[#CA8A04]";
      text = "text-[#FBBF24]";
      dot = "🟡";
      label = "MEDIUM";
      break;
    case 2:
      bg = "bg-[#0D200D]";
      border = "border-[#16A34A]";
      text = "text-[#4ADE80]";
      dot = "🟢";
      label = "LOW";
      break;
    default:
      break;
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-bold ${bg} ${border} ${text} select-none`}
    >
      <span className="text-[8px]">{dot}</span>
      <span>{label} {score}/5</span>
    </span>
  );
}
