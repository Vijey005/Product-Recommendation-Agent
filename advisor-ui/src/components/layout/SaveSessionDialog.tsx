"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Bookmark, Copy, ExternalLink, Check, Mail, Lock } from "lucide-react";
import { toast } from "sonner";

interface SaveSessionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string | null;
}

export default function SaveSessionDialog({
  isOpen,
  onClose,
  sessionId,
}: SaveSessionDialogProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const mockShareUrl = `https://advisor.app/s/${sessionId?.slice(0, 8) || "a3b7f9c2"}`;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || isSaving) return;

    setIsSaving(true);
    // Simulate server write delay
    await new Promise((r) => setTimeout(r, 1200));

    setIsSaving(false);
    setIsSaved(true);
    toast.success("Research saved! Link expires in 7 days.");
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(mockShareUrl);
    setCopied(true);
    toast.success("Share link copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = () => {
    setIsSaved(false);
    setEmail("");
    setPassword("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[420px] bg-bg-surface border border-border-default text-text-primary rounded-2xl shadow-2xl p-6 z-50 select-none">
        {!isSaved ? (
          <form onSubmit={handleSave} className="space-y-4">
            <DialogHeader className="gap-1">
              <div className="h-10 w-10 rounded-full bg-accent-surface border border-accent-primary/20 text-accent-secondary flex items-center justify-center shrink-0 mb-1 select-none">
                <Bookmark className="h-5 w-5" />
              </div>
              <DialogTitle className="font-display font-extrabold text-lg text-text-primary">
                Save Your Research
              </DialogTitle>
              <DialogDescription className="text-text-secondary text-xs sm:text-sm font-body leading-relaxed">
                Your intelligence vault and chat history will be preserved for 7 days with a secure shareable link.
              </DialogDescription>
            </DialogHeader>

            {/* Inputs area */}
            <div className="space-y-3 pt-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
                  Email Address
                </label>
                <div className="flex items-center gap-2 px-3 py-2 bg-bg-elevated border border-border-default rounded-xl focus-within:border-accent-primary transition-all">
                  <Mail className="h-4 w-4 text-text-muted shrink-0" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="bg-transparent border-none outline-none font-body text-sm w-full text-text-primary placeholder-text-muted"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
                  Access Password (Optional)
                </label>
                <div className="flex items-center gap-2 px-3 py-2 bg-bg-elevated border border-border-default rounded-xl focus-within:border-accent-primary transition-all">
                  <Lock className="h-4 w-4 text-text-muted shrink-0" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter access lock code"
                    className="bg-transparent border-none outline-none font-body text-sm w-full text-text-primary placeholder-text-muted"
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="pt-3 gap-2 flex-row sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={handleClose}
                className="text-text-secondary hover:text-text-primary font-semibold hover:bg-bg-subtle h-10 px-4 rounded-lg"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSaving}
                className="bg-accent-primary hover:bg-accent-secondary text-white font-semibold h-10 px-4 rounded-lg cursor-pointer"
              >
                {isSaving ? "Saving..." : "Save & Get Link →"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-5 animate-fadeIn duration-300">
            <DialogHeader className="gap-1">
              <div className="h-10 w-10 rounded-full bg-success/15 border border-success/30 text-success flex items-center justify-center shrink-0 mb-1 select-none">
                <Check className="h-5 w-5 stroke-[3]" />
              </div>
              <DialogTitle className="font-display font-extrabold text-lg text-text-primary">
                Research Locked & Saved!
              </DialogTitle>
              <DialogDescription className="text-text-secondary text-xs sm:text-sm font-body leading-relaxed">
                Your concierge session is now cached. Anyone with this link can view the vault details.
              </DialogDescription>
            </DialogHeader>

            {/* Share link card */}
            <div className="bg-bg-elevated border border-border-default rounded-xl p-3.5 flex items-center justify-between gap-3">
              <span className="font-mono text-xs text-text-secondary select-all truncate flex-1 pr-2">
                {mockShareUrl}
              </span>
              <div className="flex gap-1.5 shrink-0">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleCopyLink}
                  className="h-8 w-8 text-text-secondary hover:text-text-primary hover:bg-bg-subtle rounded-md"
                  title="Copy Link"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-success" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
                <a
                  href={mockShareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-8 w-8 text-text-secondary hover:text-text-primary hover:bg-bg-subtle rounded-md flex items-center justify-center transition-colors"
                  title="Open Link"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                onClick={handleClose}
                className="w-full bg-accent-primary hover:bg-accent-secondary text-white font-semibold h-11 rounded-lg cursor-pointer"
              >
                Done
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
