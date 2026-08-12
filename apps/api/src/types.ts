export type Channel = "whatsapp" | "instagram" | "facebook" | "shopier" | "letgo" | "etsy" | "email";
export type LeadStage = "new" | "qualified" | "contact_pending" | "active" | "won" | "lost" | "blocked";
export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  description: string;
  priceTry?: number;
  stock: number;
  stockVerified: boolean;
  weightGrams?: number;
  material: string;
  imageUrls: string[];
  videoUrls: string[];
  tags: string[];
  shopierUrl?: string;
  letgoUrl?: string;
  etsyUrl?: string;
}

export interface MarketplaceListingPack {
  etsy: {
    language: "en";
    title: string;
    description: string;
    tags: string[];
    materials: string[];
  };
  turkey: {
    title: string;
    description: string;
    tags: string[];
  };
  shipping: {
    processingMinBusinessDays: number;
    processingMaxBusinessDays: number;
    destinations: Array<{
      region: "US" | "EU" | "TR" | "WORLD";
      minTransitBusinessDays: number;
      maxTransitBusinessDays: number;
      note: string;
    }>;
  };
  warnings: string[];
}

export interface Lead {
  id: string;
  displayName: string;
  channel: Channel;
  handle: string;
  stage: LeadStage;
  consent: boolean;
  interests: string[];
  score: number;
  lastInboundAt?: string;
  autoReplyAllowed: boolean;
}

export interface Message {
  id: string;
  leadId: string;
  channel: Channel;
  direction: "inbound" | "outbound";
  text: string;
  mediaUrls: string[];
  createdAt: string;
  automated: boolean;
}

export interface Approval {
  id: string;
  leadId: string;
  channel: Channel;
  draft: string;
  productIds: string[];
  status: ApprovalStatus;
  createdAt: string;
  decidedAt?: string;
}

export interface AgentDecision {
  reply: string;
  productIds: string[];
  action: "reply" | "handoff" | "block";
  reason: string;
}
