export type MarketplaceName = "etsy" | "shopier" | "letgo";
export type PolicyStatus = "allowed" | "review" | "blocked";
export type ProductOrigin = "made_by_seller" | "designed_by_seller" | "vintage" | "craft_supply" | "commercial_resale" | "unknown";
export type RiskFlag =
  | "weapon"
  | "pocket_knife"
  | "culinary_tool_knife"
  | "firearm"
  | "ammunition"
  | "explosive"
  | "illegal_drug"
  | "tobacco"
  | "alcohol"
  | "medical_drug"
  | "counterfeit"
  | "stolen"
  | "official_document"
  | "live_animal"
  | "human_remains"
  | "recalled_product"
  | "explicit_adult"
  | "food"
  | "fossil"
  | "service"
  | "childrens_product"
  | "branded_product"
  | "precious_material_claim"
  | "none";

export interface ProductPolicyInput {
  origin: ProductOrigin;
  yearMade?: number;
  authenticityVerified: boolean;
  riskFlags: RiskFlag[];
}

export interface MarketplacePolicyDecision {
  marketplace: MarketplaceName;
  status: PolicyStatus;
  label: string;
  reasons: string[];
  requiredEvidence: string[];
  sourceUrl: string;
  policyCheckedAt: string;
  autoPublishAllowed: boolean;
}

const POLICY_CHECKED_AT = "2026-08-12";
const SOURCES: Record<MarketplaceName, string> = {
  etsy: "https://www.etsy.com/legal/prohibited/",
  shopier: "https://www.shopier.com/",
  letgo: "https://help.letgo.com/hc/tr/articles/30006899092754-EK-2-Yasakl%C4%B1-%C3%9Cr%C3%BCnler-Listesi"
};

const commonBlocks = new Set<RiskFlag>([
  "firearm", "ammunition", "explosive", "illegal_drug", "counterfeit", "stolen",
  "official_document", "live_animal", "human_remains", "recalled_product"
]);

function decision(marketplace: MarketplaceName, status: PolicyStatus, reasons: string[], requiredEvidence: string[] = []): MarketplacePolicyDecision {
  return {
    marketplace,
    status,
    label: status === "blocked" ? "YASAK — yayınlama kapalı" : status === "review" ? "İNCELEME GEREKLİ — doğrulanmadan yayınlama" : "UYGUNLUK KONTROLÜ GEÇTİ",
    reasons,
    requiredEvidence,
    sourceUrl: SOURCES[marketplace],
    policyCheckedAt: POLICY_CHECKED_AT,
    autoPublishAllowed: status === "allowed"
  };
}

function has(input: ProductPolicyInput, ...flags: RiskFlag[]) {
  return flags.some((flag) => input.riskFlags.includes(flag));
}

export function evaluateMarketplacePolicies(input: ProductPolicyInput): MarketplacePolicyDecision[] {
  const common = input.riskFlags.filter((flag) => commonBlocks.has(flag));

  const etsy = (() => {
    if (common.length) return decision("etsy", "blocked", [`Yasak/riskli ürün işareti: ${common.join(", ")}.`]);
    if (has(input, "weapon", "pocket_knife", "tobacco", "alcohol", "medical_drug", "explicit_adult")) {
      return decision("etsy", "blocked", ["Etsy yasaklı ürün kuralıyla eşleşiyor."]);
    }
    if (input.origin === "commercial_resale") {
      const vintage = Boolean(input.yearMade && input.yearMade <= new Date().getUTCFullYear() - 20);
      if (!vintage) return decision("etsy", "blocked", ["20 yıldan yeni ticari ürünlerin sıradan yeniden satışı Etsy yaratıcılık standartlarına uygun değildir."]);
    }
    const evidence: string[] = [];
    if (input.origin === "unknown") evidence.push("Ürünün satıcı tarafından yapılmış, tasarlanmış, 20+ yıllık vintage veya uygun el işi malzemesi olduğuna dair beyan");
    if (input.origin === "vintage" && !input.yearMade) evidence.push("Üretim yılı ve 20+ yıllık olduğunu gösteren fotoğraf/belge");
    if (has(input, "branded_product") && !input.authenticityVerified) evidence.push("Marka/orijinallik kanıtı, seri veya satın alma belgesi");
    if (has(input, "childrens_product")) evidence.push("Yaş grubu, güvenlik uyarıları ve geçerli ürün güvenliği bilgileri");
    if (has(input, "precious_material_claim")) evidence.push("925/ayar/malzeme damgası veya doğrulama belgesi");
    return evidence.length ? decision("etsy", "review", ["Etsy uygunluğu için satıcı beyanı veya ürün kanıtı eksik."], evidence) : decision("etsy", "allowed", ["Mevcut beyanlar Etsy yaratıcılık ve yasaklı ürün ön kontrolünü geçti."]);
  })();

  const letgo = (() => {
    const blockedFlags: RiskFlag[] = ["weapon", "pocket_knife", "firearm", "ammunition", "explosive", "illegal_drug", "tobacco", "alcohol", "medical_drug", "official_document", "live_animal", "human_remains", "explicit_adult", "food", "fossil", "service", "counterfeit", "stolen", "recalled_product"];
    const matches = input.riskFlags.filter((flag) => blockedFlags.includes(flag));
    if (matches.length) return decision("letgo", "blocked", [`Letgo yasaklı ürün listesiyle eşleşiyor: ${matches.join(", ")}.`]);
    const evidence = has(input, "branded_product") && !input.authenticityVerified ? ["Marka/orijinallik kanıtı"] : [];
    return evidence.length ? decision("letgo", "review", ["Yanıltıcı marka iddiasını önlemek için kanıt gerekiyor."], evidence) : decision("letgo", "allowed", ["Letgo yasaklı ürün ön kontrolünde eşleşme bulunmadı."]);
  })();

  const shopier = (() => {
    if (common.length || has(input, "illegal_drug", "explicit_adult")) return decision("shopier", "blocked", [`Yasa/platform açısından yasak veya yüksek riskli işaret: ${[...common, ...input.riskFlags.filter((flag) => ["illegal_drug", "explicit_adult"].includes(flag))].join(", ")}.`]);
    const evidence: string[] = [];
    if (has(input, "weapon", "pocket_knife", "tobacco", "alcohol", "medical_drug", "food")) evidence.push("Shopier güncel yasaklı ürün listesi ve Türkiye mevzuatı için uzman kontrolü");
    if (has(input, "branded_product") && !input.authenticityVerified) evidence.push("Marka/orijinallik kanıtı");
    if (has(input, "childrens_product")) evidence.push("Yaş grubu ve ürün güvenliği bilgileri");
    if (has(input, "precious_material_claim")) evidence.push("Malzeme/ayar doğrulaması");
    return evidence.length ? decision("shopier", "review", ["Ürün yayınlanmadan önce belge/politika kontrolü gerekli."], evidence) : decision("shopier", "allowed", ["Shopier ve genel yasal uygunluk ön kontrolünde engel bulunmadı."]);
  })();

  return [etsy, shopier, letgo];
}
