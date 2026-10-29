import { US_SEASONS } from "./seasonal.js";

// Tema uyumu: bir ürün tek bir temada olmalı. Trend verisi aynı aramada Noel, Cadılar Bayramı ve
// dark academia ilanlarını yan yana getirir; hepsini tek kite koymak alıcıya tutarsız bir ürün verir
// (ChatGPT'ye giden pakette "Christmas + Folk witch + Dark academia" böyle oluştu).
// Burada her temanın ailesi, birbiriyle çatışan aileler ve bayramların satış zamanı tutulur.

export type ThemeFamily =
  | "christmas" | "halloween" | "thanksgiving" | "easter" | "valentine" | "st_patricks" | "patriotic" | "hanukkah" | "ramadan" | "mothers_day" | "fathers_day"
  | "winter" | "spring" | "summer" | "fall"
  | "witchy" | "dark" | "cozy" | "botanical" | "vintage" | "boho" | "minimalist" | "coastal" | "western" | "playful"
  | "bridal" | "bachelorette" | "baby_shower" | "birthday" | "graduation";

const TERMS: Array<[ThemeFamily, RegExp]> = [
  ["christmas", /\b(christmas|xmas|noel|santa|holly|mistletoe|reindeer|gingerbread|nutcracker|holidays?)\b/],
  ["halloween", /\b(halloween|spooky|ghosts?|pumpkins?|jack o lantern|skeletons?|skulls?|haunted|trick or treat|zombies?|vampires?)\b/],
  ["thanksgiving", /\b(thanksgiving|friendsgiving)\b/],
  ["easter", /\b(easter)\b/],
  ["valentine", /\b(valentines?|valentine's|galentines?)\b/],
  ["st_patricks", /\b(st\.? patrick'?s?|saint patrick'?s?|shamrocks?)\b/],
  ["patriotic", /\b(4th of july|fourth of july|july 4th|patriotic|independence day)\b/],
  ["hanukkah", /\b(hanukkah|chanukah)\b/],
  ["ramadan", /\b(ramadan|eid)\b/],
  ["mothers_day", /\b(mother'?s day|mothers day)\b/],
  ["fathers_day", /\b(father'?s day|fathers day)\b/],
  ["winter", /\b(winter|snow|snowflakes?|snowy|frost|frosty|yule)\b/],
  ["spring", /\b(spring|springtime)\b/],
  ["summer", /\b(summer|tropical)\b/],
  ["fall", /\b(fall|autumn|harvest)\b/],
  ["witchy", /\b(witch|witches|witchy|witchcraft|occult|grimoire|spells?|tarot|pagan|wicca|coven)\b/],
  ["dark", /\b(dark academia|gothic|goth|macabre)\b/],
  ["cozy", /\b(cozy|cosy|cottage|cottagecore|hygge|farmhouse)\b/],
  ["botanical", /\b(botanical|floral|flowers?|wildflowers?|garden|mushrooms?|ferns?|herbs?|herbal)\b/],
  ["vintage", /\b(vintage|retro|antique|victorian|ephemera|nostalgic|heritage)\b/],
  ["boho", /\b(boho|bohemian)\b/],
  ["minimalist", /\b(minimalist|minimal|scandi|neutral)\b/],
  ["coastal", /\b(coastal|nautical|ocean|seaside|beach)\b/],
  ["western", /\b(western|cowgirl|cowboy|rodeo)\b/],
  ["playful", /\b(kawaii|cute|rainbow|unicorns?)\b/],
  ["bridal", /\b(bridal|wedding shower|bride to be|bride-to-be)\b/],
  ["bachelorette", /\b(bachelorette|hen party|hen do)\b/],
  ["baby_shower", /\b(baby shower|gender reveal|baby sprinkle)\b/],
  ["birthday", /\b(birthday|bday)\b/],
  ["graduation", /\b(graduation|grad party)\b/]
];

// Ürünün kendisini değil satış biçimini anlatan kelimeler: tek başına özellik, motif veya stil olamaz.
export const META_WORDS = new Set(["page", "pages", "kit", "kits", "pack", "packs", "bundle", "bundles", "set", "sets", "sheet", "sheets", "paper", "papers", "printable", "printables", "digital", "download", "downloads", "instant", "pdf", "svg", "png", "jpg", "file", "files", "commercial", "use", "personal", "editable", "template", "templates", "insert", "inserts", "bonus", "collection", "scrapbook", "clipart", "mega", "journal", "journals", "junk"]);
// "commercial use" ve "editable" yanıltıcıdır: bu ürünler kişisel kullanım lisanslı ve düzenlenemez PDF olarak satılır.
export const MISLEADING_FEATURE = /\b(commercial use|commercial license|personal use|editable|canva|fillable)\b/;

// Pazar özetinden (eski tohumlardan gelebilir) yanıltıcı teklifleri ve tema dışı ifadeleri çıkarır; liste dilbilgisi korunur.
const MANUAL_OFFER_EN = ["a commercial-use license option", "a short video tutorial", "an editable template version"];
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function cleanBriefNotes(notes: string | undefined, phrases: string[] = []): string | undefined {
  if (!notes) return notes;
  let value = notes;
  for (const phrase of [...MANUAL_OFFER_EN, ...phrases]) value = value.replace(new RegExp(`(?:,\\s*|\\s+and\\s+)?\\b${escapeRegex(phrase)}\\b`, "gi"), "");
  return value
    .replace(/\b(favor|add|offer|include|features?)\s*(?:,|and)\s*/gi, "$1 ")
    .replace(/\(\s*,\s*/g, "(").replace(/,\s*\)/g, ")").replace(/\(\s*\)/g, "")
    .replace(/\b(?:offer|include)\s+and (?:state|name) (?:them|it) (?:clearly )?on the cover[^;.]*[;.]?/gi, "")
    .replace(/\b(?:offer|include)\s*[;.]/gi, "")
    .replace(/\s+,/g, ",").replace(/,\s*,/g, ",").replace(/;\s*;/g, ";").replace(/;\s*\./g, ".").replace(/:\s*;/g, ":").replace(/\s{2,}/g, " ").trim();
}

const HOLIDAYS: ThemeFamily[] = ["christmas", "halloween", "thanksgiving", "easter", "valentine", "st_patricks", "patriotic", "hanukkah", "ramadan", "mothers_day", "fathers_day"];
const SEASONS: ThemeFamily[] = ["winter", "spring", "summer", "fall"];
// Etkinlikler: bridal shower oyununa bachelorette veya baby shower sayfası girmez.
const EVENTS: ThemeFamily[] = ["bridal", "bachelorette", "baby_shower", "birthday", "graduation"];
// Belirli bir zamana veya güçlü bir ruh hâline bağlı temalar: ürün o temada değilse etikete ve görsele giremez.
const SPECIFIC = new Set<ThemeFamily>([...HOLIDAYS, ...SEASONS, ...EVENTS, "witchy", "dark"]);
const SEASON_OF: Partial<Record<ThemeFamily, ThemeFamily[]>> = {
  christmas: ["winter"], hanukkah: ["winter"], valentine: ["winter", "spring"],
  halloween: ["fall"], thanksgiving: ["fall"],
  easter: ["spring"], st_patricks: ["spring"], mothers_day: ["spring"],
  patriotic: ["summer"], fathers_day: ["summer"]
};

const pairs = new Set<string>();
const clash = (a: ThemeFamily, b: ThemeFamily) => { pairs.add(`${a}|${b}`); pairs.add(`${b}|${a}`); };
for (const a of HOLIDAYS) for (const b of HOLIDAYS) if (a !== b) clash(a, b);
for (const a of SEASONS) for (const b of SEASONS) if (a !== b) clash(a, b);
for (const a of EVENTS) for (const b of EVENTS) if (a !== b) clash(a, b);
for (const holiday of HOLIDAYS) for (const season of SEASONS) if (!(SEASON_OF[holiday] || []).includes(season)) clash(holiday, season);
for (const mood of ["witchy", "dark"] as ThemeFamily[]) {
  for (const other of ["christmas", "easter", "valentine", "st_patricks", "patriotic", "hanukkah", "ramadan", "mothers_day", "fathers_day", "spring", "summer", "playful", "coastal"] as ThemeFamily[]) clash(mood, other);
}
for (const other of ["winter", "fall", "christmas", "halloween", "thanksgiving", "hanukkah"] as ThemeFamily[]) clash("coastal", other);

export function themeFamilies(text: string): Set<ThemeFamily> {
  const value = ` ${text.toLowerCase().replace(/[^a-z0-9'\s.]/g, " ")} `;
  return new Set(TERMS.filter(([, pattern]) => pattern.test(value)).map(([family]) => family));
}

export function familiesConflict(a: Iterable<ThemeFamily>, b: Iterable<ThemeFamily>): boolean {
  const right = [...b];
  return [...a].some((left) => right.some((other) => pairs.has(`${left}|${other}`)));
}

export function isSpecificFamily(family: ThemeFamily): boolean {
  return SPECIFIC.has(family);
}

// Ürünün seçilmiş temasına uyan ifade: çatışan tema yok ve bayram/mevsim/cadı/dark gibi belirli bir tema varsa ürün de o temada.
export function fitsTheme(text: string, chosen: Set<ThemeFamily>): boolean {
  const families = themeFamilies(text);
  if (familiesConflict(families, chosen)) return false;
  // Bayramın mevsimi de o bayramın temasıdır (Noel ürününde "winter" uygundur).
  const allowed = new Set([...chosen, ...[...chosen].flatMap((family) => SEASON_OF[family] || [])]);
  return [...families].every((family) => allowed.has(family) || !SPECIFIC.has(family));
}

// Sıralı listeden (en güçlü önce) birbiriyle çatışmayan ifadeleri tutar; ilk ifade temayı belirler.
export function harmonizeThemes<T extends string>(items: T[], seed: Set<ThemeFamily> = new Set()): { kept: T[]; dropped: T[]; families: Set<ThemeFamily> } {
  const families = new Set(seed);
  const kept: T[] = [];
  const dropped: T[] = [];
  for (const item of items) {
    const own = themeFamilies(item);
    if (familiesConflict(own, families)) {
      dropped.push(item);
      continue;
    }
    kept.push(item);
    own.forEach((family) => families.add(family));
  }
  return { kept, dropped, families };
}

const SEASON_IDS: Partial<Record<ThemeFamily, string>> = {
  christmas: "christmas", halloween: "halloween", thanksgiving: "thanksgiving", easter: "easter", valentine: "valentines",
  st_patricks: "st-patricks", patriotic: "july-4", hanukkah: "hanukkah", ramadan: "ramadan", mothers_day: "mothers-day", fathers_day: "fathers-day"
};

const DAY_MS = 24 * 60 * 60 * 1000;

export interface HolidayTiming { family: ThemeFamily; nameTr: string; daysUntil: number; date: string }

// Bayramın bir sonraki tarihi (bu yıl geçtiyse gelecek yıl).
export function holidayTiming(family: ThemeFamily, now = Date.now()): HolidayTiming | undefined {
  const season = US_SEASONS.find((item) => item.id === SEASON_IDS[family]);
  if (!season) return undefined;
  const today = new Date(now);
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  for (const year of [today.getUTCFullYear(), today.getUTCFullYear() + 1]) {
    const date = season.date(year);
    if (!date) continue;
    const daysUntil = Math.round((date.getTime() - start) / DAY_MS);
    if (daysUntil >= 0) return { family, nameTr: season.nameTr, daysUntil, date: date.toISOString().slice(0, 10) };
  }
  return undefined;
}

// Yeni ürün için bayram penceresi: çok yakınsa (dijital 14, desen 30 gün) ilan arama sonuçlarına oturmadan bayram geçer;
// 120 günden uzaksa alıcı henüz aramıyor.
export function holidayOutOfWindow(text: string, studio: "printable" | "pattern", now = Date.now()): HolidayTiming | undefined {
  const minDays = studio === "pattern" ? 30 : 14;
  for (const family of themeFamilies(text)) {
    const timing = holidayTiming(family, now);
    if (timing && (timing.daysUntil < minDays || timing.daysUntil > 120)) return timing;
  }
  return undefined;
}

// İngilizce düz yazıda özel adların büyük harfi (tırnak içindeki arama ifadeleri olduğu gibi kalır).
const PROPER_SOURCE: Array<[string, string, string?]> = [
  ["christmas", "Christmas"], ["xmas", "Xmas"], ["halloween", "Halloween"], ["easter", "Easter"], ["thanksgiving", "Thanksgiving"],
  ["friendsgiving", "Friendsgiving"], ["valentine'?s day", "Valentine's Day"], ["valentine('s)?", "Valentine$1"], ["galentine('s)?", "Galentine$1"], ["hanukkah", "Hanukkah"],
  ["ramadan", "Ramadan"], ["eid", "Eid"], ["mother'?s day", "Mother's Day"], ["father'?s day", "Father's Day"],
  ["st\\.? patrick'?s day", "St. Patrick's Day"], ["st\\.? patrick'?s", "St. Patrick's"], ["victorian", "Victorian"], ["scandinavian", "Scandinavian"],
  ["ipad", "iPad"], ["android", "Android"], ["goodnotes", "GoodNotes"], ["notability", "Notability"],
  ["etsy", "Etsy"], ["pinterest", "Pinterest"], ["instagram", "Instagram"], ["facebook", "Facebook"], ["canva", "Canva"],
  ["us letter", "US Letter", "i"], ["half letter", "Half Letter"], ["a([3-6])", "A$1"], ["adhd", "ADHD"], ["diy", "DIY"], ["pdf", "PDF"],
  ["us terms", "US terms", "i"], ["english", "English"], ["american", "American"], ["turkish", "Turkish"], ["islamic", "Islamic"],
  ["art deco", "Art Deco"], ["art nouveau", "Art Nouveau"]
];
// Dosya adı, adres ve kod parçalarına (planner.pdf, etsy.com, page-01) dokunmaz.
const PROPER: Array<[RegExp, string]> = PROPER_SOURCE.map(([core, replacement, flags]) => [new RegExp(`(?<![\\w./@-])${core}(?![\\w/@-]|\\.\\w)`, `g${flags || ""}`), replacement]);

export function proseCase(text: string): string {
  return text.split("\"").map((part, index) => index % 2 === 1 ? part : PROPER.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), part)).join("\"");
}
