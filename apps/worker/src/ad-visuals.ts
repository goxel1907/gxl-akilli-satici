import type { PatternCraft, PrintableKind } from "./etsy-trends.js";
import { proseCase, vintageStyle } from "./theme.js";

// Reklam tadında ürün görselleri: her görsel nerede kullanılacağı, oranı ve üstüne yazılacak kısa reklam metniyle gelir.
// Görsel modelleri yazıyı bozduğu için promptlar yazı alanını boş bırakır; başlık görsel bitince kodla (Pillow) eklenir.
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
  // Yalnız kâğıt paketi (süs kesimi yok): sahnelerde ephemera gösterilmez.
  papersOnly?: boolean;
}

const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const withArticle = (word: string) => `${/^[aeiou]/i.test(word) ? "an" : "a"} ${word}`;
// Görselde görünmeyen özellikler ("no-sew", "beginner", "PDF") görsel ayrıntısı olarak yazılmaz.
const NOT_VISUAL = /\b(pack|kit|bundle|no-sew|low-sew|reversible|easy|beginner|quick|fast|simple|pdf|pattern|tutorial|instant|printable|digital|download|size|sizes|inclusive|plus|xs|[2-6]?xl|top down|bottom up|seamless|one piece|step by step|video|undated|dated|daily|weekly|monthly|ipad|tablet|goodnotes|notability|kids|adult|adults|toddler|preschool|classroom|homeschool)\b/i;

// Desende kullanılan malzeme: kanaviçede iplik "floss", dikişte "fabric", makramede "cord".
const MATERIAL: Record<PatternCraft, string> = {
  crochet: "yarn",
  knitting: "yarn",
  cross_stitch: "floss",
  embroidery: "floss",
  sewing: "fabric",
  macrame: "cord",
  punch_needle: "yarn"
};

const CRAFT_DETAIL: Record<PatternCraft, string> = {
  crochet: "the crochet stitch texture of one repeat",
  knitting: "the knit stitch texture of one repeat",
  cross_stitch: "the cross stitches on the Aida fabric",
  embroidery: "the embroidery stitches and thread sheen",
  sewing: "the seams and topstitching",
  macrame: "the knots and cord texture",
  punch_needle: "the punched loops and their texture"
};

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
    if (/ornament/.test(product)) return [
      `the finished ${product} hanging on a Christmas tree branch with warm fairy lights, soft bokeh`,
      `a set of the finished ${product}s in a kraft gift box with tissue paper and twine`,
      `the finished ${product} hanging from a ribbon in a frosty window, morning light`
    ];
    if (/bookmark/.test(product)) return [
      `the finished ${product} tucked into an open hardcover book beside a cup of tea`,
      `the finished ${product} on a stack of books with a pressed flower, top-down`,
      `the finished ${product} wrapped as a small gift with a handwritten tag that has no visible words`
    ];
    if (/hoop|wall hanging|plant hanger|tapestry/.test(product)) return [
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
    case "calendar":
      return ["the printed calendar on a clipboard hanging on a kitchen wall", "a month page on a home-office desk next to a mug and a pen", "the calendar pages fanned out on a wooden table with a pencil, cozy light"];
    case "stickers":
      return ["printed sticker sheets beside an open planner with a few stickers placed on the page", "hands peeling a printed sticker from the sheet over a journal", "stickers arranged on a tablet planner page with a stylus, no logos"];
    case "cards":
      return ["a printed folded card standing on a table beside a kraft envelope and twine", "cards tucked into envelopes with a ribbon on a wooden table", "gift tags tied to wrapped presents"];
    case "puzzles":
      return ["a printed word search page on a clipboard with a pencil and reading glasses", "a puzzle page on a kitchen table with a cup of tea", "a stapled puzzle booklet on a sofa arm with a pencil"];
    case "wallpaper":
      return ["a phone lying on a linen bedspread showing the wallpaper on its lock screen, no logos", "a hand holding a phone with the wallpaper on screen in a cozy cafe, no logos", "a phone on a desk next to a plant, the wallpaper on screen, no logos"];
    case "app_icons":
      return ["a phone on a linen bedspread showing a home screen with the icons and widgets, no real brand logos", "a hand holding a phone with the new home screen in a cozy cafe, no real brand logos", "a phone on a desk next to matching decor, the icon set on screen, no real brand logos"];
    case "spreadsheet":
      return ["a laptop on a bright desk showing the spreadsheet with colorful charts, a coffee mug and a notebook, no logos", "a phone in a hand showing the spreadsheet in a spreadsheet app, no logos", "a cozy home office with the spreadsheet on a laptop screen and a calculator beside it, no logos"];
    case "slides":
      if (/class|classroom|teacher|student|review|lesson|school/.test(product)) return ["a classroom projector screen showing the colorful game board, students' raised hands cropped at the wrist, no logos", "a teacher's laptop on a desk showing a question slide, a stack of score sheets beside it, no logos", "a classroom smartboard showing an answer slide, a cheering group cropped at the shoulders, no logos"];
      return ["a big TV in a cozy living room showing the colorful game board, friends on a sofa cropped at the shoulders, no logos", "a laptop on a party table showing a question slide, snacks and score sheets around it, no logos", "a video call on a laptop with the game board shared on screen, a mug and a notebook beside it, no logos"];
    case "resume":
      return ["the printed one-page resume on a clean desk beside a laptop, a coffee mug and a pen, no logos", "a hand holding the printed resume and cover letter in a bright office lobby, cropped at the wrist", "the resume open on a laptop screen in a calm home office, no logos"];
    case "labels":
      return ["printed labels on glass pantry jars in a bright kitchen", "labels on storage bins on a tidy shelf", "a sheet of printed labels with scissors on a kitchen counter"];
    case "paper_craft":
      if (input.papersOnly) return ["a handmade journal spread made with the printed papers and washi tape", "printed papers fanned out on a craft table with scissors and twine", "the printed papers used to wrap a small gift"];
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

// 7. görsel yalnız dosyalarda gerçekten olan sürümü gösterir: siyah-beyaz dosya yoksa "COLOR + B&W" yazılmaz,
// 3 baskılık duvar sanatından 5-7 sayfa istenmez.
function variationVisual(input: AdVisualInput, base: string, subject: string, palette: string, space: string): Omit<AdVisual, "slot"> {
  const aspect = "4:3 yatay · 3000x2250 px";
  const backdrop = withArticle(palette.split(",")[0].trim());
  if (input.craft) return { titleTr: "Renk / varyasyon seçenekleri", useTr: "Etsy galerisi; alıcı kendi malzemesiyle farklı renk seçebileceğini görür", titleEn: "Color ideas", useEn: `Etsy gallery; shows that the maker can choose their own ${MATERIAL[input.craft]} colors`, aspect, overlay: "MAKE IT IN ANY COLOR", prompt: `${base} Three versions of ${subject} side by side in three harmonious colorways based on ${palette}, identical design, studio background. ${space}` };
  const blackWhite = (input.formats || []).some((format) => /black-and-white|b&w|printer-friendly/i.test(format));
  if (blackWhite) return { titleTr: "Renkli ve siyah-beyaz sürüm", useTr: "Etsy galerisi; mürekkep dostu sürümün de olduğunu gösterir", titleEn: "Color and black-and-white versions", useEn: "Etsy gallery; shows the ink-friendly version is included", aspect, overlay: "COLOR + B&W VERSIONS", prompt: `${base} The same printed page from ${subject} twice side by side: the color version and the black-and-white version, identical layout, on a light desk. ${space}` };
  if (input.kind === "digital_planner") return { titleTr: "Açık ve koyu tema", useTr: "Etsy galerisi; iki temanın da dahil olduğunu gösterir", titleEn: "Light and dark theme", useEn: "Etsy gallery; shows both themes are included", aspect, overlay: "LIGHT + DARK THEME", prompt: `${base} Two tablets side by side showing the same page of ${subject} in the light theme and in the dark theme, on a clean desk. ${space}` };
  if (input.kind === "app_icons") return { titleTr: "Ana ekran örneği", useTr: "Etsy galerisi; ikon ve widget'ların telefonda nasıl durduğunu gösterir", titleEn: "Home screen example", useEn: "Etsy gallery; shows how the icons and widgets look on a phone", aspect, overlay: "ICONS + WIDGETS", prompt: `${base} Two phones side by side showing two home screens set up with the icons and widgets from ${subject}, no real brand logos. ${space}` };
  if (input.kind === "slides") return { titleTr: "Soru ve cevap slaytları", useTr: "Etsy galerisi; tahtadan soruya, sorudan cevaba geçişi gösterir", titleEn: "Board, question and answer", useEn: "Etsy gallery; shows how a tile opens a question and then its answer", aspect, overlay: "CLICK · REVEAL · SCORE", prompt: `${base} Three screenshots from ${subject} side by side on ${backdrop} backdrop: the game board, a question slide and its answer slide, connected by soft arrows, no logos. ${space}` };
  if (input.kind === "resume") return { titleTr: "Setin tamamı", useTr: "Etsy galerisi; özgeçmiş, ön yazı ve referans sayfasını birlikte gösterir", titleEn: "The full set", useEn: "Etsy gallery; shows the resume, cover letter and references page together", aspect, overlay: "RESUME + COVER LETTER + REFERENCES", prompt: `${base} The one-page resume, the two-page resume, the cover letter and the references page from ${subject} laid side by side on ${backdrop} backdrop, slightly overlapping. ${space}` };
  if (input.kind === "spreadsheet") return { titleTr: "Tüm sekmeler", useTr: "Etsy galerisi; tablonun tüm sekmelerini gösterir", titleEn: "Every tab", useEn: "Etsy gallery; shows every tab in the workbook", aspect, overlay: "SEE EVERY TAB", prompt: `${base} A neat fan of screenshots of different tabs from ${subject} with sample numbers on ${backdrop} backdrop, slightly overlapping. ${space}` };
  if (input.kind === "wallpaper") {
    const count = Math.min(input.pageCount || 3, 12);
    return { titleTr: "Duvar kâğıdı seti", useTr: "Etsy galerisi; setteki tüm duvar kâğıtlarını telefonda gösterir", titleEn: "The full wallpaper set", useEn: "Etsy gallery; shows every wallpaper in the set on a phone", aspect, overlay: `SET OF ${count} WALLPAPERS`, prompt: `${base} ${count} phones side by side, each showing a different wallpaper from ${subject} on its lock screen, no logos. ${space}` };
  }
  if (input.kind === "wall_art") {
    const prints = input.pageCount || 1;
    if (prints > 1) return { titleTr: "Galeri duvarı seti", useTr: "Etsy galerisi; setteki baskıların birlikte nasıl durduğunu gösterir", titleEn: "Gallery wall set", useEn: "Etsy gallery; shows how the prints of the set look together", aspect, overlay: `SET OF ${prints} PRINTS`, prompt: `${base} All ${prints} prints of ${subject} framed side by side as a gallery wall above a console table, equal spacing, the real artwork in every frame. ${space}` };
    return { titleTr: "Farklı çerçevelerle", useTr: "Etsy galerisi; baskının standart çerçevelere uyduğunu gösterir", titleEn: "In different frames", useEn: "Etsy gallery; shows the print fits standard frames", aspect, overlay: "FITS STANDARD FRAMES", prompt: `${base} The same print from ${subject} three times side by side in a black, a white and an oak frame, leaning on a shelf. ${space}` };
  }
  const count = Math.max(2, Math.min(7, input.pageCount || 5));
  const range = count >= 5 ? `${Math.min(5, count)}-${count}` : `${count}`;
  return { titleTr: "Daha fazla sayfa", useTr: "Etsy galerisi; setteki farklı sayfaları gösterir", titleEn: "More pages from the set", useEn: "Etsy gallery; shows more of the real pages in the set", aspect, overlay: "SEE MORE PAGES", prompt: `${base} A neat fan of ${range} different real pages from ${subject} on ${backdrop} backdrop, slightly overlapping, every page clearly different. ${space}` };
}

export function buildAdVisuals(input: AdVisualInput): AdVisual[] {
  const random = hash(`${input.seed || ""}|${input.name}|${input.productType}`);
  const scenes = usageScenes(input);
  const pickScene = (offset: number) => scenes[(random + offset) % scenes.length];
  const palette = input.colors?.length ? input.colors.join(", ") : "soft neutral tones";
  // Özellik görsel bir ayrıntı olarak yazılır ("highlighting cozy" değil, "with Cozy and Granny Square details").
  // "Christmas and Christmas busy book" olmaz: başka bir özelliğin içinde geçen özellik ayrıca yazılmaz; "vintage" yeni üründe "vintage-style"dır.
  const allVisible = (input.features || []).map(vintageStyle).filter((feature) => !NOT_VISUAL.test(feature));
  const visible = allVisible.filter((feature, index) => !allVisible.some((other, otherIndex) => otherIndex !== index && other.length > feature.length && other.includes(feature)));
  const highlight = visible.length ? ` with ${visible.slice(0, 2).map(proseCase).join(" and ")} details visible` : "";
  const isPattern = Boolean(input.craft);
  // Ad zaten ürün adını içeriyorsa tekrar yazılmaz ("the "X Junk Journal Kit" junk journal kit" olmaz).
  const nameHasProduct = input.name.toLowerCase().replace(/-/g, " ").endsWith(input.productType.toLowerCase().replace(/-/g, " "));
  const subject = isPattern ? `the finished handmade ${input.productType} from the "${input.name}" pattern` : nameHasProduct ? `the "${input.name}"` : `the "${input.name}" ${input.productType}`;
  const reference = isPattern
    ? "Follow the Design spec from step 1 of this chat: write its colors and style into the image prompt and show the same finished design as the renders. Never use another seller's images as a reference."
    : "Show the real pages made in this chat: paste the page images into the scene with code (keep them flat and undistorted), or use them as the only reference images. Never use another seller's images as a reference.";
  const noText = isPattern ? "Do not add any text, letters, logos or watermarks." : "Do not add any new text, letters, logos or watermarks (text that is part of the real pages may show).";
  const base = `Commercial product photography for an Etsy shop ad, color palette ${palette}, soft natural daylight, shallow depth of field, realistic textures, magazine-quality styling. ${reference} ${noText} Make the image at the image tool's closest native size, then crop and resize it in code to the size given.`;
  const space = "Keep the product in the lower two thirds and leave the top third clean for the headline, which is added in code afterwards.";
  // Başlık yazısı için kısa format adları: "12x12 in sheets" → "12X12", "2:3 ratio (4x6 to 24x36 in)" → "2:3".
  const patternSizes = isPattern && input.formats?.[0] ? /\b(XXS|XS|S|M|L|XL|[2-6]XL)\s*(?:-|to)\s*(XXS|XS|S|M|L|XL|[2-6]XL)\b/i.exec(input.formats[0]) : null;
  const formats = patternSizes
    ? `SIZES ${patternSizes[1].toUpperCase()}-${patternSizes[2].toUpperCase()}`
    : input.formats?.length
      ? [...new Set(input.formats.filter((format) => !/black-and-white|printer-friendly/i.test(format)).map((format) => format.replace(/\s*\(.*\)/, "").replace(/\s+in\s+(sheets|cards)$/i, "").replace(/\s+ratio$/i, "").replace(/\s+binder pages$/i, "").trim().toUpperCase()))].slice(0, 4).join(" + ")
      : "";
  const pages = !input.pageCount ? ""
    : input.kind === "wall_art" ? `${input.pageCount} ${input.pageCount > 1 ? "PRINTS" : "PRINT"}`
    : input.kind === "wallpaper" ? `${Math.min(input.pageCount, 12)} ${input.pageCount > 1 ? "WALLPAPERS" : "WALLPAPER"}`
    : input.kind === "calendar" ? "12 MONTHS"
    : input.kind === "app_icons" ? `${Math.min(Math.max(input.pageCount, 16), 96)} ICONS + WIDGETS`
    : input.kind === "spreadsheet" ? `${input.pageCount} TABS`
    : input.kind === "slides" ? `${Math.min(50, Math.max(15, Math.round(input.pageCount / 5) * 5))} QUESTIONS`
    : input.kind === "resume" ? "4 TEMPLATES"
    : input.kind === "stickers" ? `${input.pageCount} STICKER SHEETS`
    : input.kind === "cards" ? `${Math.max(2, input.pageCount - 1)} CARDS + GIFT TAGS`
    : `${input.pageCount} PAGES`;
  const shortName = proseCase(input.productType).toUpperCase();
  const closeUp = isPattern
    ? CRAFT_DETAIL[input.craft!]
    : input.kind === "wall_art"
      ? "a corner of one print on matte fine-art paper, showing fine detail and paper texture"
      : input.kind === "paper_craft"
        ? "the pattern and paper texture of one printed paper"
        : input.kind === "coloring"
          ? "crisp black line art on one printed page, a colored pencil tip in view"
          : input.kind === "digital_planner"
            ? "a tablet screen showing crisp lines and tabs, a stylus tip in view"
            : input.kind === "wallpaper"
            ? "a phone screen showing the fine detail of the wallpaper, no logos"
            : input.kind === "app_icons"
            ? "a phone screen showing a few icons and a widget in sharp detail, no real brand logos"
            : input.kind === "spreadsheet"
            ? "a laptop screen showing crisp spreadsheet cells and a colorful chart, no logos"
            : input.kind === "slides"
            ? "a TV screen showing crisp board tiles and point values, no logos"
            : input.kind === "resume"
            ? "the crisp name heading and section layout at the top of the printed resume"
            : input.kind === "stickers"
            ? "a few printed stickers with their white cut borders on the sheet"
            : input.kind === "cards"
            ? "the paper texture and printed detail of one card front"
            : "one page corner showing crisp lines and layout";
  const included = Math.max(2, Math.min(9, input.pageCount || 9));
  // Etsy dijital üründe alıcının alacağı sayfaların gerçek önizlemesini ister: bu görsel görsel aracıyla değil,
  // bitmiş PDF'in sayfalarından kodla yapılır ve sayfalar hiç değiştirilmez.
  const previewCount = included >= 6 ? `6-${included}` : `${included}`;
  const previewPrompt = `Make this image in code, not with an image tool: render ${input.kind === "spreadsheet" ? "4-6 main tabs of the workbook as clean screenshots with sample numbers" : input.kind === "slides" ? "the title slide, the game board, two question slides and their answer slides as clean screenshots" : input.kind === "resume" ? "the one-page resume, the two-page resume, the cover letter and the references page at full quality" : input.kind === "app_icons" ? "the full icon set in a neat grid with the widgets and wallpapers beside it" : input.kind === "wall_art" ? `all ${input.pageCount || 3} prints` : input.kind === "wallpaper" ? `all ${Math.min(input.pageCount || 3, 12)} wallpapers side by side` : `${previewCount} different real pages`} from the final files at full quality and place them in a neat grid on a plain light background in one palette color, even spacing, a soft drop shadow, no props, and no changes to the pages themselves. Do not add any new text, letters, logos or watermarks; use only the pages made in this chat. Never use another seller's images. This is the unedited preview of what the buyer receives, which Etsy requires for digital items; upload it as the second listing image. Leave the top band clean for the headline.`;
  const includedRange = included >= 6 ? `6-${included}` : `${included}`;
  // Sahne listesi 5'ten kısaysa reklam görseli kullanım sahnesini tekrar etmesin diye ayrı bir kompozisyon alır.
  const adScene = scenes.length >= 5 ? pickScene(4) : isPattern
    ? `the finished ${input.productType} on a solid backdrop in one palette color, shot top-down`
    : "a top-down flat lay of the pages on a solid backdrop in one palette color";

  const visuals: Array<Omit<AdVisual, "slot">> = [
    { titleTr: "Kapak (ana görsel)", useTr: "Etsy arama sonuçlarındaki küçük görsel; tıklanma oranını belirler", titleEn: "Cover (main image)", useEn: "Etsy search thumbnail; it decides the click-through rate", aspect: "4:3 yatay · 3000x2250 px", overlay: /PAGES$/.test(shortName) && input.pageCount ? `${input.pageCount} ${shortName}` : input.kind === "resume" ? `${shortName} · EDITABLE DOCX` : [shortName, pages].filter(Boolean).join(" · "), prompt: `${base} Hero shot: ${subject}${highlight}, ${pickScene(0)}. The product fills about 60% of the frame and is instantly recognizable at thumbnail size. ${space}` },
    { titleTr: "Kullanım sahnesi", useTr: "Etsy galerisi 2. görsel; alıcının ürünü kendi hayatında hayal etmesi için", titleEn: "Lifestyle scene", useEn: "Etsy gallery image 2; helps buyers picture the product in their own life", aspect: "4:3 yatay · 3000x2250 px", prompt: `${base} Lifestyle scene: ${subject}, ${pickScene(1)}. Candid, aspirational, uncluttered.` },
    { titleTr: "Yakın çekim kalite detayı", useTr: "Etsy galerisi; baskı/ilmek kalitesini gösterir", titleEn: "Close-up quality detail", useEn: isPattern ? "Etsy gallery; shows the finished detail" : input.kind === "digital_planner" || input.kind === "slides" ? "Etsy gallery; shows the crisp detail on screen" : input.kind === "resume" ? "Etsy gallery; shows the clean layout" : "Etsy gallery; shows print quality", aspect: "4:3 yatay · 3000x2250 px", prompt: `${base} Macro close-up of ${closeUp}, ${subject}, razor-sharp focus, gentle side light.` },
    { titleTr: isPattern ? "PDF içeriği" : "Neler var? (içerik kolajı)", useTr: "Etsy galerisi; alıcının ne aldığını tek bakışta görmesi için", titleEn: isPattern ? "What is in the PDF" : "What's included (content collage)", useEn: "Etsy gallery; shows at a glance what the buyer gets", aspect: "4:3 yatay · 3000x2250 px", overlay: isPattern ? PATTERN_INCLUDED[input.craft!] : `WHAT'S INCLUDED${pages ? ` · ${pages}` : ""}`, prompt: !isPattern ? previewPrompt : `${base} Flat lay grid of ${isPattern ? "printed pattern pages and a tablet showing the PDF (the pattern pages may show their own printed text), next to the finished piece and materials" : input.kind === "wall_art" ? `all ${input.pageCount || 3} prints of the set side by side` : input.kind === "digital_planner" ? `${includedRange} different planner pages shown on tablet screens` : `${includedRange} different printed pages from the product arranged neatly`} on a light linen surface, top-down, even spacing. ${space}` },
    { titleTr: "Ölçü / format kartı", useTr: "Etsy galerisi; yanlış ölçü iadelerini önler", titleEn: isPattern ? "Size card" : "Size / format card", useEn: "Etsy gallery; prevents wrong-size returns", aspect: "4:3 yatay · 3000x2250 px", overlay: input.kind === "slides" ? "16:9 SLIDES + HOST GUIDE" : input.kind === "resume" ? "US LETTER + A4 · DOCX" : formats || (isPattern ? "FINISHED SIZE" : "PRINT SIZES"), prompt: `${base} ${isPattern ? `${cap(subject)} next to a measuring tape and a ruler for scale` : input.kind === "wall_art" ? "Frames in several standard sizes leaning against a wall, each holding one of the real prints, showing relative size" : input.kind === "wallpaper" ? "Three phones of different sizes side by side, each showing the same wallpaper, no logos" : input.kind === "app_icons" ? "A phone showing the home screen with the icons next to the widget images laid out in their three sizes, no real brand logos" : input.kind === "spreadsheet" ? "The spreadsheet open on a laptop and on a phone side by side, no logos" : input.kind === "slides" ? "The game board on a laptop and the same slide on a TV side by side, both 16:9, no logos" : input.kind === "resume" ? "The resume printed in US Letter and in A4 side by side on a desk, showing relative size" : input.kind === "cards" ? "A folded 5x7 card next to its envelope and a ruler for scale" : input.kind === "calendar" ? "The landscape calendar printed in US Letter and A4 side by side on a desk, showing relative size" : input.kind === "digital_planner" ? "The planner shown on a large and a small tablet side by side, landscape and portrait" : "Stacked printed sheets in each included size (largest at back) on a desk, edges aligned, showing relative size"}, clean minimal composition. ${space}` },
    { titleTr: "İkinci kullanım sahnesi", useTr: "Etsy galerisi; farklı bir ortamda kullanım", titleEn: "Second lifestyle scene", useEn: "Etsy gallery; the product in a different setting", aspect: "4:3 yatay · 3000x2250 px", prompt: `${base} Second lifestyle scene: ${subject}, ${pickScene(2)}. A different setting and angle from the first lifestyle image.` },
    // Görseller yalnız ürünün gerçekten içerdiği sürümleri gösterir: PDF'te olmayan renk seçeneği alıcıyı yanıltır.
    variationVisual(input, base, subject, palette, space),
    { titleTr: "Nasıl çalışır (3 adım)", useTr: "Etsy galerisi son görsellerden; dijital ürün olduğunu netleştirir, yanlış anlaşılmayı önler", titleEn: "How it works (3 steps)", useEn: "One of the last Etsy gallery images; makes clear it is a digital product", aspect: "4:3 yatay · 3000x2250 px", overlay: isPattern ? "1 DOWNLOAD · 2 PRINT OR VIEW · 3 MAKE" : input.kind === "digital_planner" ? "1 DOWNLOAD · 2 IMPORT · 3 PLAN" : input.kind === "wallpaper" ? "1 DOWNLOAD · 2 SAVE · 3 SET" : input.kind === "app_icons" ? "1 DOWNLOAD · 2 SAVE · 3 SET UP" : input.kind === "spreadsheet" ? "1 DOWNLOAD · 2 OPEN · 3 TYPE" : input.kind === "slides" ? "1 DOWNLOAD · 2 OPEN · 3 PLAY" : input.kind === "resume" ? "1 DOWNLOAD · 2 EDIT · 3 APPLY" : input.kind === "wall_art" ? "1 DOWNLOAD · 2 PRINT · 3 FRAME" : "1 DOWNLOAD · 2 PRINT · 3 ENJOY", prompt: `${base} Three-panel layout: a laptop showing a download, ${input.kind === "wallpaper" ? "a phone saving the image to its photos, then the phone showing the new lock screen, no logos" : input.kind === "app_icons" ? "a phone saving the icons to its photos, then the phone showing the new home screen, no real brand logos" : input.kind === "spreadsheet" ? "the spreadsheet opening on a laptop and a phone, then a hand typing numbers while the chart updates, no logos" : input.kind === "slides" ? "the game opening on a laptop, then a TV showing the game board while friends play, no logos" : input.kind === "resume" ? "the template opening in a word processor on a laptop, then a hand typing over the sample text, then the printed resume in a folder, no logos" : input.kind === "digital_planner" ? "the planner opening in a note-taking app on a tablet, then a hand writing on it with a stylus" : input.kind === "wall_art" ? "a print shop or home printer printing a print, then the framed print on a wall" : `a home printer printing ${isPattern ? "pattern pages" : "the pages"}, then ${isPattern ? "hands making the item" : "the pages in use"}`}. Simple, bright, consistent props, no logos.` },
    { titleTr: "Pinterest pini", useTr: "Pinterest; dijital ürünlerde en büyük dış trafik kaynağı", titleEn: "Pinterest pin", useEn: "Pinterest; the largest outside traffic source for digital products", aspect: "2:3 dikey · 1000x1500 px", overlay: `${input.productType.toUpperCase()}${input.features?.[0] ? ` · ${input.features[0].toUpperCase()}` : ""}`, prompt: `${base} Vertical pin composition: ${subject}${highlight}, ${pickScene(3)}, styled from slightly above. Leave a clean band across the top 30% for a bold headline.` },
    { titleTr: "Instagram / Facebook reklamı", useTr: "Instagram akışı, hikâye ve Facebook reklamı; ilk saniyede dikkat çeker", titleEn: "Instagram / Facebook ad", useEn: "Instagram feed, story and Facebook ad; must stop the scroll in the first second", aspect: "1:1 kare · 1080x1080 px", overlay: isPattern ? "PDF PATTERN · INSTANT DOWNLOAD" : "INSTANT DOWNLOAD", prompt: `${base} Bold, scroll-stopping ad image: ${subject} as the hero, ${adScene}, vivid but on-palette accent prop, strong contrast. ${space} In the next reply, make the same scene as a 9:16 story image (1080x1920 px).` }
  ];
  return visuals.map((visual, index) => ({ slot: index + 1, ...visual }));
}
