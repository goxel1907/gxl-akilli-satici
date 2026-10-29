import type { PatternCraft, PrintableKind } from "./etsy-trends.js";
import { isIpRisky } from "./ip-guard.js";
import { validateEtsyListingText } from "./pattern-studio.js";
import { familiesConflict, MISLEADING_FEATURE, proseCase, themeFamilies, type ThemeFamily } from "./theme.js";

// Otomatik denetleyici: uygulamanın ürettiği her metin (yapay zekâ talimat paketi, Etsy başlığı, etiketler, açıklama,
// pinler, reklam metinleri) telefona gönderilmeden önce burada denetlenir. Küçük yazım hataları yerinde düzeltilir;
// düzeltilemeyen bir sorun kalırsa rapor "ok: false" döner ve uygulama paylaşmadan önce uyarır.
// Kurallar, kullanıcının ChatGPT'ye gönderdiği pakette ve ajan incelemesinde bulunan gerçek hatalardan çıkarıldı.

export type GuardSeverity = "error" | "warn";

export interface GuardIssue {
  code: string;
  field: string;
  severity: GuardSeverity;
  messageTr: string;
  excerpt?: string;
}

export interface GuardReport {
  ok: boolean;
  checks: number;
  fixed: string[];
  issues: GuardIssue[];
}

interface Collector {
  issues: GuardIssue[];
  checks: number;
}

const excerptOf = (text: string, index: number) => text.slice(Math.max(0, index - 30), index + 50).replace(/\s+/g, " ").trim();

function find(c: Collector, field: string, text: string, pattern: RegExp, code: string, messageTr: string, severity: GuardSeverity = "error") {
  c.checks += 1;
  const match = pattern.exec(text);
  if (match) c.issues.push({ code, field, severity, messageTr, excerpt: excerptOf(text, match.index) });
}

const TR_LETTERS = /[çğıöşÇĞİÖŞ]|ü(?!rkiye)|Ü(?!RKİYE)/;
// "a US Letter", "an SVG" gibi kısaltmalar okunuşa göre doğrudur; kurala girmez.
const A_BEFORE_VOWEL = /(?<![\w'-])a\s+(?![A-Z]{2}|one\b|once\b|uni|use|usa|usb|uk\b|us\b|u\.)[aeiouAEIOU]\w/;
const AN_BEFORE_CONSONANT = /(?<![\w'-])an\s+(?![A-Z]{2}|hour|honest|hono|heir)[bcdfgjklmnpqrstvwxyzBCDFGJKLMNPQRSTVWXYZ]\w/;
const PLACEHOLDER = /\b(undefined|NaN)\b|\[object Object\]|\$\{|<DESIGN SPEC JSON>|\[(fiyat|Shopier bağlantısı|link|price|name)\]/;
const DOUBLE_WORD = /\b([A-Za-z]{3,})[^\S\n]+\1\b/i;
const BRITISH = /\b(colour|colours|fibre|recognisable|labelled|organise|organised|favourite|centre|grey)\b/;
const LOWER_PROPER = /(?<![\w./@-])(christmas|halloween|easter|thanksgiving|hanukkah|ipad|pinterest|instagram|facebook)(?![\w/@-]|\.\w)/;

// Her metne uygulanan genel kontroller.
function lintText(c: Collector, field: string, text: string, options: { english: boolean; prose: boolean }) {
  // Kontrol kurallarının kendisi tırnak içinde "undefined", "NaN" der; yer tutucu yalnız tırnak dışında aranır.
  find(c, field, text.split("\"").filter((_, index) => index % 2 === 0).join(" "), PLACEHOLDER, "placeholder", "Metinde doldurulmamış yer tutucu var (undefined, [fiyat] gibi).");
  find(c, field, text, DOUBLE_WORD, "double_word", "Aynı kelime art arda iki kez yazılmış.");
  find(c, field, text, /"([^"\n]{6,})"\s+\1/i, "double_phrase", "Ürün adı ve ürün türü art arda tekrar ediyor.");
  find(c, field, text, /[^\S\n]+,|,\s*,|\(\s*\)|,\s*\.(?=\s|$)|[^\S\n]+\.(?=\s|$)/, "punctuation", "Boşluk veya noktalama hatası var (\" ,\", \",,\", \"()\").");
  find(c, field, text, /(?<=\S)[^\S\n]{2,}(?=\S)/, "spacing", "Kelimeler arasında fazla boşluk var.", "warn");
  find(c, field, text, /^\s*[-•]\s*$|^B\d+\.\s*$/m, "empty_bullet", "Boş madde var.");
  if (options.english) {
    find(c, field, text, A_BEFORE_VOWEL, "article", "İngilizcede ünlüden önce \"an\" olmalı (\"a orange\" yanlış).");
    find(c, field, text, AN_BEFORE_CONSONANT, "article", "İngilizcede ünsüzden önce \"a\" olmalı.");
    find(c, field, text, TR_LETTERS, "turkish_in_english", "İngilizce metinde Türkçe harf/kelime var; ABD'li alıcı okuyamaz.");
    find(c, field, text, BRITISH, "british_spelling", "İngiliz yazımı var; ürün US English istiyor (color, fiber, labeled).", "warn");
  }
  if (options.prose) {
    const outsideQuotes = text.split("\"").filter((_, index) => index % 2 === 0).join(" ");
    find(c, field, outsideQuotes, LOWER_PROPER, "lowercase_proper", "Özel isim küçük harfle yazılmış (christmas → Christmas, ipad → iPad).");
  }
}

// ---------- Talimat paketi ----------

const META_SUBJECT = /\b(download|downloads|commercial|printable|printables|pdf|kit|journal|junk|seamless|pattern|patterns|scrapbook|adult|adults|kids|toddler|toddlers|preschool|instant|digital|bundle|pages?)\b/;
const STYLE_ONLY = /^(cozy|bold|easy|bold and easy|simple|boho|vintage|modern|cute|minimalist|moody|peculiar|aesthetic|neutral|retro)( motifs)?$/i;

function productFamilies(prompt: string): ThemeFamily[] {
  // Ürünü tanımlayan bölümler: özellikler, tema satırı ve Brief B konuları (kurallardaki "başka bayram yok" cümleleri hariç).
  const lines = prompt.split("\n").filter((line) => /^- Buyer-favored features:|^- Theme:|^B\d+\./.test(line));
  return [...new Set(lines.flatMap((line) => [...themeFamilies(line.replace(/nothing from other seasons, holidays or moods/g, "").replace(/;\s*add (nothing|no)\b[^;]*$/, ""))]))];
}

export interface PromptContext {
  studio: "printable" | "pattern";
  kind?: PrintableKind;
  craft?: PatternCraft;
  formats?: string[];
  // Üreticinin Brief B'ye yazdığı görsel konuları (metinden ayrıştırmak yerine doğrudan denetlenir).
  subjects?: string[];
}

function lintPrompt(c: Collector, field: string, prompt: string, context: PromptContext) {
  lintText(c, field, prompt, { english: true, prose: false });
  const ruleFree = prompt.split("\n").filter((line) => !/^-?\s*(Never|- Never)|^\d+\.\s*Never|Never offer or mention/.test(line.trim())).join("\n");
  find(c, field, ruleFree, /commercial[- ]use license option|offer[^.\n]*commercial[- ]use|state them clearly on the cover/i, "license_conflict", "Talimat ticari lisans sunmayı istiyor ama lisans 'yalnız kişisel kullanım'.");
  find(c, field, ruleFree, /\bvideo tutorial\b|\bshort video\b/i, "impossible_video", "Talimat yapay zekânın yapamayacağı bir video istiyor.");
  find(c, field, ruleFree, /\beditable template version\b/i, "impossible_editable", "Talimat ürünün içermediği düzenlenebilir sürümü vaat ediyor.");
  find(c, field, prompt, /you may refine it/i, "name_drift", "Yapay zekâya ürün adını değiştirme izni verilmiş; ilan ve görseller eski adla kalır.");
  c.checks += 1;
  if (!/another seller's/i.test(prompt)) c.issues.push({ code: "reference_rule", field, severity: "error", messageTr: "Başka satıcının ilan görselini veya telifli görseli referans almayı yasaklayan kural yok." });
  if (context.kind && ["paper_craft", "wall_art", "coloring"].includes(context.kind)) {
    find(c, field, prompt, /consistent page numbers and footer on every page|footer on every page(?! except)/i, "footer_conflict", "Tam sayfa kâğıt/duvar sanatı/boyama sayfasına altbilgi ve sayfa numarası isteniyor.");
  }
  if (context.kind && !["planner", "digital_planner", "journal"].includes(context.kind)) {
    find(c, field, prompt, /AM\/PM/, "qa_misfit", "Kontrol listesinde bu ürüne uymayan saat (AM/PM) kontrolü var.");
  }
  if (context.kind && context.kind !== "digital_planner" && !(context.formats || []).some((format) => /tablet|hyperlink/i.test(format))) {
    find(c, field, prompt, /^\d+\. LINKS —/m, "qa_misfit", "Tablet sürümü olmayan üründe bağlantı (LINKS) kontrolü var.");
  }
  if (context.studio === "pattern" && context.craft && !["crochet", "knitting"].includes(context.craft)) {
    find(c, field, prompt, /rep from \*|STITCH MATH|hook size/i, "craft_misfit", "Bu tekniğe uymayan tığ/şiş kuralları var (rep from *, ilmek hesabı).");
  }
  // Tema: ürünü tanımlayan bölümlerde birbiriyle çatışan bayram/mevsim/tarz olmamalı.
  c.checks += 1;
  const families = productFamilies(prompt);
  const clash = families.flatMap((left) => families.filter((right) => familiesConflict([left], [right])).map((right) => `${left} + ${right}`))[0];
  if (clash) c.issues.push({ code: "theme_mix", field, severity: "error", messageTr: `Ürün iki çatışan temayı karıştırıyor (${clash}).` });
  // Görsel konuları somut olmalı: satış kelimesi, kitle veya yalnız sıfat çizilecek konu olamaz.
  for (const subject of context.subjects || []) {
    c.checks += 1;
    if (META_SUBJECT.test(subject.toLowerCase()) || STYLE_ONLY.test(subject)) c.issues.push({ code: "meta_subject", field, severity: "error", messageTr: "Görsel konusu çizilecek bir şey değil (satış kelimesi, kitle veya yalnız sıfat).", excerpt: subject });
  }
  // Brief ve görsel atıfları gerçekten var olan bölümlere gitmeli.
  for (const match of prompt.matchAll(/\bBrief ([A-Z])\b/g)) {
    c.checks += 1;
    if (!new RegExp(`^## Brief ${match[1]} `, "m").test(prompt)) c.issues.push({ code: "dangling_reference", field, severity: "error", messageTr: `Talimat olmayan bir bölüme (Brief ${match[1]}) atıf yapıyor.` });
  }
  for (const match of prompt.matchAll(/\bimage C(\d+)\b/g)) {
    c.checks += 1;
    if (!new RegExp(`^### C${match[1]}\\. `, "m").test(prompt)) c.issues.push({ code: "dangling_reference", field, severity: "error", messageTr: `Talimat olmayan bir görsele (C${match[1]}) atıf yapıyor.` });
  }
  // Sayfa bütçesi toplamı ürün boyutuna eşit olmalı.
  const size = /^- Size: (\d+) core pages/m.exec(prompt);
  const budget = prompt.match(/### Page budget \(follow exactly\)\n((?:- .*\n?)+)/);
  if (size && budget) {
    c.checks += 1;
    const total = budget[1].split("\n").filter((line) => /^- \d+ /.test(line)).reduce((sum, line) => sum + Number(/^- (\d+)/.exec(line)![1]), 0);
    if (total !== Number(size[1])) c.issues.push({ code: "page_budget", field, severity: "error", messageTr: `Sayfa bütçesi (${total}) ürün boyutuyla (${size[1]} sayfa) tutmuyor.` });
  }
}

// ---------- Etsy ilanı ----------

export interface ListingLike {
  title: string;
  tags: string[];
  description: string;
  materials?: string[];
}

const TITLE_STOP = new Set(["with", "from", "your", "this", "that", "and", "for", "the", "gift"]);

function lintListing(c: Collector, field: string, listing: ListingLike, digital: boolean) {
  const validation = validateEtsyListingText({ title: listing.title, tags: listing.tags, materials: listing.materials });
  c.checks += 1;
  for (const issue of validation.issues) c.issues.push({ code: "etsy_rules", field, severity: "error", messageTr: issue });
  lintText(c, `${field}.title`, listing.title, { english: true, prose: false });
  lintText(c, `${field}.description`, listing.description, { english: true, prose: true });
  // Başlıkta bir kelime ikiden fazla, iki kelimelik bir ifade iki kez geçmemeli (anahtar kelime yığını).
  c.checks += 1;
  const words = (listing.title.toLowerCase().match(/[a-z0-9']+/g) || []).filter((word) => word.length >= 4 && !TITLE_STOP.has(word));
  const counts = new Map<string, number>();
  words.forEach((word) => counts.set(word, (counts.get(word) || 0) + 1));
  const stuffed = [...counts.entries()].filter(([, count]) => count > 2).map(([word]) => word);
  if (stuffed.length) c.issues.push({ code: "title_stuffing", field: `${field}.title`, severity: "error", messageTr: `Başlıkta aynı kelime ikiden fazla geçiyor: ${stuffed.join(", ")}.` });
  const segments = listing.title.toLowerCase().split(/,\s*/);
  const repeated = segments.find((segment, index) => segment.split(" ").length >= 2 && segments.some((other, otherIndex) => otherIndex !== index && (other === segment || new RegExp(`\\b${segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(other))));
  if (repeated) c.issues.push({ code: "title_repeat", field: `${field}.title`, severity: "error", messageTr: `Başlıkta aynı ifade iki kez geçiyor: "${repeated}".` });
  // Etiketler aynı ürünü anlatmalı: çatışan temalar, yanıltıcı ifadeler ve marka adları olmaz.
  c.checks += 1;
  const tagFamilies = listing.tags.map((tag) => themeFamilies(tag));
  const conflict = listing.tags.find((tag, index) => tagFamilies.some((other, otherIndex) => otherIndex !== index && familiesConflict(tagFamilies[index], other)));
  if (conflict) c.issues.push({ code: "tag_theme", field: `${field}.tags`, severity: "error", messageTr: `Etiketler birbiriyle çatışan temalar içeriyor (ör. "${conflict}").` });
  for (const value of [listing.title, ...listing.tags]) {
    c.checks += 1;
    if (MISLEADING_FEATURE.test(value)) c.issues.push({ code: "misleading", field: `${field}.tags`, severity: "error", messageTr: `Ürünün içermediği bir şeyi vaat ediyor: "${value}".` });
    if (isIpRisky(value)) c.issues.push({ code: "ip_risk", field: `${field}.tags`, severity: "error", messageTr: `Marka/telif riski olan kelime var: "${value}".` });
  }
  if (digital) {
    c.checks += 1;
    if (!/NO PHYSICAL ITEM WILL BE SHIPPED|NOT A FINISHED/.test(listing.description)) c.issues.push({ code: "digital_notice", field: `${field}.description`, severity: "error", messageTr: "Açıklamada dijital ürün olduğu ve kargo gönderilmeyeceği yazmıyor." });
    c.checks += 1;
    if (!/©\s*\d{4}\s*GXL Market Studio/.test(listing.description)) c.issues.push({ code: "license", field: `${field}.description`, severity: "error", messageTr: "Açıklamada yıllı telif ve lisans satırı yok." });
  }
  c.checks += 1;
  if (listing.description.split("\n")[0].trim() === listing.title.trim()) c.issues.push({ code: "description_opening", field: `${field}.description`, severity: "warn", messageTr: "Açıklama başlığı tekrar ederek başlıyor; ilk satır ürünü anlatan bir cümle olmalı." });
}

// ---------- Yerinde düzeltmeler ----------

// Kesin doğru olan küçük düzeltmeler: fazla boşluk, boşluklu virgül, "a orange" → "an orange", özel isim büyük harfi.
export function repairText(text: string, options: { prose?: boolean } = {}): string {
  let value = text
    .split("\n").map((line) => line.replace(/(?<=\S)[^\S\n]{2,}(?=\S)/g, " ").replace(/[^\S\n]+,/g, ",").replace(/,\s*,/g, ",").replace(/[^\S\n]+$/g, "")).join("\n")
    .replace(/(?<![\w'-])a(\s+)(?![A-Z]{2}|one\b|once\b|uni|use|usa|usb|uk\b|us\b|u\.)([aeiouAEIOU]\w)/g, "an$1$2")
    .replace(/(?<![\w'-])A(\s+)(?![A-Z]{2}|one\b|once\b|uni|use|usa|usb|uk\b|us\b|u\.)([aeiouAEIOU]\w)/g, "An$1$2");
  if (options.prose) value = proseCase(value);
  return value;
}

function repairListing<T extends ListingLike>(listing: T, fixed: string[], field: string): T {
  const title = repairText(listing.title);
  const description = repairText(listing.description, { prose: true });
  if (title !== listing.title) fixed.push(`${field}.title`);
  if (description !== listing.description) fixed.push(`${field}.description`);
  return { ...listing, title, description };
}

function report(c: Collector, fixed: string[]): GuardReport {
  return { ok: !c.issues.some((issue) => issue.severity === "error"), checks: c.checks, fixed, issues: c.issues };
}

// ---------- Stüdyo bazında denetim ----------

interface PinLike { title: string; description: string; overlay: string }

export function guardPrintablePlan<B extends { masterPrompt: string; pdfPrompt: string; pins: PinLike[]; artSubjects?: string[] }, L extends ListingLike>(brief: B, listing: L, context: { kind: PrintableKind; formats?: string[] }) {
  const c: Collector = { issues: [], checks: 0 };
  const fixed: string[] = [];
  const masterPrompt = repairText(brief.masterPrompt);
  const pdfPrompt = repairText(brief.pdfPrompt);
  if (masterPrompt !== brief.masterPrompt) fixed.push("masterPrompt");
  const pins = brief.pins.map((pin, index) => {
    const description = repairText(pin.description, { prose: true });
    if (description !== pin.description) fixed.push(`pin${index + 1}`);
    return { ...pin, description };
  });
  const safeListing = repairListing(listing, fixed, "listing");
  lintPrompt(c, "masterPrompt", masterPrompt, { studio: "printable", kind: context.kind, formats: context.formats, subjects: brief.artSubjects });
  pins.forEach((pin, index) => lintText(c, `pin${index + 1}`, `${pin.title}\n${pin.description}`, { english: true, prose: true }));
  lintListing(c, "listing", safeListing, true);
  return { brief: { ...brief, masterPrompt, pdfPrompt, pins }, listing: safeListing, quality: report(c, fixed) };
}

export function guardPatternPlan<B extends { masterPrompt: string; patternPrompt: string }, L extends ListingLike>(brief: B, listing: L, context: { craft: PatternCraft }) {
  const c: Collector = { issues: [], checks: 0 };
  const fixed: string[] = [];
  const masterPrompt = repairText(brief.masterPrompt);
  const patternPrompt = repairText(brief.patternPrompt);
  if (masterPrompt !== brief.masterPrompt) fixed.push("masterPrompt");
  const safeListing = repairListing(listing, fixed, "listing");
  lintPrompt(c, "masterPrompt", masterPrompt, { studio: "pattern", craft: context.craft });
  lintListing(c, "listing", safeListing, true);
  return { brief: { ...brief, masterPrompt, patternPrompt }, listing: safeListing, quality: report(c, fixed) };
}

export function guardProductPlan<P extends ListingLike>(plan: P) {
  const c: Collector = { issues: [], checks: 0 };
  const fixed: string[] = [];
  const safe = repairListing(plan, fixed, "listing");
  lintListing(c, "listing", safe, false);
  return { plan: safe, quality: report(c, fixed) };
}

interface CopyChannel { id: string; copy: Array<{ labelTr: string; text: string }> }

export function guardMarketingPlan<P extends { channels: CopyChannel[] }>(plan: P) {
  const c: Collector = { issues: [], checks: 0 };
  const fixed: string[] = [];
  const channels = plan.channels.map((channel) => ({
    ...channel,
    copy: channel.copy.map((block) => {
      const english = /İngilizce|Pin başlığı/.test(block.labelTr);
      const text = english ? repairText(block.text, { prose: true }) : block.text.split("\n").map((line) => line.replace(/(?<=\S)[^\S\n]{2,}(?=\S)/g, " ")).join("\n");
      if (text !== block.text) fixed.push(`${channel.id}.${block.labelTr}`);
      lintText(c, `${channel.id}.${block.labelTr}`, text, { english, prose: english });
      return { ...block, text };
    })
  }));
  return { plan: { ...plan, channels }, quality: report(c, fixed) };
}
