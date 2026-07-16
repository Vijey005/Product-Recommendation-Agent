"use client";

import React from "react";
import { motion } from "framer-motion";

export default function LandingHero() {
  return (
    <div className="text-center flex flex-col items-center gap-4 select-none relative z-10">
      {/* Eyebrow Label */}
      <motion.span
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="font-body font-semibold text-xs uppercase tracking-[0.15em] text-accent-secondary"
      >
        ❖ Powered by Agentic AI
      </motion.span>

      {/* Main Title (H1) */}
      <motion.h1
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        className="font-display font-extrabold tracking-[-0.03em] leading-[1.05] text-text-primary text-4xl sm:text-5xl md:text-6xl lg:text-7xl max-w-4xl"
      >
        Your Smart Shopping <br />
        <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent-primary via-accent-secondary to-accent-primary bg-size-200 animate-bg-pan">
          Concierge.
        </span>
      </motion.h1>

      {/* Subheading */}
      <motion.p
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="font-body font-normal text-text-secondary text-sm sm:text-base md:text-lg max-w-[560px] leading-relaxed mt-2"
      >
        Tell me what you are looking for. I will interview you, search the web,
        and build a private vault of intelligence — then help you decide with
        full confidence.
      </motion.p>
    </div>
  );
}
