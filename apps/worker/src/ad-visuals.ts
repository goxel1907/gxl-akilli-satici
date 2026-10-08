import type { PatternCraft, PrintableKind } from "./etsy-trends.js";

// Reklam tadında ürün görselleri: her görsel nerede kullanılacağı, oranı ve üstüne yazılacak kısa reklam metniyle gelir.
// Görsel modelleri yazıyı bozduğu için promptlar yazı alanını boş bırakır; metin Canva gibi bir araçla eklenir.
export interface AdVisual {
  slot: number;
  titleTr: string;
  useTr: string;
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
    if (/doily|coaster|placemat|runner|table|rug|pillow|blanket|throw|afghan|quilt|wall hanging/.test(product)) return [
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
      return ["an iPad on a marble desk showing the planner with an Apple Pencil beside it", "a hand with a stylus tapping a month tab on a tablet in a café", "a tablet on a cozy sofa arm with a cup of tea, planner page visible"];
    case "coloring":
      if (/kid|child|toddler/.test(product)) return ["a child's hands coloring a page with crayons at a kids' table", "colored pages taped to a playroom wall", "pages and crayons spread on a picnic blanket"];
      return ["a half-colored page with colored pencils on a wooden table and a cup of tea", "hands coloring with gel pens in a cozy evening setting with a candle", "a finished colored page framed on a shelf beside plants"];
    case "wall_art":
      return ["the print in a thin oak frame above a neutral sofa in a bright living room, showing real scale", "the print in a black frame in a bedroom above a linen-covered bed", "a gallery wall of three framed prints in a hallway"];
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

export function buildAdVisuals(input: AdVisualInput): AdVisual[] {
  const random = hash(`${input.seed || ""}|${input.name}|${input.productType}`);
  const scenes = usageScenes(input);
  const pickScene = (offset: number) => scenes[(random + offset) % scenes.length];
  const palette = input.colors?.length ? input.colors.join(", ") : "soft neutral tones";
  const highlight = input.features?.length ? `, highlighting ${input.features.slice(0, 2).join(" and ")}` : "";
  const isPattern = Boolean(input.craft);
  const subject = isPattern ? `the finished handmade ${input.productType} from the "${input.name}" pattern` : `the "${input.name}" ${input.productType}`;
  const reference = isPattern
    ? "Match the Design spec JSON from the finished pattern exactly (motif counts, colors, proportions)."
    : "Upload 2-3 page images from your finished PDF as reference images; the pages shown must be exactly these pages, flat and undistorted, layout clearly visible.";
  const base = `Commercial product photography for an Etsy shop ad, color palette ${palette}, soft natural daylight, shallow depth of field, realistic textures, magazine-quality styling. ${reference} Do not render any text, letters, logos or watermarks.`;
  const space = "Leave clean empty space in the top third for a headline that will be added later.";
  const formats = input.formats?.length ? input.formats.slice(0, 3).join(" + ") : "";
  const pages = input.pageCount ? `${input.pageCount} PAGES` : "";
  const shortName = input.productType.toUpperCase();

  const visuals: Array<Omit<AdVisual, "slot">> = [
    { titleTr: "Kapak (ana görsel)", useTr: "Etsy arama sonuçlarındaki küçük görsel; tıklanma oranını belirler", aspect: "4:3 yatay · 3000x2250 px", overlay: [shortName, pages].filter(Boolean).join(" · "), prompt: `${base} Hero shot: ${subject}${highlight}, centered, ${pickScene(0)}. The product fills about 60% of the frame and is instantly recognisable at thumbnail size. ${space}` },
    { titleTr: "Kullanım sahnesi", useTr: "Etsy galerisi 2. görsel; alıcının ürünü kendi hayatında hayal etmesi için", aspect: "4:3 yatay · 3000x2250 px", prompt: `${base} Lifestyle scene: ${subject}, ${pickScene(1)}. Candid, aspirational, uncluttered.` },
    { titleTr: "Yakın çekim kalite detayı", useTr: "Etsy galerisi; baskı/ilmek kalitesini gösterir", aspect: "4:3 yatay · 3000x2250 px", prompt: `${base} Macro close-up of ${isPattern ? "the stitch texture of one repeat" : "one page corner showing crisp lines and layout"}, ${subject}, razor-sharp focus, gentle side light.` },
    { titleTr: isPattern ? "PDF içeriği" : "Neler var? (içerik kolajı)", useTr: "Etsy galerisi; alıcının ne aldığını tek bakışta görmesi için", aspect: "4:3 yatay · 3000x2250 px", overlay: isPattern ? "STEP-BY-STEP PDF · CHARTS · US TERMS" : `WHAT'S INCLUDED${pages ? ` · ${pages}` : ""}`, prompt: `${base} Flat lay grid of ${isPattern ? "printed pattern pages and a tablet showing the PDF, next to the finished piece and materials" : "6-9 printed pages from the product arranged neatly"} on a light linen surface, top-down, even spacing. ${space}` },
    { titleTr: "Ölçü / format kartı", useTr: "Etsy galerisi; yanlış ölçü iadelerini önler", aspect: "4:3 yatay · 3000x2250 px", overlay: formats || (isPattern ? "FINISHED SIZE" : "PRINT SIZES"), prompt: `${base} ${isPattern ? `${subject} next to a measuring tape and a ruler for scale` : "Stacked printed sheets in different sizes (largest at back) on a desk, edges aligned, showing relative size"}, clean minimal composition. ${space}` },
    { titleTr: "İkinci kullanım sahnesi", useTr: "Etsy galerisi; farklı bir ortamda kullanım", aspect: "4:3 yatay · 3000x2250 px", prompt: `${base} Second lifestyle scene: ${subject}, ${pickScene(2)}. Different room and angle from the first lifestyle image.` },
    { titleTr: "Renk / varyasyon seçenekleri", useTr: "Etsy galerisi; farklı zevklere hitap eder", aspect: "4:3 yatay · 3000x2250 px", overlay: "COLOR OPTIONS", prompt: `${base} Three versions of ${subject} side by side in three harmonious colorways based on ${palette}, identical layout, studio background. ${space}` },
    { titleTr: "Nasıl çalışır (3 adım)", useTr: "Etsy galerisi son görsellerden; dijital ürün olduğunu netleştirir, yanlış anlaşılmayı önler", aspect: "4:3 yatay · 3000x2250 px", overlay: isPattern ? "1 DOWNLOAD · 2 PRINT OR VIEW · 3 MAKE" : "1 DOWNLOAD · 2 PRINT · 3 ENJOY", prompt: `${base} Three-panel layout: a laptop showing a download, a home printer printing ${isPattern ? "pattern pages" : "the pages"}, then ${isPattern ? "hands making the item" : "the pages in use"}. Simple, bright, consistent props.` },
    { titleTr: "Pinterest pini", useTr: "Pinterest; dijital PDF ürünlerinde en büyük dış trafik kaynağı", aspect: "2:3 dikey · 1000x1500 px", overlay: `${input.productType.toUpperCase()}${input.features?.[0] ? ` · ${input.features[0].toUpperCase()}` : ""}`, prompt: `${base} Vertical pin composition: ${subject}${highlight}, ${pickScene(3)}, styled from slightly above. Leave a clean band across the top 30% for a bold headline.` },
    { titleTr: "Instagram / Facebook reklamı", useTr: "Instagram akışı, hikâye ve Facebook reklamı; ilk saniyede dikkat çeker", aspect: "1:1 kare · 1080x1080 px (hikâye için 9:16 · 1080x1920)", overlay: "INSTANT DOWNLOAD", prompt: `${base} Bold, scroll-stopping ad image: ${subject} as the hero, ${pickScene(4)}, vivid but on-palette accent prop, strong contrast. ${space}` }
  ];
  return visuals.map((visual, index) => ({ slot: index + 1, ...visual }));
}
