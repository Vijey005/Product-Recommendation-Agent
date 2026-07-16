"use client";

import React, { useState, useRef, useEffect } from "react";
import { AtSign, Send } from "lucide-react";
import { useAdvisorStore } from "@/store/advisorStore";
import { Button } from "@/components/ui/button";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export default function ChatInput({ onSend, disabled = false }: ChatInputProps) {
  const [value, setValue] = useState("");
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  const { products } = useAdvisorStore();

  // Handle auto-expansion of textarea height
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset height to compute scrollHeight accurately
    textarea.style.height = "auto";
    const nextHeight = Math.min(textarea.scrollHeight, 200);
    textarea.style.height = `${nextHeight}px`;
  }, [value]);

  // Close mention picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowMentionPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Ctrl+Enter
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    if (!value.trim() || disabled) return;
    onSend(value);
    setValue("");
    // Focus back on input
    textareaRef.current?.focus();
  };

  const handleSelectMention = (productName: string) => {
    // Append the name at the cursor position
    const textarea = textareaRef.current;
    if (!textarea) return;

    const startPos = textarea.selectionStart;
    const endPos = textarea.selectionEnd;
    const currentText = textarea.value;

    const before = currentText.substring(0, startPos);
    const after = currentText.substring(endPos);

    // If typing was @, replace it, otherwise append
    const lastChar = before.slice(-1);
    let newText = "";
    if (lastChar === "@") {
      newText = before.slice(0, -1) + `"${productName}" `;
    } else {
      newText = before + `"${productName}" `;
    }

    setValue(newText + after);
    setShowMentionPicker(false);

    // Refocus and place cursor after the inserted name
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = newText.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 50);
  };

  return (
    <div className="w-full flex flex-col gap-1.5 relative select-none">
      {/* Mention Picker Popup */}
      {showMentionPicker && products.length > 0 && (
        <div
          ref={pickerRef}
          className="absolute bottom-full left-0 mb-2 w-72 bg-bg-surface border border-border-bright rounded-xl shadow-2xl p-2 z-50 flex flex-col max-h-48 overflow-y-auto"
        >
          <span className="text-[10px] font-bold tracking-wider text-text-muted px-2 py-1 uppercase border-b border-border-default/40 mb-1">
            Mention Product from Vault
          </span>
          {products.map((p) => (
            <button
              key={p.id}
              onClick={() => handleSelectMention(p.name)}
              className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-bg-subtle text-xs sm:text-sm text-text-primary font-medium flex items-center justify-between transition-colors border-none cursor-pointer"
            >
              <span>{p.name}</span>
              <span className="text-[10px] text-accent-secondary bg-accent-surface/50 border border-accent-primary/10 px-1.5 py-0.5 rounded-full font-mono">
                {p.brand}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Input Outer Area */}
      <div className="w-full bg-bg-elevated border border-border-default hover:border-border-bright focus-within:border-accent-primary focus-within:hover:border-accent-primary rounded-2xl flex flex-col p-2.5 transition-all duration-300 shadow-md focus-within:shadow-[0_0_24px_rgba(91,107,248,0.15)]">
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            // Trigger mention picker if user types @
            if (e.target.value.endsWith("@")) {
              setShowMentionPicker(true);
            } else if (showMentionPicker && !e.target.value.includes("@")) {
              setShowMentionPicker(false);
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question or compare specs..."
          disabled={disabled}
          rows={1}
          className="w-full bg-transparent text-text-primary placeholder-text-muted text-sm sm:text-base border-none outline-none font-body resize-none p-1.5 max-h-[200px]"
        />

        {/* Buttons Row */}
        <div className="flex items-center justify-between border-t border-border-default/30 pt-2 px-1">
          {/* Mention Button */}
          <Button
            size="icon"
            variant="ghost"
            type="button"
            onClick={() => setShowMentionPicker(!showMentionPicker)}
            className="h-8 w-8 text-text-secondary hover:text-accent-secondary hover:bg-bg-subtle rounded-lg"
            title="Mention Product"
          >
            <AtSign className="h-4.5 w-4.5" />
          </Button>

          {/* Send Button */}
          <Button
            size="icon"
            type="button"
            disabled={!value.trim() || disabled}
            onClick={handleSubmit}
            className="h-8 w-8 rounded-full bg-accent-primary hover:bg-accent-secondary disabled:bg-bg-subtle disabled:text-text-muted text-white shadow-md shadow-accent-primary/10 flex items-center justify-center cursor-pointer transition-all hover:scale-105 active:scale-95"
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Subtext info */}
      <div className="flex justify-between items-center px-2 text-[10px] text-text-muted select-none font-medium">
        <span>Ctrl+Enter to send</span>
        <span>Grounded in your private vault</span>
      </div>
    </div>
  );
}
