"use client";

import React from "react";

interface ConfidenceScoreProps {
  score: number;
}

export default function ConfidenceScore({ score }: ConfidenceScoreProps) {
  // Determine color mapping based on thresholds
  let strokeColor = "var(--accent-primary)";
  let textColor = "text-accent-secondary";

  if (score >= 80) {
    strokeColor = "var(--accent-primary)";
    textColor = "text-text-primary";
  } else if (score >= 60) {
    strokeColor = "var(--warning)";
    textColor = "text-warning";
  } else {
    strokeColor = "var(--danger)";
    textColor = "text-danger";
  }

  // Circular progress calculations
  const radius = 18;
  const strokeWidth = 3;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex items-center gap-3">
      {/* SVG Circular Progress Ring */}
      <div className="relative h-12 w-12 flex items-center justify-center shrink-0">
        <svg className="h-full w-full transform -rotate-90">
          {/* Background circle */}
          <circle
            cx="24"
            cy="24"
            r={radius}
            stroke="var(--bg-subtle)"
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          {/* Progress circle */}
          <circle
            cx="24"
            cy="24"
            r={radius}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <span className={`absolute font-body font-bold text-xs ${textColor}`}>
          {score}
        </span>
      </div>

      <div className="flex flex-col select-none">
        <span className="text-[10px] font-bold tracking-wider text-text-muted uppercase">
          Confidence
        </span>
        <span className="text-xs font-semibold text-text-secondary">
          {score}% Match
        </span>
      </div>
    </div>
  );
}
