"use client";

import React from "react";
import { Product } from "@/types";

interface DataSourceBadgeProps {
  source: Product["dataSource"];
}

export default function DataSourceBadge({ source }: DataSourceBadgeProps) {
  let label = "Vault Cache ⚡";
  let classes = "bg-[#5B6BF8]/12 text-[#8B9BFF] border-[#5B6BF8]/25";

  if (source === "google_shopping") {
    label = "Google Shopping ✓";
    classes = "bg-[#22C55E]/12 text-[#22C55E] border-[#22C55E]/25";
  } else if (source === "live_scrape") {
    label = "Live Web Scrape";
    classes = "bg-[#F59E0B]/12 text-[#F59E0B] border-[#F59E0B]/25";
  }

  return (
    <span className={`inline-flex items-center text-[10px] font-semibold border px-2.5 py-0.5 rounded-full ${classes}`}>
      {label}
    </span>
  );
}
