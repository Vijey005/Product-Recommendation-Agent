"use client";

import { useState, useCallback } from "react";
import { streamMockResponse } from "@/lib/mockData";

interface SSEOptions {
  onToken?: (token: string) => void;
  onStatus?: (status: string) => void;
  onProgress?: (step: string) => void;
  onDone?: (metadata: any) => void;
  onError?: (error: string) => void;
}

export function useSSE() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [controller, setController] = useState<AbortController | null>(null);

  const stopStreaming = useCallback(() => {
    if (controller) {
      controller.abort();
      setController(null);
    }
    setIsStreaming(false);
  }, [controller]);

  const startStreaming = useCallback(
    async (url: string, body: any, options: SSEOptions = {}) => {
      stopStreaming();
      setIsStreaming(true);

      const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";
      const abortCtrl = new AbortController();
      setController(abortCtrl);

      const { onToken, onStatus, onProgress, onDone, onError } = options;

      if (useMock) {
        try {
          // Simulate backend latency
          await new Promise((r) => setTimeout(r, 600));

          if (url.includes("/advocate")) {
            onStatus?.("👹 Harvesting community feedback for " + body.product_name + "...");
            await new Promise((r) => setTimeout(r, 1000));
            onStatus?.("✅ Verified critique signals vaulted. Analysing...");
            await new Promise((r) => setTimeout(r, 800));

            const { MOCK_CRITIQUES } = await import("@/lib/mockData");
            // Match mock product critique
            const prod = Object.values(MOCK_CRITIQUES).find(
              (p) => p.productId === body.product_name || body.product_name.toLowerCase().includes(p.productId)
            ) || MOCK_CRITIQUES["prod-2"];

            const critiqueText = `👹 **Devil's Advocate Verdict:** ${prod.overallVerdict}\n\nHere are the critical community issues discovered:\n\n${prod.issues
              .map(
                (issue) =>
                  `- 🔴 **${issue.title}** (Severity: ${issue.severityScore}/5) — ${issue.description} [Sourced from ${issue.reportCount} reports]\n`
              )
              .join("")}\nWould you like to see recommended alternatives?`;

            for await (const chunk of streamMockResponse(critiqueText)) {
              if (abortCtrl.signal.aborted) break;
              onToken?.(chunk);
            }
            onDone?.({ is_advocate_mode: true, product_critiqued: body.product_name });
          } else {
            // Chat streaming
            const messageLower = body.message.toLowerCase();
            const { MOCK_RAG_ANSWERS, MOCK_PRODUCTS } = await import("@/lib/mockData");

            let targetText = MOCK_RAG_ANSWERS.default;
            if (messageLower.includes("gpu") || messageLower.includes("graphics") || messageLower.includes("gaming")) {
              targetText = MOCK_RAG_ANSWERS.gpu;
            } else if (messageLower.includes("battery") || messageLower.includes("life") || messageLower.includes("hours")) {
              targetText = MOCK_RAG_ANSWERS.battery;
            } else if (messageLower.includes("cheap") || messageLower.includes("cost") || messageLower.includes("budget")) {
              targetText = MOCK_RAG_ANSWERS.cheapest;
            }

            // If profile is not complete, we generate interview responses
            // Let's check history length in store to determine interview progress
            // (We will simulate interview progression in UI layer, let's stream general text here)
            const isInterview = !body.is_rag_mode;
            if (isInterview) {
              const qIndex = body.questionIndex ?? 0;
              const { MOCK_INTERVIEW_QUESTIONS } = await import("@/lib/mockData");
              const nextQuestion = MOCK_INTERVIEW_QUESTIONS[qIndex % MOCK_INTERVIEW_QUESTIONS.length];
              
              for await (const chunk of streamMockResponse(nextQuestion)) {
                if (abortCtrl.signal.aborted) break;
                onToken?.(chunk);
              }
              onDone?.({
                is_rag_mode: qIndex >= 3,
                is_profile_complete: qIndex >= 3,
                retrieved_products: qIndex >= 3 ? MOCK_PRODUCTS : [],
              });
            } else {
              // RAG mode search simulation
              onStatus?.("🔎 Searching product vault...");
              await new Promise((r) => setTimeout(r, 800));

              for await (const chunk of streamMockResponse(targetText)) {
                if (abortCtrl.signal.aborted) break;
                onToken?.(chunk);
              }
              onDone?.({ is_rag_mode: true });
            }
          }
        } catch (e: any) {
          if (e.name !== "AbortError") {
            onError?.(e.message || "An error occurred during mock streaming.");
          }
        } finally {
          setIsStreaming(false);
          setController(null);
        }
        return;
      }

      // Real API connection
      try {
        const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const fullUrl = url.startsWith("http") ? url : `${apiBase}${url}`;
        const response = await fetch(fullUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: abortCtrl.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("Response body is not readable.");
        }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Split by double newlines which is the SSE frame boundary
          const frames = buffer.split("\n\n");
          // Keep the last potentially incomplete frame in the buffer
          buffer = frames.pop() || "";

          for (const frame of frames) {
            const lines = frame.split("\n");
            let eventType = "message";
            let dataStr = "";

            for (const line of lines) {
              if (line.startsWith("event:")) {
                eventType = line.slice(6).trim();
              } else if (line.startsWith("data:")) {
                dataStr = line.slice(5).trim();
              }
            }

            if (dataStr) {
              try {
                const parsed = JSON.parse(dataStr);
                
                if (eventType === "status") {
                  onStatus?.(parsed.message || "");
                } else if (eventType === "progress") {
                  onProgress?.(parsed.message || "");
                } else if (eventType === "error") {
                  onError?.(parsed.message || "Unknown stream error");
                } else {
                  // Message event
                  if (parsed.type === "token") {
                    onToken?.(parsed.content || "");
                  } else if (parsed.type === "done") {
                    onDone?.(parsed);
                  } else if (parsed.type === "progress") {
                    onProgress?.(parsed.message || "");
                  } else if (parsed.type === "status") {
                    onStatus?.(parsed.message || "");
                  } else if (parsed.type === "error") {
                    onError?.(parsed.message || "Unknown stream error");
                  }
                }
              } catch (e) {
                console.error("Failed to parse SSE JSON data:", e);
              }
            }
          }
        }
      } catch (e: any) {
        if (e.name !== "AbortError") {
          onError?.(e.message || "Connection lost or server error occurred.");
        }
      } finally {
        setIsStreaming(false);
        setController(null);
      }
    },
    [controller, stopStreaming]
  );

  return {
    isStreaming,
    startStreaming,
    stopStreaming,
  };
}
export type UseSSEReturn = ReturnType<typeof useSSE>;
