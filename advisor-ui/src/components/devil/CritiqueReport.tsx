"use client";

import React from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { CritiqueReport as ICritiqueReport, Product } from "@/types";
import SeverityBadge from "./SeverityBadge";
import { Button } from "@/components/ui/button";
import { Flame, ShieldAlert, AlertTriangle, HelpCircle } from "lucide-react";

interface CritiqueReportProps {
  isOpen: boolean;
  onClose: () => void;
  report: ICritiqueReport | null;
  product: Product | null;
  onSeeAlternatives: () => void;
  onBuyAnyway: () => void;
}

export default function CritiqueReport({
  isOpen,
  onClose,
  report,
  product,
  onSeeAlternatives,
  onBuyAnyway,
}: CritiqueReportProps) {
  if (!product || !report) return null;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[560px] bg-bg-surface border-l border-border-default flex flex-col p-0 gap-0 text-text-primary z-50 overflow-hidden"
      >
        {/* Header Section */}
        <div className="p-6 border-b border-border-default bg-bg-elevated/40 shrink-0">
          <span className="text-[10px] font-bold text-accent-primary uppercase tracking-[0.15em] block mb-1 font-body">
            [Critique Report]
          </span>
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-bg-base border border-border-default overflow-hidden flex items-center justify-center shrink-0">
              <img
                src={product.imageUrl}
                alt={product.name}
                className="h-full w-full object-cover select-none pointer-events-none"
              />
            </div>
            <div className="flex flex-col min-w-0">
              <h3 className="font-display font-bold text-base text-text-primary truncate">
                {product.name}
              </h3>
              <span className="text-xs text-text-secondary truncate">
                {product.brand} · {product.category}
              </span>
            </div>
          </div>
        </div>

        {/* Scrollable Issues List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Verdict Card */}
          <div className="bg-[#2D0808]/20 border border-[#DC2626]/20 rounded-xl p-4 flex flex-col gap-2 relative overflow-hidden select-none">
            <div className="absolute top-0 right-0 w-24 h-24 bg-[#DC2626]/5 rounded-full blur-xl pointer-events-none" />
            <div className="flex items-center gap-2 text-accent-primary">
              <Flame className="h-5 w-5 animate-pulse" />
              <span className="font-display font-extrabold text-sm tracking-wide uppercase">
                Adversarial Verdict
              </span>
            </div>
            <h4 className="font-display font-bold text-sm sm:text-base leading-snug text-text-primary mt-1">
              "Here is why you might want to reconsider this purchase."
            </h4>
            <p className="text-xs sm:text-sm text-text-secondary leading-relaxed mt-1">
              {report.overallVerdict}
            </p>
            <div className="text-[10px] text-text-muted mt-2 font-medium flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-accent-primary" />
              <span>Sourced from {report.communityReportCount} verified independent forum reports.</span>
            </div>
          </div>

          {/* List header */}
          <div className="flex flex-col gap-1 select-none">
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
              Discovered Flaws
            </span>
            <span className="text-xs text-text-secondary">
              Community discussions reporting hardware or value issues.
            </span>
          </div>

          {/* Core Issues Cards */}
          <div className="space-y-4">
            {report.issues.map((issue, idx) => (
              <div
                key={idx}
                className="bg-bg-elevated border border-border-default rounded-xl p-4 flex flex-col gap-3 hover:border-border-bright transition-colors select-none"
              >
                <div className="flex items-start justify-between gap-3">
                  <h4 className="font-display font-bold text-sm text-text-primary leading-tight">
                    {issue.title}
                  </h4>
                  <SeverityBadge score={issue.severityScore} />
                </div>
                <p className="text-xs sm:text-sm text-text-secondary leading-relaxed">
                  {issue.description}
                </p>
                <div className="text-[10px] text-text-muted font-medium border-t border-border-default/20 pt-2 flex items-center justify-between">
                  <span>Category: <span className="text-text-secondary capitalize">{issue.category}</span></span>
                  <span>{issue.reportCount} reports</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer Area */}
        <div className="p-6 border-t border-border-default bg-bg-elevated/20 flex items-center justify-between gap-4 shrink-0 select-none">
          <Button
            onClick={onSeeAlternatives}
            className="flex-1 bg-transparent hover:bg-bg-subtle text-accent-secondary border border-accent-primary/30 hover:border-accent-primary text-xs sm:text-sm font-semibold h-11 cursor-pointer transition-all rounded-lg"
          >
            See Alternatives Instead →
          </Button>

          {/* Slower Buy anyway action nudge - styled to be visually understated */}
          <Button
            variant="ghost"
            onClick={onBuyAnyway}
            className="text-text-muted hover:text-text-secondary border border-border-default hover:border-border-bright text-[11px] font-medium h-9 px-3 rounded-md shrink-0 cursor-pointer"
          >
            I'll Buy It Anyway ✓
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
