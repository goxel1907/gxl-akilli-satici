import type { Channel } from "./types.js";

export type ProspectSignalType = "inbound_message" | "product_favorite" | "shop_follow" | "ad_form" | "comment" | "story_reply" | "cart" | "order" | "email_opt_in";

export interface ProspectSignal {
  type: ProspectSignalType;
  channel: Channel;
  occurredAt: string;
  consent: boolean;
  productTags: string[];
  text?: string;
}

export interface ScoredProspect {
  score: number;
  grade: "hot" | "warm" | "nurture" | "ineligible";
  matchedInterests: string[];
  reasons: string[];
  canDraftFirstContact: boolean;
  nextAction: string;
}

const weights: Record<ProspectSignalType, number> = {
  order: 35, cart: 30, inbound_message: 28, ad_form: 25, story_reply: 18,
  email_opt_in: 18, product_favorite: 15, shop_follow: 10, comment: 8
};

export function scoreProspect(signals: ProspectSignal[], catalogTags: string[]): ScoredProspect {
  const now = Date.now();
  let score = 0;
  const reasons: string[] = [];
  const interests = new Set<string>();
  let contactPermission = false;

  for (const signal of signals) {
    const ageDays = Math.max(0, (now - Date.parse(signal.occurredAt)) / 86_400_000);
    if (!Number.isFinite(ageDays)) continue;
    const recency = ageDays <= 2 ? 1 : ageDays <= 7 ? 0.8 : ageDays <= 30 ? 0.5 : 0.2;
    const contribution = Math.round(weights[signal.type] * recency);
    score += contribution;
    reasons.push(`${signal.type}: +${contribution}`);
    if (signal.consent || signal.type === "inbound_message" || signal.type === "ad_form" || signal.type === "email_opt_in") contactPermission = true;
    for (const tag of signal.productTags) if (catalogTags.some((catalogTag) => catalogTag.toLocaleLowerCase("tr-TR") === tag.toLocaleLowerCase("tr-TR"))) interests.add(tag);
    if (signal.text && /(fiyat|stok|kargo|satın|sipariş|price|shipping|available)/i.test(signal.text)) score += 12;
  }

  score = Math.min(100, score + Math.min(20, interests.size * 4));
  const grade = !contactPermission ? "ineligible" : score >= 70 ? "hot" : score >= 40 ? "warm" : "nurture";
  return {
    score,
    grade,
    matchedInterests: [...interests],
    reasons,
    canDraftFirstContact: contactPermission,
    nextAction: !contactPermission ? "Mesaj gönderme; izinli reklam/organik içerikle yeniden etkileşim bekle." : grade === "hot" ? "Kişiye ve ilgilendiği ürüne özel ilk mesaj taslağını onaya sun." : grade === "warm" ? "İlgili ürün ve sosyal kanıt içeren kısa mesaj taslağını onaya sun." : "İzinli içerik/yeniden stok bildirimiyle besle; seri mesaj gönderme."
  };
}
