"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import { Loader2, Check } from "lucide-react";

const FloatingOrb = dynamic(() => import("@/components/three/FloatingOrb"), {
  ssr: false,
});

interface StatusItem {
  id: number;
  text: string;
  isDone: boolean;
  isInProgress: boolean;
}

const INITIAL_STATUSES: Omit<StatusItem, "isDone" | "isInProgress">[] = [
  { id: 1, text: "Profile locked — 5 constraints captured" },
  { id: 2, text: "Converting preferences to search queries..." },
  { id: 3, text: "Querying Google Shopping API..." },
  { id: 4, text: "Fetching top product pages via Firecrawl..." },
  { id: 5, text: "Scraping 87 user reviews from community forums..." },
  { id: 6, text: "Chunking and embedding into your private vault..." },
  { id: 7, text: "Indexing complete — 2,341 text chunks stored" },
  { id: 8, text: "Top 5 matches ranked by confidence score" },
];

interface VaultBuildingAnimationProps {
  onComplete: () => void;
  isDevilMode?: boolean;
}

export default function VaultBuildingAnimation({
  onComplete,
  isDevilMode = false,
}: VaultBuildingAnimationProps) {
  const [statuses, setStatuses] = useState<StatusItem[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [isExploding, setIsExploding] = useState(false);

  // Transition statuses one by one with a staggered interval
  useEffect(() => {
    // Add first status immediately
    setStatuses([
      {
        ...INITIAL_STATUSES[0],
        isInProgress: true,
        isDone: false,
      },
    ]);

    const interval = setInterval(() => {
      setActiveIdx((prev) => {
        const next = prev + 1;
        if (next >= INITIAL_STATUSES.length) {
          clearInterval(interval);
          // Mark all done
          setStatuses((curr) =>
            curr.map((item) => ({ ...item, isDone: true, isInProgress: false }))
          );
          // Wait 1.5s then trigger transition explosion
          setTimeout(() => {
            setIsExploding(true);
            setTimeout(onComplete, 600); // Wait for scaling animation to finish
          }, 1500);
          return prev;
        }

        setStatuses((curr) => {
          const updated = curr.map((item, idx) => {
            if (idx === prev) {
              return { ...item, isDone: true, isInProgress: false };
            }
            return item;
          });
          return [
            ...updated,
            { ...INITIAL_STATUSES[next], isInProgress: true, isDone: false },
          ];
        });

        return next;
      });
    }, 1200);

    return () => clearInterval(interval);
  }, [onComplete]);

  return (
    <AnimatePresence>
      <div className="flex flex-col items-center justify-center flex-1 w-full min-h-[480px] p-6 text-center select-none overflow-hidden relative">
        {/* Glow backdrop grid */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(91,107,248,0.03)_0%,transparent_70%)] pointer-events-none -z-10" />

        {/* 3D Orb Section */}
        <motion.div
          animate={
            isExploding
              ? { scale: 3.5, opacity: 0, filter: "blur(20px)" }
              : { scale: 1, opacity: 1 }
          }
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="shrink-0 mb-6"
        >
          <FloatingOrb isDevilMode={isDevilMode} />
        </motion.div>

        {/* Status scrolling feed */}
        <div className="w-full max-w-[500px] flex flex-col items-start gap-2.5 font-mono text-xs sm:text-sm text-left bg-bg-surface/40 border border-border-default/40 p-5 rounded-xl backdrop-blur-md shadow-2xl relative min-h-[220px]">
          {statuses.map((item, index) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="flex items-center gap-2.5 leading-relaxed text-text-primary"
            >
              {item.isDone ? (
                <div className="h-4 w-4 bg-success/20 text-success rounded-full flex items-center justify-center shrink-0 border border-success/30">
                  <Check className="h-2.5 w-2.5 stroke-[3]" />
                </div>
              ) : item.isInProgress ? (
                <Loader2 className="h-4 w-4 text-accent-primary animate-spin shrink-0" />
              ) : (
                <div className="h-1.5 w-1.5 rounded-full bg-text-muted shrink-0" />
              )}
              <span
                className={`${
                  item.isDone
                    ? "text-text-primary"
                    : item.isInProgress
                    ? "text-accent-secondary"
                    : "text-text-secondary"
                }`}
              >
                {item.text}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </AnimatePresence>
  );
}
