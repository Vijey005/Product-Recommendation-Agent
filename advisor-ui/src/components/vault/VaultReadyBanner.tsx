import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, X } from "lucide-react";

interface VaultReadyBannerProps {
  count: number;
  onDismiss: () => void;
  onActionClick?: (action: string) => void;
}

export default function VaultReadyBanner({ count, onDismiss, onActionClick }: VaultReadyBannerProps) {
  const [isVisible, setIsVisible] = useState(true);

  const handleDismiss = () => {
    setIsVisible(false);
    setTimeout(onDismiss, 300); // Give time for exit animation
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="mb-4 mx-4 p-4 rounded-xl border border-success/30 bg-success/10 backdrop-blur-md shadow-[0_0_15px_rgba(34,197,94,0.15)] flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="bg-success/20 p-2 rounded-full">
              <CheckCircle2 className="h-5 w-5 text-success" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-text-primary">Vault Ready</h4>
              <p className="text-xs text-text-secondary mt-0.5">
                Successfully indexed {count} products. You can now ask questions about them.
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 self-end sm:self-auto w-full sm:w-auto mt-2 sm:mt-0">
            {onActionClick && (
              <>
                <button
                  onClick={() => {
                    onActionClick("Compare all products in my vault");
                    handleDismiss();
                  }}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg bg-bg-surface border border-border-default hover:bg-bg-surface-hover hover:border-accent-secondary transition-colors text-text-primary whitespace-nowrap flex-1 sm:flex-none"
                >
                  Compare All
                </button>
                <button
                  onClick={() => {
                    onActionClick("what are the prices for all products");
                    handleDismiss();
                  }}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg bg-bg-surface border border-border-default hover:bg-bg-surface-hover hover:border-accent-secondary transition-colors text-text-primary whitespace-nowrap flex-1 sm:flex-none"
                >
                  Check Prices
                </button>
              </>
            )}
            <button 
              onClick={handleDismiss}
              className="p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-surface rounded-lg transition-colors ml-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
