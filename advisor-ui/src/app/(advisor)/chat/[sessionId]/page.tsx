"use client";

import React, { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { motion } from "framer-motion";

import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import SaveSessionDialog from "@/components/layout/SaveSessionDialog";
import SelectionChips from "@/components/intake/SelectionChips";
import ChatWindow from "@/components/chat/ChatWindow";
import ProductGrid from "@/components/vault/ProductGrid";

import { useAdvisorStore } from "@/store/advisorStore";
import { useSSE } from "@/hooks/useSSE";
import { SelectionChip, Message, Product } from "@/types";
import { MOCK_PRODUCTS } from "@/lib/mockData";

// Dynamically load the particle field and vault loader animation
const ParticleField = dynamic(() => import("@/components/three/ParticleField"), { ssr: false });
const VaultBuildingAnimation = dynamic(() => import("@/components/search/VaultBuildingAnimation"), { ssr: false });
import type { VaultStep } from "@/components/search/VaultBuildingAnimation";

// Question index chips for the interview loop
const INTERVIEW_CHIPS: SelectionChip[][] = [
  [
    { label: "Coding / Dev 💻", value: "coding", icon: "💻", category: "primary_use_case" },
    { label: "Gaming 🎮", value: "gaming", icon: "🎮", category: "primary_use_case" },
    { label: "Video Editing 🎥", value: "video editing", icon: "🎥", category: "primary_use_case" },
    { label: "Daily Use ✉️", value: "general daily use", icon: "✉️", category: "primary_use_case" },
  ],
  [
    { label: "Under ₹60,000 💵", value: "under 60000 rupees", icon: "💵", category: "budget_max" },
    { label: "₹60,000 - ₹1,20,000 💸", value: "between 60000 and 120000 rupees", icon: "💸", category: "budget_max" },
    { label: "Above ₹1,20,000 🏦", value: "above 120000 rupees", icon: "🏦", category: "budget_max" },
  ],
  [
    { label: "14-inch portable ✈️", value: "14-inch lightweight portable screen", icon: "✈️", category: "form_factor" },
    { label: "16-inch workspace 🖥️", value: "16-inch large screen", icon: "🖥️", category: "form_factor" },
    { label: "No preference 🤷", value: "no display size preference", icon: "🤷", category: "form_factor" },
  ],
  [
    { label: "macOS (Apple) 🍎", value: "macOS Apple ecosystem", icon: "🍎", category: "operating_system" },
    { label: "Windows 🪟", value: "Windows OS", icon: "🪟", category: "operating_system" },
    { label: "Open to both 🌐", value: "open to either macOS or Windows", icon: "🌐", category: "operating_system" },
  ],
];

const mapBackendProducts = (rawProducts: any[]): Product[] => {
  if (!rawProducts) return [];
  return rawProducts.map((p, idx) => {
    const name = p.name || `Product ${idx + 1}`;
    const id = p.id || name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || `prod-${idx}`;
    const brand = p.brand || name.split(" ")[0] || "Brand";
    // Use real price from backend; null if not found — NEVER fabricate a number
    const price: number | null = typeof p.price === "number" ? p.price : null;
    
    return {
      id,
      name,
      brand,
      price,
      currency: price !== null ? (p.currency || "INR") : null,
      imageUrl: p.imageUrl || "",
      category: p.category || "Smartphone",
      confidenceScore: typeof p.confidenceScore === "number" ? p.confidenceScore : 0,
      specs: p.specs || {},
      prosHighlights: p.prosHighlights || ["High Performance", "Modern Design"],
      consHighlights: p.consHighlights || ["Average Battery Life"],
      dataSource: p.dataSource || "live_scrape",
      reviewCount: typeof p.reviewCount === "number" ? p.reviewCount : 0,
      rating: typeof p.rating === "number" ? p.rating : 0,
      affiliateUrl: p.affiliateUrl || "#",
    };
  });
};

export default function SessionPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params?.sessionId as string;

  const { theme, setTheme } = useTheme();
  const { isStreaming: sseStreaming, startStreaming, stopStreaming } = useSSE();

  // Zustand Store
  const {
    sessionId: storeSessionId,
    setSessionId,
    phase,
    setPhase,
    chatHistory,
    appendMessage,
    setChatHistory,
    updateLastMessage,
    products,
    setProducts,
    activeProductId,
    setActiveProduct,
    isDevilMode,
    setDevilMode,
    preferences,
    setPreferences,
    searchQuotaRemaining,
    setSearchQuotaRemaining,
  } = useAdvisorStore();

  // Local State
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [interviewStep, setInterviewStep] = useState(0);
  const [preDevilTheme, setPreDevilTheme] = useState("dark");
  const [isRestoring, setIsRestoring] = useState(true);
  const [isSearching, setIsSearching] = useState(false); // True while backend is vaulting products
  const [searchSteps, setSearchSteps] = useState<VaultStep[]>([]);  // Live steps from backend
  const [vaultDone, setVaultDone] = useState(false);                 // Backend finished search
  const [vaultReadyData, setVaultReadyData] = useState<{ count: number } | null>(null);
  const isSearchingRef = useRef(false);

  const setIsSearchingBoth = (val: boolean) => {
    isSearchingRef.current = val;
    setIsSearching(val);
    if (val) {
      // Reset steps on new search
      setSearchSteps([]);
      setVaultDone(false);
    }
  };

  // Sync route Session ID with store
  useEffect(() => {
    if (sessionId && sessionId !== storeSessionId) {
      setSessionId(sessionId);
    }
  }, [sessionId, storeSessionId, setSessionId]);

  // Load session from backend if it exists on mount / refresh
  useEffect(() => {
    if (!sessionId) {
      setIsRestoring(false);
      return;
    }
    
    const loadSession = async () => {
      try {
        const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const res = await fetch(`${apiBase}/api/v1/session/${sessionId}`);
        if (res.ok) {
          const data = await res.json();
          // Restore all Zustand store states
          setPhase(data.is_rag_mode ? "chatting" : "intake");
          setProducts(mapBackendProducts(data.retrieved_products));
          setDevilMode(data.is_advocate_mode);
          setPreferences(data.constraints);
          
          // Count non-empty values in constraints to set interviewStep
          const filledCount = Object.values(data.constraints || {}).filter(
            v => v !== null && v !== "" && v !== undefined
          ).length;
          setInterviewStep(filledCount);
          
          if (data.chat_history && data.chat_history.length > 0) {
            const mappedHistory = data.chat_history.map((m: any) => ({
              id: m.id || `msg-${Date.now()}-${Math.random()}`,
              role: m.role,
              content: m.content,
              timestamp: new Date(),
            }));
            setChatHistory(mappedHistory);
          }
        }
      } catch (err) {
        console.error("Failed to restore session from backend:", err);
      } finally {
        setIsRestoring(false);
      }
    };
    
    loadSession();
  }, [sessionId]);

  // Greeting if session is empty (e.g. on manual reload)
  useEffect(() => {
    if (!isRestoring && chatHistory.length === 0 && phase === "intake") {
      appendMessage({
        id: "welcome-" + Date.now(),
        role: "assistant",
        content: "Hello! I'm your AI Product Concierge. 👋 What kind of product are you looking for today?",
        timestamp: new Date(),
      });
    }
  }, [isRestoring, chatHistory, phase]);

  // Reactive effect to keep interviewStep in sync with filled/missing constraints
  useEffect(() => {
    if (!preferences.primary_use_case) {
      setInterviewStep(0);
    } else if (!preferences.budget_max) {
      setInterviewStep(1);
    } else if (!preferences.form_factor) {
      setInterviewStep(2);
    } else if (!preferences.operating_system) {
      setInterviewStep(3);
    } else {
      setInterviewStep(4);
    }
  }, [preferences]);

  // Initial trigger: If session is newly created, start interview flow
  useEffect(() => {
    if (!isRestoring && chatHistory.length === 1 && chatHistory[0].role === "user" && !sseStreaming && phase === "intake") {
      const initialUserQuery = chatHistory[0].content;
      triggerInterviewStream(initialUserQuery);
    }
  }, [isRestoring]);

  // Primary SSE Chat sender
  const triggerInterviewStream = async (message: string) => {
    // Append user input safely (guards against empty history during page reload)
    const hasHistory = chatHistory.length > 0;
    if (chatHistory.length > 1 || !hasHistory || chatHistory[0].content !== message) {
      appendMessage({
        id: "user-" + Date.now(),
        role: "user",
        content: message,
        timestamp: new Date(),
      });
    }

    // Prepare assistant streaming placeholder
    const assistantMsgId = "assistant-" + Date.now();
    appendMessage({
      id: assistantMsgId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      isStreaming: true,
    });

    const isRAG = phase === "vault" || phase === "chatting";

    const bodyPayload = {
      session_id: sessionId,
      message: message,
    };

    const apiUrl = "/api/v1/chat";

    let fullText = "";

    await startStreaming(apiUrl, bodyPayload, {
      onToken: (token) => {
        fullText += token;
        updateLastMessage(fullText);
      },
      onStatus: (statusMessage) => {
        // If backend signals it's now in search/vault mode, show the animation overlay (only if not already in RAG phase)
        const msgLower = statusMessage.toLowerCase();
        if (
          !isRAG &&
          (msgLower.includes("search") ||
           msgLower.includes("vault") ||
           msgLower.includes("product") ||
           msgLower.includes("discover"))
        ) {
          setIsSearchingBoth(true);
        }
        toast.loading(statusMessage, { id: "sse-status", duration: 2000 });
      },
      onProgress: (step) => {
        // Mark previous step as done and add new active step
        setSearchSteps(prev => {
          const updated = prev.map((s, i) =>
            i === prev.length - 1 ? { ...s, isDone: true } : s
          );
          return [...updated, { text: step, isDone: false }];
        });
      },
      onVaultReady: (metadata) => {
        setVaultReadyData({ count: metadata.count || 0 });
        if (metadata.products && metadata.products.length > 0) {
          setProducts(mapBackendProducts(metadata.products));
        }
      },
      onDone: (metadata) => {
        toast.dismiss("sse-status");
        
        // Remove streaming cursor check
        updateLastMessage(fullText);

        if (metadata.constraints) {
          setPreferences(metadata.constraints);
        }

        if (!isRAG) {
          // If we transitioned to RAG mode in this response
          if (metadata.is_rag_mode) {
            setSearchQuotaRemaining(searchQuotaRemaining - 1);
            if (metadata.retrieved_products?.length > 0) {
              setProducts(mapBackendProducts(metadata.retrieved_products));
            } else {
              setProducts(MOCK_PRODUCTS); // Fallback mock products
            }
            // Mark all steps as done and signal vault completion
            setSearchSteps(prev => prev.map(s => ({ ...s, isDone: true })));
            setVaultDone(true);
            // If animation is showing, let onComplete transition naturally
            // Otherwise go straight to chatting
            if (!isSearchingRef.current) {
              setPhase("chatting");
            }
          }
        }
      },
      onError: (err) => {
        toast.dismiss("sse-status");
        toast.error("Stream Error: " + err);
        setIsSearchingBoth(false);
        // Remove typing message on failure
        updateLastMessage("⚠️ I encountered a communication error with my backend: " + err);
      },
    });
  };

  const handleSendMessage = (text: string) => {
    triggerInterviewStream(text);
  };

  const handleChipSelect = (value: string) => {
    // Save selected constraint value to preference map
    const currentCategory = INTERVIEW_CHIPS[interviewStep]?.[0]?.category || "general";
    setPreferences({ [currentCategory]: value });

    // Submit selection to streaming chain
    triggerInterviewStream(value);
  };

  // Triggers Common Devil's Advocate Mode across all products
  const handleCritiqueAll = async () => {
    setPreDevilTheme(theme || "dark");
    setDevilMode(true);
    setTheme("devil-mode");

    const assistantMsgId = "devil-advocate-" + Date.now();
    appendMessage({
      id: assistantMsgId,
      role: "assistant",
      content: `👹 **Devil's Advocate mode active for all products in your vault...**\n\n`,
      timestamp: new Date(),
      isStreaming: true,
    });

    let fullText = "";

    await startStreaming("/api/v1/advocate", {
      session_id: sessionId,
      product_name: "all",
    }, {
      onToken: (token) => {
        fullText += token;
        updateLastMessage(fullText);
      },
      onStatus: (statusMessage) => {
        toast.loading(statusMessage, { id: "advocate-status", duration: 2000 });
      },
      onDone: (metadata) => {
        toast.dismiss("advocate-status");
        updateLastMessage(fullText);
      },
      onError: (err) => {
        toast.dismiss("advocate-status");
        toast.error("Critique Error: " + err);
        updateLastMessage("👹 **Devil's Advocate:** Failed to harvest live forum critiques. Please try again in a moment.");
      }
    });
  };

  // Returns current interview chip set only if it matches the context of the AI's question
  const lastAssistantMessage = [...chatHistory].reverse().find(m => m.role === "assistant")?.content || "";
  const lastMsgLower = lastAssistantMessage.toLowerCase();
  
  const showChips = (() => {
    if (interviewStep === 0) {
      // Usecase
      return lastMsgLower.includes("use") || lastMsgLower.includes("play") || lastMsgLower.includes("purpose") || lastMsgLower.includes("work") || lastMsgLower.includes("looking for") || lastMsgLower.includes("what kind") || lastMsgLower.includes("welcome");
    }
    if (interviewStep === 1) {
      // Budget
      return lastMsgLower.includes("budget") || lastMsgLower.includes("price") || lastMsgLower.includes("cost") || lastMsgLower.includes("rupees") || lastMsgLower.includes("spend") || lastMsgLower.includes("₹") || lastMsgLower.includes("limit") || lastMsgLower.includes("range");
    }
    if (interviewStep === 2) {
      // Size
      return lastMsgLower.includes("size") || lastMsgLower.includes("screen") || lastMsgLower.includes("display") || lastMsgLower.includes("inch") || lastMsgLower.includes("portable") || lastMsgLower.includes("weight") || lastMsgLower.includes("carry");
    }
    if (interviewStep === 3) {
      // OS
      return lastMsgLower.includes("operating") || lastMsgLower.includes("os") || lastMsgLower.includes("windows") || lastMsgLower.includes("mac") || lastMsgLower.includes("linux") || lastMsgLower.includes("system");
    }
    return false;
  })();

  const currentChips = showChips ? (INTERVIEW_CHIPS[interviewStep] || []) : [];

  return (
    <div className="h-screen w-full flex overflow-hidden bg-bg-base relative">
      {/* 3D background behind everything */}
      <ParticleField isDevilMode={isDevilMode} />

      {/* Main Layout Collapsible Sidebar */}
      <div className="hidden md:flex shrink-0">
        <Sidebar onSaveClick={() => setSaveDialogOpen(true)} />
      </div>

      {/* Concierge Dashboard Core */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative z-10">
        <TopBar onSaveClick={() => setSaveDialogOpen(true)} />

        {/* Dynamic Workspace Container */}
        <div className="flex-1 flex overflow-hidden min-h-0 relative">
          
          {/* Phase 1: Intake / Interview UI */}
          {phase === "intake" && (
            <div className="flex-1 flex flex-col max-w-[780px] mx-auto w-full relative overflow-hidden h-full">
              <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
                <ChatWindow
                  messages={chatHistory}
                  isStreaming={sseStreaming}
                  onSendMessage={handleSendMessage}
                  chips={currentChips}
                  onChipSelect={handleChipSelect}
                  vaultReadyData={vaultReadyData}
                  onDismissVaultBanner={() => setVaultReadyData(null)}
                />
              </div>
            </div>
          )}

          {/* Phase 2: Live Search / Vault Building Animation — shown as overlay while backend is scraping */}
          {isSearching && (
            <motion.div
              key="vault-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-50 bg-bg-base/90 backdrop-blur-sm flex items-center justify-center"
            >
              <VaultBuildingAnimation
                steps={searchSteps}
                isDone={vaultDone}
                onComplete={() => {
                  setIsSearchingBoth(false);
                  setPhase("chatting");
                }}
                isDevilMode={isDevilMode}
              />
            </motion.div>
          )}

          {/* Phase 3: Split Vault & Chat layout */}
          {(phase === "vault" || phase === "chatting") && (
            <div className="flex-1 flex flex-col lg:flex-row min-h-0 divide-y lg:divide-y-0 lg:divide-x divide-border-default overflow-hidden">
              
              {/* Left Column: Discovered Products Panel (40% width) */}
              <div className="lg:flex-[0.4] flex flex-col p-5 overflow-hidden h-auto lg:h-full shrink-0">
                <ProductGrid
                  products={products}
                  activeProductId={activeProductId}
                  onSelectProduct={(id) => setActiveProduct(id)}
                  onCritiqueAll={handleCritiqueAll}
                />
              </div>

              {/* Right Column: Grounded RAG Chat (60% width) */}
              <div className="flex-1 lg:flex-[0.6] flex flex-col overflow-hidden min-h-0">
                <div className="px-6 py-3.5 border-b border-border-default/20 bg-bg-surface/20 shrink-0">
                  <h3 className="font-display font-semibold text-sm text-text-primary">
                    Ask Anything
                  </h3>
                  <span className="text-[11px] text-text-secondary">
                    Answers grounded in your Product Intelligence Vault — zero hallucinations.
                  </span>
                </div>
                <div className="flex-1 overflow-hidden min-h-0">
                  <ChatWindow
                    messages={chatHistory}
                    isStreaming={sseStreaming}
                    onSendMessage={handleSendMessage}
                    showQuickChips={true}
                    vaultReadyData={vaultReadyData}
                    onDismissVaultBanner={() => setVaultReadyData(null)}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dialog overlay for saving sessions */}
      <SaveSessionDialog
        isOpen={saveDialogOpen}
        onClose={() => setSaveDialogOpen(false)}
        sessionId={sessionId}
      />
    </div>
  );
}
