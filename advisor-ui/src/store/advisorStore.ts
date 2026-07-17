import { create } from "zustand";
import { Product, Message, Phase } from "@/types";

interface AdvisorState {
  sessionId: string | null;
  phase: Phase;
  preferences: Record<string, string>;
  products: Product[];
  chatHistory: Message[];
  isDevilMode: boolean;
  activeProductId: string | null;
  searchQuotaRemaining: number;
  isStreaming: boolean;

  // Actions
  setSessionId: (id: string | null) => void;
  setPhase: (phase: Phase) => void;
  toggleDevilMode: () => void;
  setDevilMode: (active: boolean) => void;
  appendMessage: (msg: Message) => void;
  setChatHistory: (history: Message[]) => void;
  updateLastMessage: (content: string) => void;
  setProducts: (products: Product[]) => void;
  setActiveProduct: (id: string | null) => void;
  setSearchQuotaRemaining: (quota: number) => void;
  setStreaming: (streaming: boolean) => void;
  setPreferences: (prefs: Record<string, string>) => void;
  resetSession: () => void;
}

export const useAdvisorStore = create<AdvisorState>((set) => ({
  sessionId: null,
  phase: "intake",
  preferences: {},
  products: [],
  chatHistory: [],
  isDevilMode: false,
  activeProductId: null,
  searchQuotaRemaining: 5,
  isStreaming: false,

  setSessionId: (id) => set({ sessionId: id }),
  setPhase: (phase) => set({ phase }),
  toggleDevilMode: () => set((state) => ({ isDevilMode: !state.isDevilMode })),
  setDevilMode: (active) => set({ isDevilMode: active }),
  appendMessage: (msg) =>
    set((state) => ({ chatHistory: [...state.chatHistory, msg] })),
  setChatHistory: (history) => set({ chatHistory: history }),
  updateLastMessage: (content) =>
    set((state) => {
      const history = [...state.chatHistory];
      if (history.length > 0) {
        const lastMsg = history[history.length - 1];
        history[history.length - 1] = {
          ...lastMsg,
          content,
        };
      }
      return { chatHistory: history };
    }),
  setProducts: (products) => set({ products }),
  setActiveProduct: (id) => set({ activeProductId: id }),
  setSearchQuotaRemaining: (quota) => set({ searchQuotaRemaining: quota }),
  setStreaming: (streaming) => set({ isStreaming: streaming }),
  setPreferences: (prefs) =>
    set((state) => ({ preferences: { ...state.preferences, ...prefs } })),
  resetSession: () =>
    set({
      sessionId: null,
      phase: "intake",
      preferences: {},
      products: [],
      chatHistory: [],
      isDevilMode: false,
      activeProductId: null,
      searchQuotaRemaining: 5,
      isStreaming: false,
    }),
}));
