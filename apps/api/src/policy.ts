import type { AgentDecision, Lead, Product } from "./types.js";

const stopPatterns = [/\bstop\b/i, /mesaj\s*istemi?yorum/i, /iletişim\s*kurma/i, /rahatsız\s*etme/i, /iptal/i];
const handoffPatterns = [/iade/i, /şikayet/i, /savc/i, /mahkeme/i, /indirim/i, /pazarlık/i, /küfür/i, /tehdit/i];

export function requiresHumanHandoff(text: string): boolean {
  return handoffPatterns.some((pattern) => pattern.test(text));
}

export function requestsOptOut(text: string): boolean {
  return stopPatterns.some((pattern) => pattern.test(text));
}

export function canStartConversation(lead: Lead): boolean {
  return lead.consent && lead.stage !== "blocked";
}

export function canAutoReply(lead: Lead): boolean {
  return lead.consent && lead.autoReplyAllowed && lead.stage === "active";
}

export function validateDecision(decision: AgentDecision, products: Product[]): AgentDecision {
  const selected = products.filter((product) => decision.productIds.includes(product.id));
  if (selected.some((product) => product.stock <= 0)) {
    return { ...decision, action: "handoff", reason: "Stok doğrulaması gerekiyor." };
  }
  if (selected.some((product) => product.category === "caki")) {
    return { ...decision, action: "handoff", reason: "Çakı ürünü için yaş, kargo ve mevzuat kontrolü gerekiyor." };
  }
  return decision;
}
