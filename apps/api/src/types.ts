export type Channel = "whatsapp" | "instagram" | "facebook" | "shopier" | "letgo";
export type LeadStage = "new" | "qualified" | "contact_pending" | "active" | "won" | "lost" | "blocked";
export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: "tesbih" | "gumus_tesbih" | "caki" | "taki" | "hobi";
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
