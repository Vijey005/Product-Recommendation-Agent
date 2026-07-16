"use client";

import React from "react";
import { motion } from "framer-motion";
import { SelectionChip } from "@/types";

interface SelectionChipsProps {
  chips: SelectionChip[];
  selectedValues: string[];
  onSelect: (value: string) => void;
}

export default function SelectionChips({
  chips,
  selectedValues,
  onSelect,
}: SelectionChipsProps) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: {
          transition: {
            staggerChildren: 0.05,
          },
        },
      }}
      className="flex flex-wrap gap-2.5 my-4"
    >
      {chips.map((chip, index) => {
        const isSelected = selectedValues.includes(chip.value);
        return (
          <motion.button
            key={index}
            variants={{
              hidden: { opacity: 0, y: 8 },
              show: { opacity: 1, y: 0 },
            }}
            type="button"
            onClick={() => onSelect(chip.value)}
            className={`h-9 px-4 rounded-full font-body font-medium text-xs sm:text-sm border transition-all duration-200 cursor-pointer flex items-center gap-1.5 hover:scale-102 active:scale-98 select-none ${
              isSelected
                ? "bg-accent-surface border-accent-primary text-accent-secondary"
                : "border-border-bright bg-transparent text-text-secondary hover:bg-bg-elevated hover:border-accent-primary"
            }`}
          >
            {chip.icon && <span className="text-sm shrink-0">{chip.icon}</span>}
            <span>{chip.label}</span>
          </motion.button>
        );
      })}
    </motion.div>
  );
}
