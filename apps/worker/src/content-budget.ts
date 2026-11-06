import type { PrintableKind } from "./etsy-trends.js";

export function contentLimits(kind: PrintableKind, alphabet = false) {
  if (alphabet) return { min: 26, max: 26, step: 1, unitTr: "harf sayfası" };
  const units: Partial<Record<PrintableKind, string>> = { party: "ana oyun sayfası", slides: "soru", spreadsheet: "sekme", app_icons: "ikon", wall_art: "tasarım", wallpaper: "duvar kâğıdı", calendar: "ay", resume: "şablon" };
  const ranges: Partial<Record<PrintableKind, [number, number, number?]>> = { calendar: [12,12], resume: [4,4], wall_art: [1,6], wallpaper: [1,12], app_icons: [16,96], slides: [15,50,5] };
  const [min,max,step = 1] = ranges[kind] || [1,1000];
  return { min,max,step,unitTr: units[kind] || "ana içerik sayfası" };
}
export function effectiveContentCount(kind: PrintableKind, requested: number, alphabet = false): number {
  const {min,max,step} = contentLimits(kind,alphabet);
  return Math.min(max,Math.max(min,Math.round(requested/step)*step));
}
export function contentBudget(input: {kind: PrintableKind; productType: string; keyword?: string; pageCount?: number}, defaultCount: number, median?: number) {
  const alphabet = input.kind === "coloring" && /\b(abc|alphabet|a-z)\b/i.test(`${input.productType} ${input.keyword || ""}`);
  const limits=contentLimits(input.kind,alphabet);
  const observed=Number.isFinite(median)&&median!>0 ? Math.round(median!) : undefined;
  // Title/label counts may include support pages. Match the observed scope first;
  // do not multiply it just to claim more value or more sales.
  const proposed=observed || defaultCount;
  const suggested=effectiveContentCount(input.kind,Math.min(proposed, input.kind === "party" ? 60 : 200),alphabet);
  return { suggested, effective: effectiveContentCount(input.kind,input.pageCount || suggested,alphabet), requested: input.pageCount, limits,
    ...(observed ? { competitorMedian: observed } : {}),
    basisTr: observed ? `Örnek ilanların belirttiği içerik sayısı ortancası ${observed}. Destek sayfaları dahil olabilir; öneri ürünün yapısına göre sınırlandı.` : `Örneklemde güvenilir içerik sayısı yok; türün başlangıç kapsamı ${defaultCount} kullanıldı.`,
    noteTr: "Daha fazla sayfa daha fazla satış kanıtı değildir. Tekrarsız ana içerik ile kapak, cevap, rehber ve diğer destek sayfaları ayrı sayılmalı; bütün formatlar aynı kapsamı taşımalı." };
}
