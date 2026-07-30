"use client";

import React from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useAdvisorStore } from "@/store/advisorStore";
import LandingHero from "@/components/intake/LandingHero";
import IntakeInput from "@/components/intake/IntakeInput";
import { motion } from "framer-motion";

// Disable SSR for ThreeJS Canvas to prevent window/WebGL environment crashes during compile
const ParticleField = dynamic(
  () => import("@/components/three/ParticleField"),
  { ssr: false }
);

export default function Home() {
  const router = useRouter();
  const { setSessionId, setPhase, appendMessage } = useAdvisorStore();

  const handleIntakeSubmit = (query: string) => {
    // 1. Generate canonical UUID session identifier
    const sessionId = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

    // 2. Set stores
    setSessionId(sessionId);
    setPhase("intake");
    
    // Save user's initial message to store history
    appendMessage({
      id: "user-init",
      role: "user",
      content: query,
      timestamp: new Date(),
    });

    // 3. Redirect to dynamic dashboard route
    router.push(`/chat/${sessionId}`);
  };

  return (
    <main className="h-screen w-full relative flex flex-col justify-center items-center overflow-hidden bg-[#08090C] px-4">
      {/* Dynamic 3D Particle Background */}
      <ParticleField />

      {/* Grid Overlay decoration */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1c1e2715_1px,transparent_1px),linear-gradient(to_bottom,#1c1e2715_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none -z-10" />

      {/* Main Composition */}
      <div className="w-full flex flex-col items-center gap-10 max-w-4xl relative z-10">
        <LandingHero />
        <IntakeInput onSubmit={handleIntakeSubmit} />

        {/* Trust Signals Row */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="flex items-center justify-center gap-4 sm:gap-6 flex-wrap text-text-muted text-[11px] sm:text-xs font-medium font-body mt-2"
        >
          <div className="flex items-center gap-1.5 bg-bg-surface/50 border border-border-default/40 py-1 px-3 rounded-full backdrop-blur-md">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-primary animate-pulse" />
            <span>🔍 Live Web Search</span>
          </div>
          <span className="text-border-bright/60">•</span>
          <div className="flex items-center gap-1.5 bg-bg-surface/50 border border-border-default/40 py-1 px-3 rounded-full backdrop-blur-md">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-secondary animate-pulse" />
            <span>🏛️ Private Intel Vault</span>
          </div>
          <span className="text-border-bright/60">•</span>
          <div className="flex items-center gap-1.5 bg-bg-surface/50 border border-border-default/40 py-1 px-3 rounded-full backdrop-blur-md">
            <span className="h-1.5 w-1.5 rounded-full bg-success/80" />
            <span>🔒 No Data Stored</span>
          </div>
        </motion.div>
      </div>
    </main>
  );
}
