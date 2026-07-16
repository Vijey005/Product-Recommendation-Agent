"use client";

import React from "react";
import { motion } from "framer-motion";
import { Product } from "@/types";
import { Star, ShieldAlert } from "lucide-react";
import ConfidenceScore from "./ConfidenceScore";
import DataSourceBadge from "./DataSourceBadge";
import { Button } from "@/components/ui/button";

interface ProductCardProps {
  product: Product;
  isActive: boolean;
  onSelect: () => void;
  onCritique: (productName: string) => void;
}

export default function ProductCard({
  product,
  isActive,
  onSelect,
  onCritique,
}: ProductCardProps) {
  // Format rating stars
  const fullStars = Math.floor(product.rating);
  const hasHalfStar = product.rating % 1 !== 0;

  const handleCritiqueClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCritique(product.name);
  };

  return (
    <motion.div
      onClick={onSelect}
      whileHover={{ y: -2, boxShadow: "0 10px 30px -10px rgba(0, 0, 0, 0.5)" }}
      className={`border rounded-xl p-4 flex flex-col gap-4 cursor-pointer select-none transition-all duration-300 relative ${
        isActive
          ? "border-accent-primary bg-accent-surface/30 shadow-[0_0_20px_rgba(91,107,248,0.1)]"
          : "border-border-default bg-bg-elevated hover:border-border-bright"
      }`}
    >
      {/* Selection Left Border Indicator */}
      {isActive && (
        <div className="absolute left-0 top-3 bottom-3 w-1 bg-accent-primary rounded-r" />
      )}

      {/* Main product row */}
      <div className="flex gap-4 items-start">
        {/* Thumbnail Image */}
        <div className="h-16 w-16 rounded-lg bg-bg-surface overflow-hidden border border-border-default/50 flex-shrink-0 flex items-center justify-center relative">
          <img
            src={product.imageUrl}
            alt={product.name}
            className="h-full w-full object-cover select-none pointer-events-none"
            onError={(e) => {
              // Fallback image in case of load failure
              (e.target as HTMLImageElement).src =
                "https://images.unsplash.com/photo-1593642632823-8f785ba67e45?w=100&q=80";
            }}
          />
        </div>

        {/* Title, Brand, Ratings */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-col select-none">
            <span className="text-[10px] font-bold text-accent-secondary uppercase tracking-wide">
              {product.brand}
            </span>
            <h3 className="font-display font-semibold text-sm sm:text-base text-text-primary leading-tight truncate">
              {product.name}
            </h3>
          </div>

          <div className="flex items-center gap-1.5 mt-1 select-none text-[11px] text-text-secondary">
            {/* Stars rendering */}
            <div className="flex text-warning">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={`h-3 w-3 ${
                    i < fullStars
                      ? "fill-warning stroke-warning"
                      : i === fullStars && hasHalfStar
                      ? "fill-warning/50 stroke-warning"
                      : "text-text-muted"
                  }`}
                />
              ))}
            </div>
            <span>{product.rating}</span>
            <span className="text-text-muted">({product.reviewCount})</span>
          </div>
        </div>
      </div>

      {/* Middle row: Price and confidence score */}
      <div className="flex items-center justify-between border-t border-border-default/40 pt-3">
        <div className="flex flex-col select-none">
          <span className="text-[9px] font-bold tracking-wider text-text-muted uppercase">
            BEST PRICE
          </span>
          <span className="font-display font-extrabold text-base sm:text-lg text-text-primary">
            {product.currency === "USD" ? "$" : ""}
            {product.price.toLocaleString()}
          </span>
        </div>
        <ConfidenceScore score={product.confidenceScore} />
      </div>

      {/* Footer actions and badges */}
      <div className="flex items-center justify-between gap-2 border-t border-border-default/40 pt-3 flex-wrap sm:flex-nowrap">
        <DataSourceBadge source={product.dataSource} />

        {/* Action Button: Critique */}
        <Button
          size="sm"
          variant="outline"
          onClick={handleCritiqueClick}
          className="border-border-bright hover:border-danger hover:bg-danger/10 text-text-secondary hover:text-danger text-xs font-semibold px-2.5 h-8 gap-1.5 transition-colors duration-200 select-none group"
        >
          <span className="group-hover:animate-bounce">👹</span>
          Critique This
        </Button>
      </div>
    </motion.div>
  );
}
