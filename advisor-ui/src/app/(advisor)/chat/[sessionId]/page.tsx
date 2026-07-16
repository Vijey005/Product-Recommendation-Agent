"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { toast } from "sonner";

import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import SaveSessionDialog from "@/components/layout/SaveSessionDialog";
import SelectionChips from "@/components/intake/SelectionChips";
import ChatWindow from "@/components/chat/ChatWindow";
import ProductGrid from "@/components/vault/ProductGrid";
import CritiqueReport from "@/components/devil/CritiqueReport";

import { useAdvisorStore } from "@/store/advisorStore";
import { useSSE } from "@/hooks/useSSE";
import { SelectionChip, Message, Product, CritiqueReport as ICritiqueReport } from "@/types";
import { MOCK_CRITIQUES, MOCK_PRODUCTS } from "@/lib/mockData";

// Dynamically load the particle field and vault loader animation
const ParticleField = dynamic(() => import("@/components/three/ParticleField"), { ssr: false });
const VaultBuildingAnimation = dynamic(() => import("@/components/search/VaultBuildingAnimation"), { ssr: false });

// Question index chips for the interview loop
const INTERVIEW_CHIPS: SelectionChip[][] = [
  [
    { label: "Coding / Dev 💻", value: "coding", icon: "💻", category: "usecase" },
    { label: "Gaming 🎮", value: "gaming", icon: "🎮", category: "usecase" },
    { label: "Video Editing 🎥", value: "video editing", icon: "🎥", category: "usecase" },
    { label: "Daily Use ✉️", value: "general daily use", icon: "✉️", category: "usecase" },
  ],
  [
    { label: "Under $1000", value: "under $1000", icon: "💵", category: "budget" },
    { label: "$1000 - $1500", value: "$1000 to $1500", icon: "💸", category: "budget" },
    { label: "Above $1500", value: "above $1500", icon: "🏦", category: "budget" },
  ],
  [
    { label: "14-inch portable ✈️", value: "14-inch lightweight portable screen", icon: "✈️", category: "size" },
    { label: "16-inch workspace 🖥️", value: "16-inch large screen", icon: "🖥️", category: "size" },
    { label: "No preference 🤷", value: "no display size preference", icon: "🤷", category: "size" },
  ],
  [
    { label: "macOS (Apple) 🍎", value: "macOS Apple ecosystem", icon: "🍎", category: "os" },
    { label: "Windows 🪟", value: "Windows OS", icon: "🪟", category: "os" },
    { label: "Open to both 🌐", value: "open to either macOS or Windows", icon: "🌐", category: "os" },
  ],
];

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
  const [critiqueOpen, setCritiqueOpen] = useState(false);
  const [selectedCritique, setSelectedCritique] = useState<ICritiqueReport | null>(null);
  const [critiquedProduct, setCritiquedProduct] = useState<Product | null>(null);
  const [interviewStep, setInterviewStep] = useState(0);
  const [preDevilTheme, setPreDevilTheme] = useState("dark");

  // Sync route Session ID with store
  useEffect(() => {
    if (sessionId && sessionId !== storeSessionId) {
      setSessionId(sessionId);
    }
  }, [sessionId, storeSessionId, setSessionId]);

  // Greeting if session is empty (e.g. on manual reload)
  useEffect(() => {
    if (chatHistory.length === 0 && phase === "intake") {
      appendMessage({
        id: "welcome-" + Date.now(),
        role: "assistant",
        content: "Hi! I am your AI Product Advisor. Let's find the perfect product recommendations for you. What is your primary use case (e.g. coding, gaming, daily use)?",
        timestamp: new Date(),
      });
    }
  }, [chatHistory, phase]);

  // Initial trigger: If session is newly created, start interview flow
  useEffect(() => {
    if (chatHistory.length === 1 && chatHistory[0].role === "user" && !sseStreaming && phase === "intake") {
      const initialUserQuery = chatHistory[0].content;
      triggerInterviewStream(initialUserQuery, 0);
    }
  }, []);

  // Primary SSE Chat sender
  const triggerInterviewStream = async (message: string, stepOverride?: number) => {
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
    const currentStep = stepOverride !== undefined ? stepOverride : interviewStep;

    const bodyPayload = {
      session_id: sessionId,
      message: message,
      is_rag_mode: isRAG,
      questionIndex: currentStep,
    };

    const apiUrl = isRAG
      ? "/api/v1/chat"
      : "/api/v1/chat"; // Pointing to our custom POST streamer

    let fullText = "";

    await startStreaming(apiUrl, bodyPayload, {
      onToken: (token) => {
        fullText += token;
        updateLastMessage(fullText);
      },
      onStatus: (statusMessage) => {
        toast.loading(statusMessage, { id: "sse-status", duration: 1500 });
      },
      onDone: (metadata) => {
        toast.dismiss("sse-status");
        
        // Remove streaming cursor check
        updateLastMessage(fullText);

        if (!isRAG) {
          // If we transitioned to RAG mode in this response
          if (metadata.is_rag_mode) {
            setSearchQuotaRemaining(searchQuotaRemaining - 1);
            setPhase("searching");
            if (metadata.retrieved_products?.length > 0) {
              setProducts(metadata.retrieved_products);
            } else {
              setProducts(MOCK_PRODUCTS); // Fallback mock products
            }
          }
        }
      },
      onError: (err) => {
        toast.dismiss("sse-status");
        toast.error("Stream Error: " + err);
        // Remove typing message on failure
        updateLastMessage("⚠️ I encountered a communication error with my backend: " + err);
      },
    });
  };

  const handleSendMessage = (text: string) => {
    const isRAG = phase === "vault" || phase === "chatting";
    if (!isRAG) {
      setInterviewStep((prev) => prev + 1);
      triggerInterviewStream(text, interviewStep + 1);
    } else {
      triggerInterviewStream(text);
    }
  };

  const handleChipSelect = (value: string) => {
    // Save selected constraint value to preference map
    const currentCategory = INTERVIEW_CHIPS[interviewStep]?.[0]?.category || "general";
    setPreferences({ [currentCategory]: value });

    // Submit selection to streaming chain
    setInterviewStep((prev) => prev + 1);
    triggerInterviewStream(value, interviewStep + 1);
  };

  // Triggers Devil's Advocate Mode
  const handleCritiqueProduct = async (productName: string) => {
    // 1. Find product object
    const prod = products.find((p) => p.name === productName) || products[0];
    setCritiquedProduct(prod);

    // 2. Set theme red and set store states
    setPreDevilTheme(theme || "dark");
    setDevilMode(true);
    setTheme("devil-mode");

    // 3. Prepare mock report or query backend /api/v1/advocate
    // Find matching mock critique
    const matchedCritique = Object.values(MOCK_CRITIQUES).find(
      (c) => c.productId === prod.id || productName.toLowerCase().includes(c.productId)
    ) || MOCK_CRITIQUES["prod-2"];

    setSelectedCritique(matchedCritique);
    setCritiqueOpen(true);

    // Trigger SSE warning critique narration in chat window as well
    const assistantMsgId = "devil-advocate-" + Date.now();
    appendMessage({
      id: assistantMsgId,
      role: "assistant",
      content: `👹 **Devil's Advocate active for ${productName}...**\n\n`,
      timestamp: new Date(),
      isStreaming: true,
    });

    let fullText = "";

    await startStreaming("/api/v1/advocate", {
      session_id: sessionId,
      product_name: productName,
    }, {
      onToken: (token) => {
        fullText += token;
        updateLastMessage(fullText);
      },
      onStatus: (statusMessage) => {
        toast.loading(statusMessage, { id: "advocate-status", duration: 1500 });
      },
      onDone: (metadata) => {
        toast.dismiss("advocate-status");
        updateLastMessage(fullText);
      },
      onError: (err) => {
        toast.dismiss("advocate-status");
        toast.error("Critique Error: " + err);
        updateLastMessage("👹 **Devil's Advocate:** Failed to harvest live forum critiques. Cached values are visible in the side panel.");
      }
    });
  };

  const handleBuyAnyway = () => {
    toast.success(`Purchase confirmed! Directing you to ${critiquedProduct?.brand} affiliate link...`);
    window.open(critiquedProduct?.affiliateUrl, "_blank");
    setCritiqueOpen(false);
    setDevilMode(false);
    setTheme(preDevilTheme);
  };

  const handleSeeAlternatives = () => {
    setCritiqueOpen(false);
    setDevilMode(false);
    setTheme(preDevilTheme);
    triggerInterviewStream(`Compare alternatives to the ${critiquedProduct?.name}`);
  };

  // Returns current interview chip set
  const currentChips = INTERVIEW_CHIPS[interviewStep] || [];

  return (
    <div className="h-screen w-full flex overflow-hidden bg-bg-base relative select-none">
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
                />
              </div>
            </div>
          )}

          {/* Phase 2: Live Search / Vault Building Animation */}
          {phase === "searching" && (
            <VaultBuildingAnimation
              onComplete={() => setPhase("chatting")}
              isDevilMode={isDevilMode}
            />
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
                  onCritiqueProduct={handleCritiqueProduct}
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

      {/* Side Sheet overlay for Devil's Advocate critiques */}
      <CritiqueReport
        isOpen={critiqueOpen}
        onClose={() => {
          setCritiqueOpen(false);
          setDevilMode(false);
          setTheme(preDevilTheme);
        }}
        report={selectedCritique}
        product={critiquedProduct}
        onSeeAlternatives={handleSeeAlternatives}
        onBuyAnyway={handleBuyAnyway}
      />
    </div>
  );
}
