"use client";

import React from "react";
import { Message } from "@/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Sparkles, User, AlertTriangle } from "lucide-react";

interface ChatMessageProps {
  message: Message;
  isStreaming?: boolean;
}

function CitationCard({ count, severity, sources }: { count: number; severity: number; sources: string[] }) {
  let bg = "bg-[#2D0808]/90 border-[#DC2626]/50 text-[#FF8C8C]";
  let dot = "🔴";
  let label = "CRITICAL";

  if (severity === 4) {
    bg = "bg-[#2D1808]/90 border-[#EA580C]/50 text-[#FF9E59]";
    dot = "🟠";
    label = "HIGH RISK";
  } else if (severity === 3) {
    bg = "bg-[#2D2508]/90 border-[#CA8A04]/50 text-[#FCD34D]";
    dot = "🟡";
    label = "MODERATE";
  } else if (severity <= 2) {
    bg = "bg-[#0D200D]/90 border-[#16A34A]/50 text-[#6EE7B7]";
    dot = "🟢";
    label = "LOW RISK";
  }

  return (
    <span className="my-1.5 py-1 px-2.5 rounded-lg bg-bg-surface/80 border border-border-bright flex flex-wrap items-center gap-2 text-xs font-body shadow-sm select-none">
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border font-semibold text-[11px] ${bg}`}>
        <span>{dot}</span>
        <span>Severity {severity}/5 · {label}</span>
      </span>

      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-bg-elevated border border-border-default text-text-secondary font-medium text-[11px]">
        <span>💬</span>
        <span>{count} Community {count === 1 ? "Report" : "Reports"}</span>
      </span>

      {sources.length > 0 && (
        <span className="inline-flex flex-wrap items-center gap-1 text-[11px] text-text-muted">
          <span className="text-[10px] uppercase font-mono tracking-wider">Sources:</span>
          {sources.map((src, i) => {
            const clean = src.trim();
            const href = clean.startsWith("http") ? clean : `https://${clean}`;
            return (
              <a
                key={i}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded border border-border-default bg-bg-elevated/80 hover:bg-bg-subtle text-accent-secondary hover:text-accent-primary text-[10px] font-mono transition-colors"
              >
                {clean} ↗
              </a>
            );
          })}
        </span>
      )}
    </span>
  );
}

function parseCitationText(text: string): React.ReactNode[] {
  const citationRegex = /🔴\s*\[(?:Sourced from\s+)?(\d+)\s+independent community reports?\s*[-|]\s*Severity(?:\s*Weight)?:?\s*(\d)\/5\](?:\s*\(([^)]+)\))?/gi;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = citationRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }

    const count = parseInt(match[1], 10) || 1;
    const severity = parseInt(match[2], 10) || 5;
    const sourcesRaw = match[3] || "";
    const sources = sourcesRaw
      ? sourcesRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

    parts.push(
      <CitationCard
        key={`cit-${match.index}-${lastIndex}`}
        count={count}
        severity={severity}
        sources={sources}
      />
    );

    lastIndex = citationRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

function renderWithCitations(children: React.ReactNode): React.ReactNode {
  if (typeof children === "string") {
    return parseCitationText(children);
  }
  if (Array.isArray(children)) {
    return children.map((child, idx) => {
      if (typeof child === "string") {
        return <React.Fragment key={idx}>{parseCitationText(child)}</React.Fragment>;
      }
      return child;
    });
  }
  return children;
}

export default function ChatMessage({ message, isStreaming = false }: ChatMessageProps) {
  const isAssistant = message.role === "assistant" || message.role === "system";

  // Override markdown elements for precise design system styling
  const markdownComponents = {
    h3: ({ children }: any) => (
      <h3 className="text-base sm:text-lg font-display font-bold text-text-primary mt-6 mb-3 pb-1.5 border-b border-border-default/60 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-danger animate-pulse shrink-0" />
        <span>{renderWithCitations(children)}</span>
      </h3>
    ),
    h4: ({ children }: any) => (
      <h4 className="text-xs sm:text-sm font-display font-semibold uppercase tracking-wider text-accent-secondary mt-4 mb-2 flex items-center gap-1.5">
        <AlertTriangle className="h-3.5 w-3.5 text-danger shrink-0" />
        <span>{renderWithCitations(children)}</span>
      </h4>
    ),
    table: ({ children }: any) => (
      <div className="w-full overflow-x-auto my-5 border border-border-default rounded-xl bg-bg-surface/30 shadow-md">
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
          {renderWithCitations(children)}
        </td>
      );
    },
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
    p: ({ children }: any) => (
      <p className="mb-3.5 leading-relaxed last:mb-0">
        {renderWithCitations(children)}
      </p>
    ),
    ul: ({ children }: any) => <ul className="list-disc pl-5 mb-3.5 space-y-2">{children}</ul>,
    ol: ({ children }: any) => <ol className="list-decimal pl-5 mb-3.5 space-y-2">{children}</ol>,
    li: ({ children }: any) => (
      <li className="text-text-secondary leading-relaxed">
        {renderWithCitations(children)}
      </li>
    ),
    blockquote: ({ children }: any) => (
      <blockquote className="my-4 border-l-4 border-danger/80 bg-danger/5 p-3.5 rounded-r-xl text-text-secondary text-sm italic">
        {renderWithCitations(children)}
      </blockquote>
    ),
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
