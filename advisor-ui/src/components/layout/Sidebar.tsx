"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { useTheme } from "next-themes";
import {
  Sparkles,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Bookmark,
  RefreshCw,
  PlusCircle,
  HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAdvisorStore } from "@/store/advisorStore";
import ThemeToggle from "./ThemeToggle";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface SidebarProps {
  onSaveClick?: () => void;
}

export default function Sidebar({ onSaveClick }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { searchQuotaRemaining, resetSession, phase } = useAdvisorStore();
  const { theme, setTheme } = useTheme();

  const handleNewResearch = () => {
    resetSession();
    toast.info("Started new research session");
  };

  const handleSave = () => {
    if (onSaveClick) {
      onSaveClick();
    } else {
      toast.success("Research progress saved!");
    }
  };

  return (
    <motion.div
      animate={{ width: isCollapsed ? 64 : 260 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="h-screen bg-bg-surface border-r border-border-default flex flex-col justify-between relative overflow-hidden select-none z-30 shrink-0"
    >
      {/* Collapse Toggle Button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute top-4 right-2 text-text-secondary hover:text-text-primary z-40 h-8 w-8 hover:bg-bg-subtle"
      >
        {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </Button>

      {/* Top Section */}
      <div className="flex flex-col flex-1 pt-6 px-3 gap-6 overflow-hidden">
        {/* App Logo */}
        <div className="flex items-center gap-3 px-2 overflow-hidden h-9 shrink-0">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-accent-primary to-accent-secondary flex items-center justify-center shadow-lg shadow-accent-primary/20 shrink-0">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          {!isCollapsed && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="font-display font-extrabold text-lg text-text-primary tracking-tight"
            >
              ADVISOR
            </motion.span>
          )}
        </div>

        {/* Action Button: Start New Research */}
        <Button
          variant="outline"
          onClick={handleNewResearch}
          className="w-full justify-start gap-2 border-border-bright hover:border-accent-primary hover:bg-bg-subtle text-text-primary h-10 transition-all shrink-0 overflow-hidden"
        >
          <PlusCircle className="h-4 w-4 shrink-0 text-accent-secondary" />
          {!isCollapsed && <span className="text-sm font-body font-medium">New Research</span>}
        </Button>

        {/* Middle: Session list / Empty states */}
        <div className="flex-1 flex flex-col gap-2 overflow-y-auto min-h-0 py-2">
          {!isCollapsed && (
            <span className="text-[10px] font-semibold tracking-wider text-text-muted px-2 uppercase shrink-0">
              Recent Research
            </span>
          )}
          <div className="flex-1 flex flex-col gap-1">
            {!isCollapsed ? (
              <div className="flex-1 flex flex-col items-center justify-center p-4 text-center select-none gap-2">
                <BookOpen className="h-6 w-6 text-text-muted opacity-50" />
                <span className="text-xs font-semibold text-text-secondary">No past research yet.</span>
                <span className="text-[11px] text-text-muted">Saved sessions will list here.</span>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center pt-4">
                <BookOpen className="h-5 w-5 text-text-muted opacity-50" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Section */}
      <div className="p-3 border-t border-border-default flex flex-col gap-4 bg-bg-surface/50 backdrop-blur-md shrink-0">
        {/* Quota Progress Bar */}
        <div className="flex flex-col gap-1.5 px-2">
          <div className="flex justify-between items-center text-[10px] font-semibold text-text-secondary">
            {!isCollapsed && <span>SEARCH QUOTA</span>}
            <span>{searchQuotaRemaining} / 5</span>
          </div>
          <Progress
            value={(searchQuotaRemaining / 5) * 100}
            className="h-1.5 bg-bg-subtle"
          />
          {!isCollapsed && (
            <span className="text-[9px] text-text-muted">Resets in 24 hours</span>
          )}
        </div>

        {/* Actions & Avatar Row */}
        <div className="flex flex-col gap-1 border-t border-border-default/50 pt-3">
          {/* Save Research Button */}
          <Button
            variant="ghost"
            onClick={handleSave}
            className="w-full justify-start gap-3 text-text-secondary hover:text-text-primary hover:bg-bg-subtle px-2 h-9"
          >
            <Bookmark className="h-5 w-5 shrink-0" />
            {!isCollapsed && <span className="text-xs font-medium">Save Research</span>}
          </Button>

          {/* Theme Toggle Button inline inside sidebar */}
          <div className="flex items-center justify-between px-2 py-1">
            {!isCollapsed && (
              <span className="text-xs font-medium text-text-secondary">Theme Settings</span>
            )}
            <ThemeToggle />
          </div>

          {/* User Profile */}
          <div className="flex items-center gap-3 px-2 py-2 mt-1 border-t border-border-default/30">
            <Avatar className="h-8 w-8 border border-border-bright shrink-0">
              <AvatarImage src="" />
              <AvatarFallback className="bg-gradient-to-tr from-accent-primary to-accent-secondary text-white font-bold text-xs">
                US
              </AvatarFallback>
            </Avatar>
            {!isCollapsed && (
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-text-primary truncate">User Session</span>
                <span className="text-[10px] text-text-muted truncate">Anonymous Guest</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
