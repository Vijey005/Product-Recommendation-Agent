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
}

export default function ProductCard({
  product,
  isActive,
  onSelect,
}: ProductCardProps) {
  // Format rating stars
  const displayRating = typeof product.rating === "number" && product.rating > 0 ? product.rating : 4.5;
  const fullStars = Math.floor(displayRating);
  const hasHalfStar = displayRating % 1 !== 0;
  const reviewCountFormatted = typeof product.reviewCount === "number" && product.reviewCount > 0
    ? product.reviewCount.toLocaleString()
    : null;

  return (
    <motion.div
      onClick={onSelect}
      whileHover={{ y: -2, boxShadow: "0 10px 30px -10px rgba(0, 0, 0, 0.5)" }}
      className={`border rounded-xl p-4 flex flex-col gap-4 cursor-pointer transition-all duration-300 relative ${
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
            src={product.imageUrl || "https://images.unsplash.com/photo-1593642632823-8f785ba67e45?w=100&q=80"}
            alt={product.name}
            className="h-full w-full object-cover pointer-events-none"
            onError={(e) => {
              // Fallback image in case of load failure
              (e.target as HTMLImageElement).src =
                "https://images.unsplash.com/photo-1593642632823-8f785ba67e45?w=100&q=80";
            }}
          />
        </div>

        {/* Title, Brand, Ratings */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-accent-secondary uppercase tracking-wide">
              {product.brand || product.name?.split(" ")[0] || "Brand"}
            </span>
            <h3 className="font-display font-semibold text-sm sm:text-base text-text-primary leading-tight truncate">
              {product.name}
            </h3>
          </div>

          <div className="flex items-center gap-1.5 mt-1 text-[11px] text-text-secondary">
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
            <span>{displayRating}</span>
            {reviewCountFormatted ? (
              <span className="text-text-muted">({reviewCountFormatted})</span>
            ) : (
              <span className="text-text-muted italic">(No ratings)</span>
            )}
          </div>
        </div>
      </div>

      {/* Middle row: Price and confidence score */}
      <div className="flex items-center justify-between border-t border-border-default/40 pt-3">
        <div className="flex flex-col">
          <span className="text-[9px] font-bold tracking-wider text-text-muted uppercase">
            BEST PRICE
          </span>
          {product.price != null ? (
            <span className="font-display font-extrabold text-base sm:text-lg text-text-primary">
              {product.currency === "USD" ? "$" : "₹"}
              {product.price.toLocaleString("en-IN")}
            </span>
          ) : (
            <span className="text-xs text-text-muted italic animate-pulse">
              Fetching price…
            </span>
          )}
        </div>
        <ConfidenceScore score={product.confidenceScore > 0 ? product.confidenceScore : 70} />
      </div>

      {/* Footer actions and badges */}
      <div className="flex items-center justify-between gap-2 border-t border-border-default/40 pt-3 flex-wrap sm:flex-nowrap">
        <DataSourceBadge source={product.dataSource || "live_scrape"} />
      </div>
    </motion.div>
  );
}
