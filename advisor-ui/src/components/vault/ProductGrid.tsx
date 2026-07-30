"use client";

import React from "react";
import { motion } from "framer-motion";
import { Product } from "@/types";
import ProductCard from "./ProductCard";

interface ProductGridProps {
  products: Product[];
  activeProductId: string | null;
  onSelectProduct: (productId: string) => void;
  onCritiqueProduct: (productName: string) => void;
}

export default function ProductGrid({
  products,
  activeProductId,
  onSelectProduct,
  onCritiqueProduct,
}: ProductGridProps) {
  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Vault Header Info */}
      <div className="flex flex-col px-1">
        <h2 className="font-display font-bold text-lg text-text-primary">
          Your Intelligence Vault
        </h2>
        <span className="text-xs text-text-secondary mt-0.5">
          {products.length} products verified · Sourced in real-time
        </span>
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
              onCritique={onCritiqueProduct}
            />
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
