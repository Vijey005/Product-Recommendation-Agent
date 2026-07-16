"use client";

import React, { useState, useEffect } from "react";
import { Sparkles, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

const EXAMPLE_PROMPTS = [
  "I'm a final year AI student looking for a laptop...",
  "Need a portable camera for outdoor vlogging under $800...",
  "Looking for noise cancelling headphones for daily flights...",
  "Best mechanical keyboard for programming and quiet typing...",
];

interface IntakeInputProps {
  onSubmit: (val: string) => void;
}

export default function IntakeInput({ onSubmit }: IntakeInputProps) {
  const [value, setValue] = useState("");
  const [placeholder, setPlaceholder] = useState("");
  const [promptIdx, setPromptIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Typewriter effect logic
  useEffect(() => {
    const currentPrompt = EXAMPLE_PROMPTS[promptIdx];
    let timer: NodeJS.Timeout;

    if (isDeleting) {
      // Erasing
      timer = setTimeout(() => {
        setPlaceholder(currentPrompt.slice(0, charIdx - 1));
        setCharIdx((prev) => prev - 1);
      }, 30);
    } else {
      // Typing
      timer = setTimeout(() => {
        setPlaceholder(currentPrompt.slice(0, charIdx + 1));
        setCharIdx((prev) => prev + 1);
      }, 60);
    }

    // Switch states based on thresholds
    if (!isDeleting && charIdx === currentPrompt.length) {
      // Pause at the end of typing
      timer = setTimeout(() => setIsDeleting(true), 2500);
    } else if (isDeleting && charIdx === 0) {
      setIsDeleting(false);
      setPromptIdx((prev) => (prev + 1) % EXAMPLE_PROMPTS.length);
    }

    return () => clearTimeout(timer);
  }, [charIdx, isDeleting, promptIdx]);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim() || isSubmitting) return;

    setIsSubmitting(true);
    onSubmit(value);
  };

  return (
    <motion.form
      onSubmit={handleFormSubmit}
      initial={{ opacity: 0, y: 20 }}
      animate={{
        opacity: isSubmitting ? 0.9 : 1,
        scale: isSubmitting ? 0.97 : 1,
        y: 0,
      }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="w-full max-w-[680px] px-6 select-none relative z-10"
    >
      <div
        className="w-full h-16 rounded-full bg-bg-surface/80 border border-border-default hover:border-border-bright focus-within:border-accent-primary focus-within:hover:border-accent-primary transition-all duration-300 flex items-center px-5 gap-3 shadow-lg shadow-black/40 focus-within:shadow-[0_0_24px_rgba(91,107,248,0.2)] group"
        style={{ backdropFilter: "blur(20px)" }}
      >
        {/* Left Icon: Sparkles */}
        <Sparkles className="h-5 w-5 text-accent-primary group-focus-within:animate-pulse shrink-0" />

        {/* Input area */}
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          disabled={isSubmitting}
          className="flex-1 bg-transparent text-text-primary placeholder-text-muted text-sm sm:text-base border-none outline-none font-body py-1 h-full min-w-0"
        />

        {/* Right Arrow/Submit button */}
        <button
          type="submit"
          disabled={!value.trim() || isSubmitting}
          className="h-11 w-11 rounded-full bg-accent-primary hover:bg-accent-secondary disabled:bg-bg-subtle disabled:text-text-muted text-white flex items-center justify-center transition-all duration-300 shadow-md shadow-accent-primary/10 hover:shadow-accent-primary/20 shrink-0 hover:scale-105 active:scale-95"
        >
          <ArrowRight className="h-5 w-5" />
        </button>
      </div>
    </motion.form>
  );
}
