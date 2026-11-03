// Etsy'nin 22 Ekim 2026 yapay zekâ kuralları (Creativity Standards ve Listing Image Requirements):
// - Yapay zekâyla yazılmış desen, tarif ve talimat kılavuzu satılamaz; ilanda belirtmek de yetmez.
// - Desen ilanında, desenle gerçekten yapılmış bitmiş ürünün en az bir gerçek, düzenlenmemiş fotoğrafı olmalı.
// - Yapay zekâ destekli dijital ürün (planlayıcı, boyama, duvar sanatı, kâğıt kiti) serbesttir; açıklamada
//   yapay zekâ kullanımı yazılır ve ilanda alıcının alacağı sayfaların gerçek önizlemesi bulunur.
// - İnsan kontrolü olmadan robotun açtığı ilan yasaktır: uygulama yalnız taslak açar, yayını satıcı onaylar.

export const AI_PATTERN_BAN_TR = "Etsy 22 Ekim 2026'dan beri yapay zekâyla yazılmış örgü, tığ işi, dikiş, nakış, kanaviçe, punch ve makrome desenlerini, tarifleri ve talimat kılavuzlarını yasakladı. İlanda belirtmek de yetmiyor; böyle bir ilan kaldırılır ve mağaza uyarı alır. Desen ancak sizin veya mağaza üyenizin kendi yazdığı ve gerçekten yaptığı bir desense satılabilir. İlanda da bitmiş ürünün en az bir gerçek, düzenlenmemiş fotoğrafı olmalı.";

export interface PatternPolicyFlags {
  ownPattern?: boolean;
  aiAssisted?: boolean;
  photosAreRenders?: boolean;
  testMade?: boolean;
}

// Desen Etsy'ye gidebilir mi? Eksik her şart Türkçe yazılır; boş liste "uygun" demektir.
export function patternPolicyIssues(flags: PatternPolicyFlags): string[] {
  return [
    ...(flags.ownPattern !== true || flags.aiAssisted === true ? ["Deseni yapay zekâ değil, siz veya mağaza üyeniz yazmış olmalı."] : []),
    ...(flags.testMade !== true ? ["Desen bizzat yapılarak denenmiş olmalı."] : []),
    ...(flags.photosAreRenders !== false ? ["İlanda bitmiş ürünün gerçek, düzenlenmemiş fotoğrafı olmalı (render veya yapay zekâ görseli tek başına yetmez)."] : [])
  ];
}

export function patternPolicyMessage(flags: PatternPolicyFlags): string | undefined {
  const issues = patternPolicyIssues(flags);
  return issues.length ? `Bu desen Etsy'ye yüklenemez. ${issues.join(" ")} (Etsy 22 Ekim 2026 kuralı.)` : undefined;
}

// Etsy "is_supply": desen ve kâğıt kiti başka bir şey yapmak için malzemedir; planlayıcı, duvar sanatı,
// boyama sayfası, oyun, günlük ve tarif kartı bitmiş üründür. Yanlış seçim ilanı yanlış yerde gösterir.
export function isCraftSupply(product: { kind?: string; craft?: string }): boolean {
  return Boolean(product.craft) || product.kind === "paper_craft";
}

// Yapay zekâ beyanı: Etsy açıklamada beyan ister; ilan formu ayrıca sorarsa "evet" denir.
export const AI_DISCLOSURE_WARNING_TR = "Açıklamada yapay zekâ beyanı var; silmeyin. Etsy ilan formu yapay zekâ kullanımını sorarsa 'evet' seçin.";
