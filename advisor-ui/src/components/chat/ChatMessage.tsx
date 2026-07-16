"use client";

import React from "react";
import { Message } from "@/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Sparkles, User } from "lucide-react";

interface ChatMessageProps {
  message: Message;
  isStreaming?: boolean;
}

export default function ChatMessage({ message, isStreaming = false }: ChatMessageProps) {
  const isAssistant = message.role === "assistant" || message.role === "system";

  // Override markdown elements for precise design system styling
  const markdownComponents = {
    // Custom table override matching the specs
    table: ({ children }: any) => (
      <div className="w-full overflow-x-auto my-5 border border-border-default rounded-xl bg-bg-surface/30">
        <table className="w-full border-collapse text-left text-sm min-w-[560px]">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }: any) => (
      <thead className="bg-bg-elevated text-text-primary font-display font-semibold border-b border-border-default">
        {children}
      </thead>
    ),
    th: ({ children }: any) => (
      <th className="p-3.5 font-semibold text-xs uppercase tracking-wider border-r border-border-default/50 last:border-r-0">
        {children}
      </th>
    ),
    tr: ({ children }: any) => (
      <tr className="hover:bg-bg-subtle/30 odd:bg-transparent even:bg-bg-elevated/20 transition-colors border-b border-border-default last:border-b-0">
        {children}
      </tr>
    ),
    td: ({ children }: any) => {
      const text = String(children);
      let dotPrefix = null;

      // best in class (green) and worst (red) indicators
      if (text.includes("Up to 22 hours") || text.includes("22 hours") || text.includes("16GB Unified") || text.includes("$1,149") || text.includes("3.3 lbs") || text.includes("OLED")) {
        dotPrefix = <span className="h-2 w-2 rounded-full bg-success inline-block mr-2 align-middle shrink-0 shadow-sm shadow-success/30" />;
      } else if (text.includes("Up to 6 hours") || text.includes("6 hours") || text.includes("Plastic") || text.includes("Integrated") || text.includes("$1,699") || text.includes("4.1 lbs")) {
        dotPrefix = <span className="h-2 w-2 rounded-full bg-danger inline-block mr-2 align-middle shrink-0 shadow-sm shadow-danger/30" />;
      }

      return (
        <td className="p-3 border-r border-border-default/50 last:border-r-0 align-middle text-text-secondary font-medium">
          {dotPrefix}
          {children}
        </td>
      );
    },
    // Custom inline link override for Citations [MacBook Pro ↗]
    a: ({ href, children }: any) => {
      const isCitation = href?.startsWith("prod-") || href?.includes("prod-") || href?.includes("Alternative");
      if (isCitation) {
        return (
          <span className="inline-flex items-center gap-0.5 bg-accent-surface border border-accent-primary/20 text-accent-secondary px-2 py-0.5 rounded-full text-xs font-semibold hover:bg-accent-surface/80 transition-all cursor-pointer align-baseline select-none mx-0.5">
            {children} ↗
          </span>
        );
      }
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent-secondary hover:text-accent-primary underline transition-all font-semibold"
        >
          {children}
        </a>
      );
    },
    p: ({ children }: any) => <p className="mb-3.5 leading-relaxed last:mb-0">{children}</p>,
    ul: ({ children }: any) => <ul className="list-disc pl-5 mb-3.5 space-y-1">{children}</ul>,
    ol: ({ children }: any) => <ol className="list-decimal pl-5 mb-3.5 space-y-1">{children}</ol>,
    li: ({ children }: any) => <li className="text-text-secondary">{children}</li>,
  };

  return (
    <div
      className={`flex w-full gap-4 py-6 border-b border-border-default/20 last:border-0 ${
        isAssistant ? "justify-start" : "justify-end"
      }`}
    >
      {/* Assistant Avatar */}
      {isAssistant && (
        <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-accent-primary to-accent-secondary flex items-center justify-center shadow-md shadow-accent-primary/10 shrink-0 select-none">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
      )}

      {/* Message Bubble Container */}
      <div
        className={`max-w-[85%] flex flex-col gap-1 ${
          isAssistant ? "items-start" : "items-end"
        }`}
      >
        {/* You/AI Name Tag */}
        <span className="text-[10px] font-bold tracking-wider text-text-muted uppercase select-none">
          {isAssistant ? "AI Concierge" : "You"}
        </span>

        {/* Bubble contents */}
        {isAssistant ? (
          <div
            className={`font-body text-sm sm:text-base text-text-primary ${
              isStreaming ? "streaming-cursor" : ""
            }`}
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={markdownComponents as any}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="bg-bg-elevated border border-border-bright rounded-2xl rounded-tr-sm px-4 py-2.5 font-body text-sm sm:text-base text-text-primary shadow-md">
            <p className="leading-relaxed whitespace-pre-wrap">{message.content}</p>
          </div>
        )}
      </div>

      {/* User Avatar */}
      {!isAssistant && (
        <div className="h-8 w-8 rounded-full bg-bg-surface border border-border-bright flex items-center justify-center shrink-0 select-none">
          <User className="h-4 w-4 text-text-secondary" />
        </div>
      )}
    </div>
  );
}
