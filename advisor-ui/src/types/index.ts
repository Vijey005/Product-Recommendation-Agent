export interface Product {
  id: string;
  name: string;
  brand: string;
  price: number | null;        // null = price not found in data (never fabricated)
  currency: string | null;
  imageUrl: string;
  category: string;
  confidenceScore: number; // 0-100
  specs: Record<string, string>;
  prosHighlights: string[];
  consHighlights: string[];
  dataSource: "google_shopping" | "live_scrape" | "vault_cache";
  reviewCount: number;
  rating: number;
  affiliateUrl: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  citations?: Citation[];
  isStreaming?: boolean;
}

export interface Citation {
  productId: string;
  productName: string;
  field: string;
}

export interface SelectionChip {
  label: string;
  value: string;
  icon?: string;
  category: string;
}

export interface CritiqueReport {
  productId: string;
  overallVerdict: string;
  issues: CritiqueIssue[];
  communityReportCount: number;
  recommendedAlternative?: string;
}

export interface CritiqueIssue {
  title: string;
  description: string;
  severityScore: number; // 1-5
  reportCount: number;
  category: "hardware" | "software" | "build_quality" | "value" | "support";
}

export type Phase = "intake" | "searching" | "vault" | "chatting";
