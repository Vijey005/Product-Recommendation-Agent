"use client";

import React from "react";
import { motion } from "framer-motion";
import { Product } from "@/types";
import ProductCard from "./ProductCard";
import { Button } from "@/components/ui/button";

interface ProductGridProps {
  products: Product[];
  activeProductId: string | null;
  onSelectProduct: (productId: string) => void;
  onCritiqueAll: () => void;
}

export default function ProductGrid({
  products,
  activeProductId,
  onSelectProduct,
  onCritiqueAll,
}: ProductGridProps) {
  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Vault Header Info & Common Devil's Advocate Action */}
      <div className="flex items-center justify-between px-1 gap-2 flex-wrap sm:flex-nowrap">
        <div className="flex flex-col min-w-0">
          <h2 className="font-display font-bold text-lg text-text-primary truncate">
            Your Intelligence Vault
          </h2>
          <span className="text-xs text-text-secondary mt-0.5">
            {products.length} products verified · Sourced in real-time
          </span>
        </div>

        {/* Common Devil's Advocate Button */}
        <Button
          size="sm"
          onClick={onCritiqueAll}
          className="bg-danger/10 hover:bg-danger/25 border border-danger/40 hover:border-danger text-danger text-xs font-semibold px-3 h-9 gap-1.5 transition-all duration-200 shadow-sm group shrink-0"
        >
          <span className="group-hover:scale-125 transition-transform duration-200">👹</span>
          Devil's Advocate
        </Button>
      </div>

      {/* Stack of Cards */}
      <motion.div
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: {
            transition: {
              staggerChildren: 0.08,
            },
          },
        }}
        className="flex-1 flex flex-row lg:flex-col gap-3.5 overflow-x-auto lg:overflow-x-hidden lg:overflow-y-auto pb-3 lg:pb-0 pr-1 min-h-0"
      >
        {products.map((product) => (
          <motion.div
            key={product.id}
            variants={{
              hidden: { opacity: 0, y: 12 },
              show: { opacity: 1, y: 0 },
            }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="shrink-0 w-[290px] sm:w-[320px] lg:w-full"
          >
            <ProductCard
              product={product}
              isActive={activeProductId === product.id}
              onSelect={() => onSelectProduct(product.id)}
            />
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
