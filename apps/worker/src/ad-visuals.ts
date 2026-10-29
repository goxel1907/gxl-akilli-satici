import type { PatternCraft, PrintableKind } from "./etsy-trends.js";
import { proseCase } from "./theme.js";

// Reklam tadında ürün görselleri: her görsel nerede kullanılacağı, oranı ve üstüne yazılacak kısa reklam metniyle gelir.
// Görsel modelleri yazıyı bozduğu için promptlar yazı alanını boş bırakır; metin Canva gibi bir araçla eklenir.
export interface AdVisual {
  slot: number;
  titleTr: string;
  useTr: string;
  // Tek paket İngilizce yazıldığı için başlık ve kullanım yeri İngilizce de tutulur.
  titleEn: string;
  useEn: string;
  aspect: string;
  overlay?: string;
  prompt: string;
}

export interface AdVisualInput {
  kind?: PrintableKind;
  craft?: PatternCraft;
  productType: string;
  name: string;
  colors?: string[];
  features?: string[];
  formats?: string[];
  pageCount?: number;
  seed?: string;
}

function hash(value: string): number {
  let result = 2166136261;
  for (const character of value) {
    result ^= character.codePointAt(0)!;
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

// Ürünün gerçekte kullanıldığı ortamlar; ürün adına göre en uygun olanlar seçilir.
function usageScenes(input: AdVisualInput): string[] {
  const product = input.productType.toLowerCase();
  if (input.craft) {
    if (/cardigan|sweater|top|dress|vest|shawl|hat|beanie|scarf|sock|slipper|cowl|pullover/.test(product)) return [
      `a woman wearing the finished ${product} on a sunny city sidewalk, cropped at the chin so no face is shown, natural candid pose`,
      `the finished ${product} worn with jeans in a cozy cafe by the window, cropped at the shoulders, warm morning light`,
      `the finished ${product} hanging on a wooden hanger against a linen wall next to a rattan basket of yarn`
    ];
    if (/bag|tote|purse|pouch/.test(product)) return [
      `the finished ${product} carried on the shoulder at a farmers market, flowers and baguette peeking out, cropped torso shot`,
      `the finished ${product} on a beach towel with sunglasses and a paperback, top-down summer light`,
      `the finished ${product} hanging from a café chair, latte on the table`
    ];
    if (/wall hanging|plant hanger|tapestry/.test(product)) return [
      `the finished ${product} displayed on a white wall above a linen sofa, plants nearby, soft daylight`,
      `the finished ${product} displayed on a bedroom wall above a rattan headboard, warm morning light`,
      `the finished ${product} displayed on an entryway wall beside a mirror and a small bench`
    ];
    if (/doily|coaster|placemat|runner|table|rug|pillow|blanket|throw|afghan|quilt/.test(product)) return [
      `the finished ${product} styled in a bright Scandinavian living room, coffee table vignette with a ceramic vase`,
      `the finished ${product} on a farmhouse dining table set for brunch, natural window light`,
      `the finished ${product} in a cozy reading nook with a candle and an open book`
    ];
    if (/amigurumi|toy|doll|bunny|bear|animal|octopus|dinosaur/.test(product)) return [
      `the finished ${product} held by a child's hands in a sunlit nursery, soft focus background`,
      `the finished ${product} on a white bookshelf beside picture books`,
      `the finished ${product} wrapped as a baby shower gift with tissue paper and a ribbon`
    ];
    return [`the finished ${product} used in a bright, styled home setting`, `the finished ${product} given as a handmade gift`, `the finished ${product} styled outdoors in soft natural light`];
  }
  switch (input.kind) {
    case "planner":
      if (/meal|grocery|recipe|food/.test(product)) return ["printed pages clipped to a fridge with a wooden magnet in a bright kitchen", "pages on a kitchen counter next to fresh vegetables and a pen, mid-planning", "a binder open on a breakfast table beside coffee and a grocery list"];
      if (/budget|finance|bill|savings|debt|money/.test(product)) return ["pages on a tidy home-office desk with a calculator, receipts and a gold pen", "hands filling in a savings tracker with a highlighter, laptop blurred behind", "a ring binder with colored tabs on a desk next to a coffee mug"];
      if (/clean|chore|house|home/.test(product)) return ["a printed schedule clipped to a laundry room wall above folded towels", "pages on a kitchen island with a spray bottle and fresh flowers", "a page in a clear sheet protector checked off with a dry-erase marker"];
      if (/wedding|bride|bridal/.test(product)) return ["pages on a bridal desk with a ring dish, eucalyptus and a fountain pen", "a planner binder beside fabric swatches and invitation samples", "hands writing a guest list with a champagne glass blurred behind"];
      if (/fitness|workout|gym|wellness|health/.test(product)) return ["pages on a yoga mat beside a water bottle and dumbbells", "a page clipped to a board at a home gym corner", "hands checking off a workout tracker next to sneakers"];
      return ["pages on a minimalist home-office desk with a coffee mug and a pen", "hands writing in the planner pages at a sunlit table", "a disc-bound planner open on a cozy bed with a blanket"];
    case "digital_planner":
      return ["a tablet on a marble desk showing the planner with a stylus beside it, no logos", "a hand with a stylus tapping a month tab on a tablet in a café, no logos", "a tablet on a cozy sofa arm with a cup of tea, planner page visible, no logos"];
    case "coloring":
      if (/kid|child|toddler/.test(product)) return ["a child's hands coloring a page with crayons at a kids' table", "colored pages taped to a playroom wall", "pages and crayons spread on a picnic blanket"];
      return ["a half-colored page with colored pencils on a wooden table and a cup of tea", "hands coloring with gel pens in a cozy evening setting with a candle", "a finished colored page framed on a shelf beside plants"];
    case "wall_art":
      return ["the prints in thin oak frames above a neutral sofa in a bright living room, showing real scale", "one print in a black frame in a bedroom above a linen-covered bed", "the framed prints as a small gallery wall in a hallway"];
    case "party":
      return ["printed game cards on a styled party table with pens, balloons and a cake", "guests' hands holding game cards and laughing, cropped, soft bokeh", "a printed sign on a small easel at a brunch party"];
    case "recipe":
      return ["recipe cards in a wooden recipe box on a kitchen counter with fresh ingredients", "a card propped against a jar while cooking, flour on the counter", "a recipe binder open on a farmhouse table"];
    case "journal":
      return ["journal pages on a cozy bed with a mug, a candle and a soft blanket", "hands writing in the journal at a sunlit window desk", "pages in a disc-bound journal beside a pressed-flower bookmark"];
    case "kids":
      return ["worksheets on a homeschool table with crayons and a child's hands", "activity pages on a classroom desk with pencils", "pages in a binder with a laminated sheet and dry-erase marker"];
    case "paper_craft":
      return ["a junk journal spread with the printed papers, washi tape and ephemera", "printed sheets fanned out on a craft table with scissors and twine", "papers used to wrap a small gift and make tags"];
    default:
      return ["the printed product used in a bright, styled home setting", "hands using the printed product at a desk", "the product shown on a tablet and printed side by side"];
  }
}

// Desen PDF'inin içeriği tekniğe göre yazılır: kanaviçede "US terms" yoktur, dikişte şema değil kalıp parçası vardır.
const PATTERN_INCLUDED: Record<PatternCraft, string> = {
  crochet: "STEP-BY-STEP PDF · CHARTS · US TERMS",
  knitting: "STEP-BY-STEP PDF · CHARTS · US TERMS",
  cross_stitch: "SYMBOL CHART · FLOSS KEY · PDF",
  embroidery: "FULL-SIZE TEMPLATE · STITCH GUIDE",
  sewing: "PATTERN PIECES · STEP-BY-STEP PDF",
  macrame: "KNOT DIAGRAMS · STEP-BY-STEP PDF",
  punch_needle: "FULL-SIZE TEMPLATE · STEP-BY-STEP PDF"
};

function variationVisual(input: AdVisualInput, base: string, subject: string, palette: string, space: string): Omit<AdVisual, "slot"> {
  const aspect = "4:3 yatay · 3000x2250 px";
  if (input.craft) return { titleTr: "Renk / varyasyon seçenekleri", useTr: "Etsy galerisi; alıcı kendi ipliğiyle farklı renk seçebileceğini görür", titleEn: "Color ideas", useEn: "Etsy gallery; shows that the maker can choose their own yarn colors", aspect, overlay: "MAKE IT IN ANY COLOR", prompt: `${base} Three finished versions of ${subject} side by side in three harmonious colorways based on ${palette}, identical design, studio background. ${space}` };
  if (input.kind === "planner" || input.kind === "journal" || input.kind === "recipe") return { titleTr: "Renkli ve siyah-beyaz sürüm", useTr: "Etsy galerisi; mürekkep dostu sürümün de olduğunu gösterir", titleEn: "Color and black-and-white versions", useEn: "Etsy gallery; shows the ink-friendly version is included", aspect, overlay: "COLOR + B&W VERSIONS", prompt: `${base} The same printed page from ${subject} twice side by side: the color version and the black-and-white version, identical layout, on a light desk. ${space}` };
  if (input.kind === "digital_planner") return { titleTr: "Açık ve koyu tema", useTr: "Etsy galerisi; iki temanın da dahil olduğunu gösterir", titleEn: "Light and dark theme", useEn: "Etsy gallery; shows both themes are included", aspect, overlay: "LIGHT + DARK THEME", prompt: `${base} Two tablets side by side showing the same page of ${subject} in the light theme and in the dark theme, on a clean desk. ${space}` };
  return { titleTr: "Daha fazla sayfa", useTr: "Etsy galerisi; setteki farklı sayfaları gösterir", titleEn: "More pages from the set", useEn: "Etsy gallery; shows more of the real pages in the set", aspect, overlay: "SEE MORE PAGES", prompt: `${base} A neat fan of 5-7 different real pages from ${subject} on a ${palette.split(",")[0]} backdrop, slightly overlapping, every page clearly different. ${space}` };
}

export function buildAdVisuals(input: AdVisualInput): AdVisual[] {
  const random = hash(`${input.seed || ""}|${input.name}|${input.productType}`);
  const scenes = usageScenes(input);
  const pickScene = (offset: number) => scenes[(random + offset) % scenes.length];
  const palette = input.colors?.length ? input.colors.join(", ") : "soft neutral tones";
  // Özellik görsel bir ayrıntı olarak yazılır ("highlighting cozy" değil, "with Cozy and Granny Square details").
  const highlight = input.features?.length ? ` with ${input.features.slice(0, 2).map(proseCase).join(" and ")} details visible` : "";
  const isPattern = Boolean(input.craft);
  // Ad zaten ürün adını içeriyorsa tekrar yazılmaz ("the "X Junk Journal Kit" junk journal kit" olmaz).
  const nameHasProduct = input.name.toLowerCase().endsWith(input.productType.toLowerCase());
  const subject = isPattern ? `the finished handmade ${input.productType} from the "${input.name}" pattern` : nameHasProduct ? `the "${input.name}"` : `the "${input.name}" ${input.productType}`;
  const reference = isPattern
    ? "Follow the Design spec from step 1 of this chat: write its colors, motif counts and proportions into the image prompt and show exactly those."
    : "Show the real pages made in this chat: paste the page images into the scene with code (keep them flat and undistorted), or use them as the only reference images. Never use another seller's images as a reference.";
  const base = `Commercial product photography for an Etsy shop ad, color palette ${palette}, soft natural daylight, shallow depth of field, realistic textures, magazine-quality styling. ${reference} Do not add any new text, letters, logos or watermarks (text that is part of the real pages may show). Make the image at the image tool's closest native size, then crop and resize it in code to the size given.`;
  const space = "Keep the product in the lower two thirds and leave the top third clean for a headline that will be added later.";
  // Başlık yazısı için kısa format adları: "12x12 in sheets" → "12X12", "2:3 ratio (4x6 to 24x36 in)" → "2:3".
  const formats = input.formats?.length ? [...new Set(input.formats.map((format) => format.replace(/\s*\(.*\)/, "").replace(/\s+in\s+(sheets|cards)$/i, "").replace(/\s+ratio$/i, "").replace(/\s+binder pages$/i, "").trim().toUpperCase()))].slice(0, 3).join(" + ") : "";
  const pages = input.pageCount ? input.kind === "wall_art" ? `${input.pageCount} ${input.pageCount > 1 ? "PRINTS" : "PRINT"}` : `${input.pageCount} PAGES` : "";
  const shortName = input.productType.toUpperCase();
  // Sahne listesi 5'ten kısaysa reklam görseli kullanım sahnesini tekrar etmesin diye ayrı bir kompozisyon alır.
  const adScene = scenes.length >= 5 ? pickScene(4) : isPattern
    ? `the finished ${input.productType} on a solid backdrop in one palette color, shot top-down`
    : "a top-down flat lay of the pages on a solid backdrop in one palette color";

  const visuals: Array<Omit<AdVisual, "slot">> = [
    { titleTr: "Kapak (ana görsel)", useTr: "Etsy arama sonuçlarındaki küçük görsel; tıklanma oranını belirler", titleEn: "Cover (main image)", useEn: "Etsy search thumbnail; it decides the click-through rate", aspect: "4:3 yatay · 3000x2250 px", overlay: [shortName, pages].filter(Boolean).join(" · "), prompt: `${base} Hero shot: ${subject}${highlight}, ${pickScene(0)}. The product fills about 60% of the frame and is instantly recognizable at thumbnail size. ${space}` },
    { titleTr: "Kullanım sahnesi", useTr: "Etsy galerisi 2. görsel; alıcının ürünü kendi hayatında hayal etmesi için", titleEn: "Lifestyle scene", useEn: "Etsy gallery image 2; helps buyers picture the product in their own life", aspect: "4:3 yatay · 3000x2250 px", prompt: `${base} Lifestyle scene: ${subject}, ${pickScene(1)}. Candid, aspirational, uncluttered.` },
    { titleTr: "Yakın çekim kalite detayı", useTr: "Etsy galerisi; baskı/ilmek kalitesini gösterir", titleEn: "Close-up quality detail", useEn: isPattern ? "Etsy gallery; shows stitch quality" : "Etsy gallery; shows print quality", aspect: "4:3 yatay · 3000x2250 px", prompt: `${base} Macro close-up of ${isPattern ? "the stitch texture of one repeat" : "one page corner showing crisp lines and layout"}, ${subject}, razor-sharp focus, gentle side light.` },
    { titleTr: isPattern ? "PDF içeriği" : "Neler var? (içerik kolajı)", useTr: "Etsy galerisi; alıcının ne aldığını tek bakışta görmesi için", titleEn: isPattern ? "What is in the PDF" : "What's included (content collage)", useEn: "Etsy gallery; shows at a glance what the buyer gets", aspect: "4:3 yatay · 3000x2250 px", overlay: isPattern ? PATTERN_INCLUDED[input.craft!] : `WHAT'S INCLUDED${pages ? ` · ${pages}` : ""}`, prompt: `${base} Flat lay grid of ${isPattern ? "printed pattern pages and a tablet showing the PDF, next to the finished piece and materials" : input.kind === "wall_art" ? `all ${input.pageCount || 3} prints of the set side by side` : input.kind === "digital_planner" ? "6-9 different planner pages shown on tablet screens" : "6-9 different printed pages from the product arranged neatly"} on a light linen surface, top-down, even spacing. ${space}` },
    { titleTr: "Ölçü / format kartı", useTr: "Etsy galerisi; yanlış ölçü iadelerini önler", titleEn: isPattern ? "Size card" : "Size / format card", useEn: "Etsy gallery; prevents wrong-size returns", aspect: "4:3 yatay · 3000x2250 px", overlay: formats || (isPattern ? "FINISHED SIZE" : "PRINT SIZES"), prompt: `${base} ${isPattern ? `${subject} next to a measuring tape and a ruler for scale` : input.kind === "wall_art" ? "Empty frames in several standard sizes leaning against a wall, the prints placed inside them, showing relative size" : input.kind === "digital_planner" ? "The planner shown on a large and a small tablet side by side, landscape and portrait" : "Stacked printed sheets in each included size (largest at back) on a desk, edges aligned, showing relative size"}, clean minimal composition. ${space}` },
    { titleTr: "İkinci kullanım sahnesi", useTr: "Etsy galerisi; farklı bir ortamda kullanım", titleEn: "Second lifestyle scene", useEn: "Etsy gallery; the product in a different setting", aspect: "4:3 yatay · 3000x2250 px", prompt: `${base} Second lifestyle scene: ${subject}, ${pickScene(2)}. A different setting and angle from the first lifestyle image.` },
    // Görseller yalnız ürünün gerçekten içerdiği sürümleri gösterir: PDF'te olmayan renk seçeneği alıcıyı yanıltır.
    variationVisual(input, base, subject, palette, space),
    { titleTr: "Nasıl çalışır (3 adım)", useTr: "Etsy galerisi son görsellerden; dijital ürün olduğunu netleştirir, yanlış anlaşılmayı önler", titleEn: "How it works (3 steps)", useEn: "One of the last Etsy gallery images; makes clear it is a digital product", aspect: "4:3 yatay · 3000x2250 px", overlay: isPattern ? "1 DOWNLOAD · 2 PRINT OR VIEW · 3 MAKE" : input.kind === "digital_planner" ? "1 DOWNLOAD · 2 IMPORT · 3 PLAN" : input.kind === "wall_art" ? "1 DOWNLOAD · 2 PRINT · 3 FRAME" : "1 DOWNLOAD · 2 PRINT · 3 ENJOY", prompt: `${base} Three-panel layout: a laptop showing a download, ${input.kind === "digital_planner" ? "the planner opening in a note-taking app on a tablet, then a hand writing on it with a stylus" : input.kind === "wall_art" ? "a print shop or home printer printing a print, then the framed print on a wall" : `a home printer printing ${isPattern ? "pattern pages" : "the pages"}, then ${isPattern ? "hands making the item" : "the pages in use"}`}. Simple, bright, consistent props, no logos.` },
    { titleTr: "Pinterest pini", useTr: "Pinterest; dijital PDF ürünlerinde en büyük dış trafik kaynağı", titleEn: "Pinterest pin", useEn: "Pinterest; the largest outside traffic source for digital PDF products", aspect: "2:3 dikey · 1000x1500 px", overlay: `${input.productType.toUpperCase()}${input.features?.[0] ? ` · ${input.features[0].toUpperCase()}` : ""}`, prompt: `${base} Vertical pin composition: ${subject}${highlight}, ${pickScene(3)}, styled from slightly above. Leave a clean band across the top 30% for a bold headline.` },
    { titleTr: "Instagram / Facebook reklamı", useTr: "Instagram akışı, hikâye ve Facebook reklamı; ilk saniyede dikkat çeker", titleEn: "Instagram / Facebook ad", useEn: "Instagram feed, story and Facebook ad; must stop the scroll in the first second", aspect: "1:1 kare · 1080x1080 px", overlay: isPattern ? "PDF PATTERN · INSTANT DOWNLOAD" : "INSTANT DOWNLOAD", prompt: `${base} Bold, scroll-stopping ad image: ${subject} as the hero, ${adScene}, vivid but on-palette accent prop, strong contrast. ${space} In the next reply, make the same scene as a 9:16 story image (1080x1920 px).` }
  ];
  return visuals.map((visual, index) => ({ slot: index + 1, ...visual }));
}
