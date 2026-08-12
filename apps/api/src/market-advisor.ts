export type Marketplace = "etsy" | "shopier" | "letgo";

export interface MarketSignal {
  marketplace: Marketplace;
  query: string;
  observedAt: string;
  sourceUrl: string;
  demandScore: number;
  competitionScore: number;
  medianPrice?: number;
  currency?: string;
  salesEvidence: "verified_sales" | "favorites_reviews" | "listing_density" | "own_store_data";
}

export interface Opportunity {
  marketplace: Marketplace;
  query: string;
  opportunityScore: number;
  reason: string;
  evidence: Pick<MarketSignal, "observedAt" | "sourceUrl" | "salesEvidence">;
}

export function rankMarketOpportunities(signals: MarketSignal[]): Opportunity[] {
  return signals
    .filter((signal) => signal.sourceUrl && !Number.isNaN(Date.parse(signal.observedAt)))
    .map((signal) => {
      const demand = Math.max(0, Math.min(100, signal.demandScore));
      const competition = Math.max(0, Math.min(100, signal.competitionScore));
      const evidenceWeight = signal.salesEvidence === "verified_sales" || signal.salesEvidence === "own_store_data" ? 1 : 0.75;
      const opportunityScore = Math.round((demand * 0.7 + (100 - competition) * 0.3) * evidenceWeight);
      return {
        marketplace: signal.marketplace,
        query: signal.query,
        opportunityScore,
        reason: `Talep ${demand}/100, rekabet ${competition}/100. ${signal.salesEvidence === "listing_density" ? "Satış değil ilan yoğunluğu sinyalidir." : "Satış/etkileşim sinyali kullanıldı."}`,
        evidence: { observedAt: signal.observedAt, sourceUrl: signal.sourceUrl, salesEvidence: signal.salesEvidence }
      };
    })
    .sort((a, b) => b.opportunityScore - a.opportunityScore);
}
