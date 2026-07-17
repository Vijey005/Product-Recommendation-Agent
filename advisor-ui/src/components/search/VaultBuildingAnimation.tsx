"use client";

import React, { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import { Loader2, Check, AlertTriangle } from "lucide-react";

const FloatingOrb = dynamic(() => import("@/components/three/FloatingOrb"), {
  ssr: false,
});

export interface VaultStep {
  text: string;
  isDone: boolean;
  isError?: boolean;
}

interface VaultBuildingAnimationProps {
  /** Live steps fed from the SSE progress stream */
  steps: VaultStep[];
  /** True when backend signals the vault is fully ready */
  isDone: boolean;
  /** Called once the completion animation finishes */
  onComplete: () => void;
  isDevilMode?: boolean;
}

export default function VaultBuildingAnimation({
  steps,
  isDone,
  onComplete,
  isDevilMode = false,
}: VaultBuildingAnimationProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const hasExploded = useRef(false);

  // Auto-scroll the list to always show the latest step
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [steps]);

  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // When backend says done, wait 1.2 s then trigger explosion and call onComplete
  useEffect(() => {
    if (isDone && !hasExploded.current) {
      hasExploded.current = true;
      const t = setTimeout(() => {
        onCompleteRef.current();
      }, 1200);
      return () => clearTimeout(t);
    }
  }, [isDone]);

  return (
    <AnimatePresence>
      <div className="flex flex-col items-center justify-center flex-1 w-full min-h-[480px] p-6 text-center select-none overflow-hidden relative">
        {/* Glow backdrop */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(91,107,248,0.04)_0%,transparent_70%)] pointer-events-none -z-10" />

        {/* 3D Orb — pulses more intensely when done */}
        <motion.div
          animate={isDone ? { scale: [1, 1.12, 1], opacity: 1 } : { scale: 1, opacity: 1 }}
          transition={isDone ? { duration: 0.6, ease: "easeInOut" } : {}}
          className="shrink-0 mb-6"
        >
          <FloatingOrb isDevilMode={isDevilMode} />
        </motion.div>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-4 text-center"
        >
          <h2 className="font-display font-bold text-lg text-text-primary tracking-tight">
            {isDone ? "🎉 Intelligence Vault Ready!" : "🔬 Building your Product Intelligence Vault"}
          </h2>
          <p className="text-xs text-text-secondary mt-1">
            {isDone
              ? "All specs indexed — you can now ask anything about these products."
              : "Crawling the web and extracting specs in real-time…"}
          </p>
        </motion.div>

        {/* Live status feed — purely driven by backend progress events */}
        <div
          ref={listRef}
          className="w-full max-w-[540px] flex flex-col gap-2 font-mono text-xs sm:text-sm text-left bg-bg-surface/40 border border-border-default/40 p-5 rounded-xl backdrop-blur-md shadow-2xl overflow-y-auto"
          style={{ maxHeight: "260px", minHeight: "180px" }}
        >
          {steps.length === 0 && (
            <div className="flex items-center gap-2.5 text-text-secondary animate-pulse">
              <Loader2 className="h-4 w-4 text-accent-primary animate-spin shrink-0" />
              <span>Initialising search pipeline…</span>
            </div>
          )}

          {steps.map((step, idx) => {
            const isLatest = !step.isDone && idx === steps.length - 1;
            return (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25 }}
                className="flex items-start gap-2.5 leading-relaxed"
              >
                {/* Icon */}
                <div className="mt-0.5 shrink-0">
                  {step.isError ? (
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                  ) : step.isDone ? (
                    <div className="h-4 w-4 bg-success/20 text-success rounded-full flex items-center justify-center border border-success/30">
                      <Check className="h-2.5 w-2.5 stroke-[3]" />
                    </div>
                  ) : isLatest ? (
                    <Loader2 className="h-4 w-4 text-accent-primary animate-spin" />
                  ) : (
                    <div className="h-1.5 w-1.5 mt-1 rounded-full bg-text-muted" />
                  )}
                </div>

                {/* Text */}
                <span
                  className={
                    step.isDone
                      ? "text-text-primary"
                      : isLatest
                      ? "text-accent-secondary font-medium"
                      : "text-text-secondary"
                  }
                >
                  {step.text}
                </span>
              </motion.div>
            );
          })}

          {isDone && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.3 }}
              className="flex items-center gap-2.5 text-success font-semibold mt-1"
            >
              <div className="h-4 w-4 bg-success/20 rounded-full flex items-center justify-center border border-success/30">
                <Check className="h-2.5 w-2.5 stroke-[3]" />
              </div>
              <span>Vault sealed — {steps.length} steps complete</span>
            </motion.div>
          )}
        </div>
      </div>
    </AnimatePresence>
  );
}
