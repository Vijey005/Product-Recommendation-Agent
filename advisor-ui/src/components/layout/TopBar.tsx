"use client";

import React from "react";
import { useAdvisorStore } from "@/store/advisorStore";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Copy, Terminal, ShieldCheck, Flame, Menu } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import Sidebar from "@/components/layout/Sidebar";

interface TopBarProps {
  onSaveClick?: () => void;
}

export default function TopBar({ onSaveClick }: TopBarProps) {
  const { sessionId, isDevilMode, setDevilMode } = useAdvisorStore();
  const { theme, setTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const handleCopySession = () => {
    if (sessionId) {
      navigator.clipboard.writeText(sessionId);
      toast.success("Session ID copied to clipboard!");
    }
  };

  // Synchronize isDevilMode state with next-themes and DOM root class
  React.useEffect(() => {
    if (!isDevilMode) {
      if (theme === "devil-mode") {
        setTheme("dark");
      }
      if (typeof document !== "undefined") {
        document.documentElement.classList.remove("devil-mode");
      }
    } else {
      if (theme !== "devil-mode") {
        setTheme("devil-mode");
      }
      if (typeof document !== "undefined") {
        document.documentElement.classList.add("devil-mode");
      }
    }
  }, [isDevilMode, theme, setTheme]);

  const handleExitDevilMode = () => {
    setDevilMode(false);
    setTheme("dark");
    if (typeof document !== "undefined") {
      document.documentElement.classList.remove("devil-mode");
      document.documentElement.classList.add("dark");
    }
    toast.info("Exited Devil's Advocate Mode");
  };

  return (
    <header className="h-16 border-b border-border-default bg-bg-surface/50 backdrop-blur-md flex items-center justify-between px-6 select-none shrink-0 z-20">
      {/* Left Area: Context status */}
      <div className="flex items-center gap-3">
        {/* Mobile Hamburger menu */}
        <div className="md:hidden flex items-center">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger
              render={
                <button className="h-9 w-9 flex items-center justify-center text-text-secondary hover:text-text-primary mr-1 bg-transparent hover:bg-bg-subtle border-none rounded-md transition-colors cursor-pointer" />
              }
            >
              <Menu className="h-5 w-5" />
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-[260px] bg-bg-surface border-r border-border-default h-full">
              <Sidebar onSaveClick={() => {
                onSaveClick?.();
                setMobileOpen(false);
              }} />
            </SheetContent>
          </Sheet>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-text-secondary bg-bg-subtle border border-border-bright rounded-md py-1 px-2.5">
          <Terminal className="h-3.5 w-3.5 text-accent-secondary" />
          <span className="font-mono tracking-tight font-medium">
            {sessionId ? `session:${sessionId.slice(0, 8)}...` : "connecting..."}
          </span>
          {sessionId && (
            <button
              onClick={handleCopySession}
              className="hover:text-text-primary ml-1 transition-colors"
              title="Copy Session ID"
            >
              <Copy className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 text-[11px] text-success bg-success/10 border border-success/20 rounded-md py-1 px-2.5 font-medium">
          <ShieldCheck className="h-3.5 w-3.5 text-success" />
          <span>Grounded in Vault</span>
        </div>
      </div>

      {/* Right Area: Exit Devil Mode button if active */}
      <div className="flex items-center gap-2">
        {isDevilMode && (
          <Button
            size="sm"
            onClick={handleExitDevilMode}
            className="bg-accent-primary hover:bg-accent-secondary text-white font-semibold text-xs gap-1.5 h-8 animate-pulse rounded-md"
          >
            <Flame className="h-3.5 w-3.5" />
            Exit Devil Mode
          </Button>
        )}
      </div>
    </header>
  );
}
