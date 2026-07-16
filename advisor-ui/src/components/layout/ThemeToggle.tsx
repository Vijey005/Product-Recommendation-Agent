"use client";

import React, { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="w-9 h-9 rounded-md bg-bg-subtle" />;
  }

  const cycleTheme = () => {
    if (theme === "light") {
      setTheme("dark");
    } else {
      setTheme("light");
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={cycleTheme}
      className="text-text-secondary hover:text-text-primary hover:bg-bg-subtle transition-all duration-300"
      aria-label="Toggle Theme"
    >
      {theme === "dark" && <Moon className="h-5 w-5" />}
      {theme === "light" && <Sun className="h-5 w-5 text-warning" />}
      {theme === "devil-mode" && <Flame className="h-5 w-5 text-accent-primary animate-pulse" />}
    </Button>
  );
}
