// Rakiplerden ayrışan renk: aynı aramadaki ilanların başlık ve etiketlerinde en sık geçen renkler "kalabalık" sayılır.
// Kapak zemini bu renklerden ton olarak uzak, doygun ve temaya uyan bir renkle yapılır; böylece arama sonucunda
// bizim küçük görselimiz rakiplerin bej, krem, adaçayı yeşili denizinde ayrı durur. Ürünün kendi paleti değişmez.

interface NamedColor { name: string; hue?: number; hex?: string; muted?: boolean }

// Algılanan renkler (başlık ve etiketlerde). Çok kelimeli adlar önce denenir.
const SEEN: NamedColor[] = [
  { name: "sage green", hue: 100, muted: true }, { name: "dusty rose", hue: 345, muted: true }, { name: "dusty blue", hue: 210, muted: true },
  { name: "baby pink", hue: 345, muted: true }, { name: "baby blue", hue: 205, muted: true }, { name: "hot pink", hue: 330 },
  { name: "forest green", hue: 130 }, { name: "olive green", hue: 75, muted: true }, { name: "mint green", hue: 150, muted: true },
  { name: "navy blue", hue: 225 }, { name: "burnt orange", hue: 25 }, { name: "mustard yellow", hue: 48 }, { name: "earth tone", muted: true },
  { name: "sage", hue: 100, muted: true }, { name: "olive", hue: 75, muted: true }, { name: "emerald", hue: 145 }, { name: "mint", hue: 150, muted: true },
  { name: "green", hue: 120 }, { name: "teal", hue: 180 }, { name: "turquoise", hue: 175 }, { name: "navy", hue: 225 }, { name: "cobalt", hue: 220 },
  { name: "blue", hue: 220 }, { name: "lavender", hue: 270, muted: true }, { name: "lilac", hue: 280, muted: true }, { name: "purple", hue: 285 },
  { name: "plum", hue: 300 }, { name: "blush", hue: 350, muted: true }, { name: "pink", hue: 340 }, { name: "burgundy", hue: 345 },
  { name: "red", hue: 0 }, { name: "coral", hue: 12 }, { name: "terracotta", hue: 15, muted: true }, { name: "rust", hue: 20, muted: true },
  { name: "orange", hue: 30 }, { name: "peach", hue: 28, muted: true }, { name: "mustard", hue: 48 }, { name: "yellow", hue: 55 },
  { name: "gold", hue: 45 }, { name: "pastel", muted: true }, { name: "neutral", muted: true }, { name: "beige", muted: true },
  { name: "cream", muted: true }, { name: "ivory", muted: true }, { name: "oatmeal", muted: true }, { name: "tan", muted: true },
  { name: "black" }, { name: "white", muted: true }, { name: "gray", muted: true }
];

// Kapak zemini adayları: doygun, küçük görselde de ayrışan renkler (hex, yapay zekâya kesin renk vermek için).
const BOLD: Array<Required<Pick<NamedColor, "name" | "hue" | "hex">>> = [
  { name: "cobalt blue", hue: 220, hex: "#1F4FD8" }, { name: "emerald green", hue: 150, hex: "#0E8A5F" },
  { name: "hot pink", hue: 330, hex: "#E5307A" }, { name: "cherry red", hue: 355, hex: "#C8102E" },
  { name: "deep teal", hue: 182, hex: "#0B7A7D" }, { name: "burnt orange", hue: 24, hex: "#D2561A" },
  { name: "marigold", hue: 42, hex: "#F2A007" }, { name: "royal purple", hue: 272, hex: "#5B2BB5" },
  { name: "deep navy", hue: 225, hex: "#14234A" }, { name: "coral", hue: 10, hex: "#FF5F4A" },
  { name: "forest green", hue: 135, hex: "#1E5B39" }, { name: "plum", hue: 305, hex: "#6E2463" },
  { name: "burgundy", hue: 345, hex: "#7A1934" }
];

// Temaya göre öncelik: Noel kapağı sıcak pembe değil, önce kırmızı/zümrüt/lacivert dener.
const THEME_ORDER: Array<[RegExp, string[]]> = [
  [/christmas|holiday|xmas|santa|winter|snow/, ["cherry red", "emerald green", "deep navy", "forest green", "burgundy", "cobalt blue", "deep teal"]],
  [/halloween|spooky|ghost|pumpkin|witch/, ["burnt orange", "royal purple", "plum", "deep teal", "emerald green"]],
  [/fall|autumn|thanksgiving|harvest/, ["burnt orange", "burgundy", "deep teal", "marigold", "forest green", "plum"]],
  [/valentine|love|heart|romantic|galentine/, ["cherry red", "hot pink", "burgundy", "coral", "royal purple"]],
  [/easter|spring|bunny|baby shower|nursery/, ["coral", "deep teal", "cobalt blue", "marigold", "emerald green"]],
  [/summer|beach|coastal|ocean|pool|tropical/, ["cobalt blue", "coral", "deep teal", "marigold", "hot pink"]],
  [/wedding|bridal|bride|engagement/, ["emerald green", "deep navy", "burgundy", "deep teal", "plum"]],
  [/birthday|party|kids|game|bingo|trivia/, ["cobalt blue", "hot pink", "marigold", "coral", "royal purple", "emerald green"]],
  [/teacher|classroom|school|homeschool|kindergarten|preschool/, ["cobalt blue", "marigold", "coral", "emerald green", "deep teal"]],
  [/budget|finance|business|resume|planner|tracker/, ["deep navy", "emerald green", "cobalt blue", "deep teal", "burgundy"]],
  [/boho|botanical|floral|garden|cottage|mushroom/, ["deep teal", "burnt orange", "emerald green", "plum", "marigold"]]
];

const hueDistance = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export interface ColorPlan {
  // Rakiplerin en az %12'sinde görülen renk ve renk tarzları (en sık önce).
  crowded: string[];
  coverColor: string;
  coverHex: string;
  noteTr: string;
}

// Rakip başlık/etiketlerinden renk payları. Her ilan bir renk için bir kez sayılır.
export function colorShares(texts: string[]): Array<{ name: string; share: number }> {
  if (!texts.length) return [];
  const counts = new Map<string, number>();
  for (const raw of texts) {
    let text = ` ${raw.toLowerCase().replace(/grey/g, "gray").replace(/[^a-z\s-]/g, " ")} `;
    const found = new Set<string>();
    for (const color of SEEN) {
      const pattern = new RegExp(`\\b${escape(color.name)}s?\\b`, "g");
      if (pattern.test(text)) { found.add(color.name); text = text.replace(pattern, " "); }
    }
    for (const name of found) counts.set(name, (counts.get(name) || 0) + 1);
  }
  return [...counts.entries()].map(([name, count]) => ({ name, share: count / texts.length })).sort((a, b) => b.share - a.share);
}

export function planCoverColor(options: { competitorTexts?: string[]; theme?: string; palette?: string[]; avoid?: string[]; covers?: Array<{ hue: number; saturation: number; brightness: number }> }): ColorPlan {
  const shares = colorShares(options.competitorTexts || []);
  const crowded = [...new Set([...shares.filter((item) => item.share >= 0.12).map((item) => item.name), ...(options.avoid || []).map((item) => item.toLowerCase())])].slice(0, 5);
  const lookup = (name: string) => SEEN.find((color) => color.name === name) || BOLD.find((color) => color.name === name);
  // Gerçek kapak ölçümü (Etsy görsel tonu): ilk sayfa kapaklarının en az %15'inde görülen canlı ton aralığı da kalabalıktır.
  const covers = options.covers || [];
  const vivid = covers.filter((item) => item.saturation >= 28 && item.brightness >= 12 && item.brightness <= 92);
  const coverHues = Array.from({ length: 12 }, (_, bucket) => bucket * 30 + 15).filter((center) => vivid.filter((item) => hueDistance(item.hue, center) <= 15).length >= Math.max(2, covers.length * 0.15));
  const mutedShare = covers.length ? 1 - vivid.length / covers.length : 0;
  const crowdedHues = [...crowded.map((name) => lookup(name)?.hue).filter((hue): hue is number => hue !== undefined), ...coverHues];
  const theme = (options.theme || "").toLowerCase();
  const order = THEME_ORDER.find(([pattern]) => pattern.test(theme))?.[1] || [];
  // Ürün paletinde zaten doygun bir renk varsa ve rakiplerde kalabalık değilse önce o denenir (galeri tutarlı kalır).
  const paletteBold = (options.palette || []).map((name) => BOLD.find((color) => color.name === name.toLowerCase() || color.name.endsWith(` ${name.toLowerCase()}`) || name.toLowerCase().endsWith(color.name))).filter(Boolean) as typeof BOLD;
  const ranked = [...paletteBold, ...order.map((name) => BOLD.find((color) => color.name === name)!), ...BOLD]
    .filter((color, index, list) => list.findIndex((other) => other.name === color.name) === index);
  const distance = (color: typeof BOLD[number]) => crowdedHues.length ? Math.min(...crowdedHues.map((hue) => hueDistance(hue, color.hue))) : 180;
  const pick = ranked.find((color) => distance(color) >= 60 && !crowded.some((name) => color.name.includes(name) || name.includes(color.name)))
    || [...ranked].sort((a, b) => distance(b) - distance(a))[0];
  const coverNote = covers.length >= 5 ? ` İlk sayfadaki ${covers.length} rakip kapağın %${Math.round(mutedShare * 100)}'i soluk/nötr.` : "";
  const noteTr = (crowded.length || coverHues.length)
    ? `Rakiplerde en sık görülen renkler: ${crowded.join(", ") || "kapaklarda ölçülen tonlar"}. Kapak zemini bunlardan ayrışan ${pick.name} (${pick.hex}).${coverNote}`
    : `Rakip renk verisi yok; kapak zemini temaya uyan doygun ${pick.name} (${pick.hex}).${coverNote}`;
  return { crowded, coverColor: pick.name, coverHex: pick.hex, noteTr };
}
