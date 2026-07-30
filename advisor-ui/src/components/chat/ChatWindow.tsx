"use client";

import React, { useRef, useEffect, useState } from "react";
import { Message, SelectionChip } from "@/types";
import ChatMessage from "./ChatMessage";
import ChatInput from "./ChatInput";
import SelectionChips from "@/components/intake/SelectionChips";
import VaultReadyBanner from "@/components/vault/VaultReadyBanner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, Terminal, ChevronDown, ChevronRight, Activity } from "lucide-react";

interface ChatWindowProps {
  messages: Message[];
  isStreaming: boolean;
  onSendMessage: (msg: string) => void;
  showQuickChips?: boolean;
  chips?: SelectionChip[];
  onChipSelect?: (value: string) => void;
  vaultReadyData?: { count: number } | null;
  onDismissVaultBanner?: () => void;
}

const QUICK_CHIPS = [
  { label: "Compare all GPUs →", value: "Compare all GPUs in my vault", category: "quick" },
  { label: "Best for battery life?", value: "Which product has the best battery life?", category: "quick" },
  { label: "Cheapest option?", value: "What is the cheapest product in my vault?", category: "quick" },
];

export default function ChatWindow({
  messages,
  isStreaming,
  onSendMessage,
  showQuickChips = false,
  chips = [],
  onChipSelect,
  vaultReadyData,
  onDismissVaultBanner,
}: ChatWindowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [reasoningOpen, setReasoningOpen] = useState<Record<string, boolean>>({});

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isStreaming]);

  const toggleReasoning = (id: string) => {
    setReasoningOpen((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="flex flex-col h-full bg-transparent relative">
      {/* Scrollable Chat Area */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-2 min-h-0 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 gap-3">
            <div className="h-10 w-10 rounded-full bg-accent-surface border border-accent-primary/20 flex items-center justify-center text-accent-secondary shadow-md animate-pulse">
              <Sparkles className="h-5 w-5" />
            </div>
            <h3 className="font-display font-semibold text-base text-text-primary">
              Ask Anything
            </h3>
            <p className="text-xs sm:text-sm text-text-secondary max-w-sm leading-relaxed">
              Query specifications, compare performance stats, or request alternatives. Answers are grounded in your private vault.
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            {messages.map((msg, index) => {
              const isLast = index === messages.length - 1;
              const hasReasoning = msg.role === "assistant" && !msg.isStreaming;

              return (
                <div key={msg.id || index} className="flex flex-col">
                  {/* Chat message bubbles */}
                  <ChatMessage message={msg} isStreaming={isLast && isStreaming} />

                  {/* Collapsible Agent Reasoning timeline */}
                  {hasReasoning && (
                    <div className="pl-12 pb-4 -mt-2">
                      <button
                        onClick={() => toggleReasoning(msg.id)}
                        className="flex items-center gap-1.5 font-body font-medium text-[11px] text-text-muted hover:text-text-secondary cursor-pointer transition-colors border-none bg-transparent"
                      >
                        {reasoningOpen[msg.id] ? (
                          <ChevronDown className="h-3 w-3 text-accent-secondary" />
                        ) : (
                          <ChevronRight className="h-3 w-3" />
                        )}
                        <span>View Agent Reasoning Trail</span>
                      </button>

                      {reasoningOpen[msg.id] && (
                        <div className="mt-3 ml-1.5 pl-4 border-l border-accent-primary/20 space-y-3 py-1 animate-fadeIn duration-200">
                          {/* Step 1 */}
                          <div className="flex items-start gap-2.5 text-[11px] text-text-secondary">
                            <span className="h-4.5 w-4.5 rounded-full bg-accent-surface border border-accent-primary/30 flex items-center justify-center font-mono font-bold text-accent-secondary text-[9px] shrink-0">
                              1
                            </span>
                            <div className="flex flex-col">
                              <span className="font-semibold text-text-primary">Parsed search parameters</span>
                              <span className="text-[10px] text-text-muted">Targeting constraint criteria & keywords.</span>
                            </div>
                          </div>

                          {/* Step 2 */}
                          <div className="flex items-start gap-2.5 text-[11px] text-text-secondary">
                            <span className="h-4.5 w-4.5 rounded-full bg-accent-surface border border-accent-primary/30 flex items-center justify-center font-mono font-bold text-accent-secondary text-[9px] shrink-0">
                              2
                            </span>
                            <div className="flex flex-col">
                              <span className="font-semibold text-text-primary">Vault search context matching</span>
                              <span className="text-[10px] text-text-muted">Extracted 3 spec chunks from ChromaDB.</span>
                            </div>
                          </div>

                          {/* Step 3 */}
                          <div className="flex items-start gap-2.5 text-[11px] text-text-secondary">
                            <span className="h-4.5 w-4.5 rounded-full bg-accent-surface border border-accent-primary/30 flex items-center justify-center font-mono font-bold text-accent-secondary text-[9px] shrink-0">
                              3
                            </span>
                            <div className="flex flex-col">
                              <div className="flex items-center gap-1">
                                <span className="font-semibold text-text-primary">Evaluated grounding confidence</span>
                                <Activity className="h-3 w-3 text-success" />
                              </div>
                              <span className="text-[10px] text-text-muted">Faithfulness: 0.94 · Answer precision: 0.89</span>
                            </div>
                          </div>

                          {/* Step 4 */}
                          <div className="flex items-start gap-2.5 text-[11px] text-text-secondary">
                            <span className="h-4.5 w-4.5 rounded-full bg-accent-surface border border-accent-primary/30 flex items-center justify-center font-mono font-bold text-accent-secondary text-[9px] shrink-0">
                              4
                            </span>
                            <div className="flex flex-col">
                              <span className="font-semibold text-text-primary">Generated formatted RAG response</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Quick Action Suggestion Chips */}
        {showQuickChips && messages.length > 0 && !isStreaming && (
          <div className="pl-12 pb-4 animate-fadeIn">
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider block mb-1">
              Suggested Questions:
            </span>
            <SelectionChips
              chips={QUICK_CHIPS}
              selectedValues={[]}
              onSelect={(val) => onSendMessage(val)}
            />
          </div>
        )}

        {/* Dynamic Interview Option Chips */}
        {!isStreaming && chips && chips.length > 0 && (
          <div className="pl-12 pb-4 animate-fadeIn">
            <span className="text-[10px] font-bold text-accent-secondary uppercase tracking-wider block mb-1 font-body">
              Select an option:
            </span>
            <SelectionChips
              chips={chips}
              selectedValues={[]}
              onSelect={onChipSelect || (() => {})}
            />
          </div>
        )}

        {/* Vault Ready Banner */}
        {vaultReadyData && onDismissVaultBanner && (
          <div className="mt-4 animate-fadeIn">
            <VaultReadyBanner 
              count={vaultReadyData.count} 
              onDismiss={onDismissVaultBanner}
              onActionClick={(action) => onSendMessage(action)}
            />
          </div>
        )}

        {/* Scroll anchor */}
        <div ref={scrollRef} className="h-2" />
      </div>

      {/* Input container */}
      <div className="p-4 border-t border-border-default/20 bg-bg-base/80 backdrop-blur-md shrink-0">
        <ChatInput onSend={onSendMessage} disabled={isStreaming} />
      </div>
    </div>
  );
}
