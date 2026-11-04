import { calendarYear } from "./etsy-trends.js";
import type { PatternCraft, PrintableKind } from "./etsy-trends.js";

// Yapay zekâ "kontrol ettim" dediğinde bile saat (AM/PM), kopya sayfa, eksik format gibi hatalar kaçıyor.
// Bu protokol kontrolü göze değil koda bağlar: dosyaları açan bir betik yazılır, çıktısı yapıştırılır, FAIL kalmadan adım bitmez.
// Her ürün türü yalnız kendisine uyan kontrolleri alır (boyama kitabına saat sırası, kâğıt kitine sekme bağlantısı sorulmaz).
export type QaInput =
  | { type: "printable"; name: string; kind: PrintableKind; formats: string[]; pages: number; pagesNote?: string; papersOnly?: boolean }
  | { type: "pattern"; name: string; craft?: PatternCraft; terms: string; unit: string; sizes?: string };

// Sayfa ölçüsü tablosu yalnız ürünün gerçek formatlarından kurulur.
const POINT_SIZES: Array<[RegExp, string]> = [
  [/us letter \(landscape\)/i, "US Letter landscape 792×612 pt"], [/a4 \(landscape\)/i, "A4 landscape 842×595 pt"],
  [/us letter|^letter/i, "US Letter 612×792 pt"], [/^a4/i, "A4 595×842 pt"], [/^a5/i, "A5 420×595 pt"], [/half letter/i, "Half Letter 396×612 pt"],
  [/4x6/i, "4×6 in 288×432 pt"], [/5x7/i, "5×7 in 360×504 pt"], [/8x10/i, "8×10 in 576×720 pt"], [/11x14/i, "11×14 in 792×1008 pt"], [/12x12/i, "12×12 in 864×864 pt"]
];
// Her format için ilk eşleşen ölçü alınır ("US Letter (landscape)" dikey Letter sayılmaz).
const pageSizes = (formats: string[]) => [...new Set(formats.flatMap((format) => { const found = POINT_SIZES.find(([pattern]) => pattern.test(format)); return found ? [found[1]] : []; }))].join(", ") || "the size of each format";
const TEXT_KINDS = new Set<PrintableKind>(["planner", "digital_planner", "journal", "recipe", "party", "kids", "puzzles", "labels", "spreadsheet"]);

const KIND_CHECKS: Partial<Record<PrintableKind, string[]>> = {
  planner: ["CALENDAR — monthly grids have 6 rows × 7 columns; Monday-start and Sunday-start versions differ only in weekday order."],
  wall_art: ["PRINT SIZE — every 2:3 master is 5400×8100 px, every ratio file has the stated pixel size at 300 dpi (for example 3:4 = 5400×7200 px for 18×24 in), and important elements stay inside the safe area in every ratio."],
  coloring: ["LINE ART — after thresholding, the line art is pure black on white with no gray fills, lines are closed and at least 1 pt thick, and no two pages repeat the same subject in the same composition; the PDF has no blank pages."],
  party: [
    "ANSWER KEYS — every game with right answers (quizzes, matching, word games) has an answer key with one answer per question; games without right answers (advice cards, predictions) are marked \"no key needed\".",
    "21+ — any game that mentions alcohol carries a \"21+\" note (the drinking age is 21 in every US state), and games for a mom-to-be or for kids mention no alcohol."
  ],
  recipe: [
    "CUT LINES — 4×6 and 5×7 cards have crop marks, and the card content stays 3 mm inside them (cards have no binding margin).",
    "US UNITS — the conversion chart lists US measures first (cups, tbsp, tsp, oz, lb, °F) with the metric value beside each; every metric value is computed in code (1 cup = 236.6 ml, °C = (°F − 32) × 5/9) and rounded the same way."
  ],
  journal: ["PROMPTS — no prompt is repeated; count the prompts and confirm there are at least 40, as the content requires."],
  kids: [
    "ANSWER KEYS — every activity with a correct answer has a matching key entry; the age range is stated on the cover.",
    "US SCHOOL TERMS — grade names (Pre-K, Kindergarten, 1st grade …), coins (penny, nickel, dime, quarter) and measures (inches first) follow US usage, and no page claims a state or Common Core standard."
  ],
  calendar: [`DATES — for every month of ${calendarYear()}, compare the printed grid with Python's calendar module: day 1 falls on the right weekday, the month has the right number of days, weeks start on Sunday, the month name and year are right, and no holiday is printed (holidays differ by state); print one PASS/FAIL line per month.`],
  stickers: ["STICKERS — every sticker PNG has a transparent background and keeps its white border; on the sheets, every sticker is at least 0.6 in wide, 0.25 in from its neighbors and 0.5 in from the page edge; the number of PNG files equals the number of stickers on the illustrated sheets."],
  cards: ["CARDS — every card sheet has a fold line and crop marks, the inside text is upright when the card is folded, every greeting is spelled correctly in natural US wording (never British forms such as \"Mum\"), and the gift tags have hole marks."],
  puzzles: ["PUZZLES — a script re-solves every puzzle: each listed word appears exactly once in its grid, every sudoku has exactly one solution, and each answer key matches its puzzle number."],
  wallpaper: ["WALLPAPER SIZES — every file has the exact pixel size of its listed screen, the main subject stays inside the central 70%, and no image is stretched (sizes are cropped, never squeezed)."],
  app_icons: ["ICONS — every icon has the same size, corner radius, padding and line weight; no icon uses a letter, an app name or anything that looks like another company's logo (compare the contact sheet with the best-known app logos); no two icons use the same symbol."],
  spreadsheet: [
    "FORMULAS — in a copy, fill every input cell with sample numbers, recalculate with a formula engine (for example LibreOffice headless or the Python formulas package) and confirm that no cell shows an error (#REF!, #DIV/0!, #VALUE!, #NAME?), every total equals the sum of its inputs and every chart points to the right range; deliver the clean file without the sample numbers.",
    "INPUTS — input cells are shaded, formula cells are locked with sheet protection that has no password, and every drop-down has data validation.",
    "NO MACROS — the file is .xlsx (not .xlsm) with no macros, scripts, external links, pivot tables or hidden tabs, so it works in Excel, Google Sheets and phone spreadsheet apps.",
    "US FORMAT — currency cells use the $ format ($1,234.56), dates use MM/DD/YYYY, and no cell holds a fixed sales-tax or income-tax rate: tax rates differ by state, so any tax rate is a blank input cell."
  ],
  labels: ["LABELS — every label word is in an English dictionary with US spelling and uses the US grocery name (powdered sugar, all-purpose flour, cornstarch, baking soda; never \"icing sugar\", \"plain flour\", \"cornflour\" or \"bicarbonate of soda\"), no word repeats within a set, and the cut lines line up with the label boxes."],
  paper_craft: ["PATTERN TILES — for every tile, the left and right edge columns and the top and bottom edge rows match (mean difference under 3%), the 2×2 preview shows no seam, and every 12×12 paper is a 3600×3600 px JPG."]
};

// Görselde yazı olmamalı: her türün kendi ifadesi (yazının nerede serbest olduğu dahil).
const OCR = "run OCR (for example pytesseract) on every art image before it is placed; if OCR is not available, list every image where letters or pseudo-letters are visible on the contact sheet.";
const ART_TEXT_CHECKS: Partial<Record<PrintableKind, string>> = {
  calendar: `TEXT-FREE ART — the month artworks contain no text, numbers or letters: ${OCR} Text appears only in the code-made date grids, month names and the bottom © line.`,
  stickers: `TEXT-FREE ART — the illustrated stickers contain no text or letters: ${OCR} Words appear only on the functional stickers made in code.`,
  cards: `TEXT-FREE ART — the card front artworks contain no drawn text or letters: ${OCR} Greetings are set in code.`,
  wallpaper: `TEXT-FREE ART — the wallpapers contain no text, letters or watermark: ${OCR}`,
  app_icons: `TEXT-FREE ART — the icons, widgets and wallpapers contain no text, letters, numbers or logos: ${OCR}`
};

// Sayfa sayısı, talimattaki sayfa bütçesiyle aynı cümleden gelir; tablet ve baskı sürümleri ayrı ölçülür.
function filesCheck(input: Extract<QaInput, { type: "printable" }>): string {
  const limit = "the upload set follows the 'Upload set' line and has at most 5 files of at most 20 MB each";
  const count = input.pagesNote || `${input.pages} core pages plus the cover, how-to-print, thank-you and license pages`;
  const tablet = input.formats.filter((format) => /tablet|hyperlink/i.test(format));
  const print = input.formats.filter((format) => !/tablet|hyperlink|black-and-white/i.test(format));
  const tabletSize = tablet.length ? "; every tablet edition has its stated canvas size (2388×1668 px landscape or 1668×2388 px portrait)" : "";
  if (input.kind === "paper_craft") {
    const pdfs = print.filter((format) => !/12x12/.test(format));
    return `FILES — ${pdfs.length ? `the ${pdfs.join(" and ")} PDF editions exist, open and have the same page order and count (${count}); each page size matches its format within 1 pt (${pageSizes(pdfs)}); ` : ""}the 12×12 papers exist as JPG files; ${limit}.`;
  }
  if (input.kind === "app_icons") return `FILES — the Icons zip holds every icon as a 1024×1024 px PNG plus the blank icons; the second zip holds 3 widget images (1024×1024, 2048×1024 and 2048×2048 px) and 2 wallpapers (1290×2796 px); the PDF holds the setup guide, thank-you and license pages; ${limit}.`;
  if (input.kind === "spreadsheet") return `FILES — the zip holds the .xlsx workbook and the quick-start PDF; the workbook opens with openpyxl and has the tabs in the tab plan (${input.pages} tabs); ${limit}.`;
  if (input.kind === "wallpaper") return `FILES — every wallpaper exists in every listed size (${input.formats.join(", ")}) as a PNG with that exact pixel size, and the PDF holds the setup guide, thank-you and license pages; ${limit}.`;
  if (input.kind === "stickers") return `FILES — the ${print.filter((format) => !/png/i.test(format)).map((format) => format.replace(/\s*\(.*\)/, "")).join(" and ")} sticker-sheet PDFs exist and open, have the same pages (${count}) and match ${pageSizes(print.filter((format) => !/png/i.test(format)))}; the PNG zip holds every sticker as a transparent PNG; ${limit}.`;
  if (input.kind === "cards") return `FILES — the US Letter and A4 card PDFs exist and open, pages match ${pageSizes(print)}, every edition holds the same cards and the gift tag sheet, and each folded card front measures 5×7 in (360×504 pt) within 1 pt; ${limit}.`;
  if (input.kind === "recipe") return `FILES — the 4×6 and 5×7 card PDFs are US Letter sheets (612×792 pt) holding the cards with crop marks, and each card's trim box measures 288×432 pt (4×6) or 360×504 pt (5×7) within 1 pt; the binder-page PDFs match ${pageSizes(print.filter((format) => !/cards/i.test(format)))}; every edition holds the same recipe templates; ${limit}.`;
  if (input.kind === "wall_art") return `FILES — every print exists in every ratio or size file (${input.formats.join(", ")}), each opens and has the stated pixel size, and the PDF holds the size guide, how-to-print, thank-you and license pages; ${limit}.`;
  if (input.kind === "digital_planner") return `FILES — every edition in the upload set exists and opens; every edition has the same pages (${count})${tabletSize}${print.length ? `; the ${print.join(" and ")} edition matches ${pageSizes(print)}` : ""}; ${limit}.`;
  const blackWhite = input.formats.some((format) => /black-and-white/i.test(format)) ? "; the black-and-white edition is US Letter (612×792 pt)" : "";
  return `FILES — every promised format exists as its own file: ${input.formats.join(", ")}. Each file opens; every edition has the same pages (${count}); each print page matches its format within 1 pt (${pageSizes(print)})${blackWhite}${tabletSize}; ${limit}.`;
}

type PatternQa = Extract<QaInput, { type: "pattern" }>;
const yarnChecks = (input: PatternQa) => [
  `NUMBERING — every ${input.unit} is numbered 1…N with no gap or repeat in the written instructions and in the charts; N is the same in both and in the Design spec.`,
  `STITCH MATH — build a table in code for every ${input.unit}: starting count, increases, decreases, repeats × multiplier, stated end count and computed end count. The computed count must equal the stated count, and each starting count must equal the previous end count.`,
  `SIZES — ${input.sizes ? `for every size (${input.sizes}), ` : "if there are several sizes, "}stitch counts and yardage grow with the size, and finished measurements equal stitches divided by gauge within 3%.`,
  `ABBREVIATIONS — every abbreviation used is in the abbreviation table, every table entry is used, and all follow ${input.terms}.`,
  "MATERIALS — yarn weight, fiber, hook or needle size and yardage are identical on the cover, the materials page and the Design spec."
];
// Her teknik kendi gerçek hatalarına göre denetlenir (kanaviçede ilmek hesabı değil şema ve renk anahtarı).
const PATTERN_CHECKS: Record<PatternCraft, (input: PatternQa) => string[]> = {
  crochet: yarnChecks,
  knitting: yarnChecks,
  cross_stitch: () => [
    "CHART — every symbol in the chart is in the color key and every key entry is used; chart pages overlap correctly and match the page map.",
    "COUNTS — the stitch count per color in the key equals the count in the chart, and the counts add up to the total.",
    "SIZES — the finished size equals stitches ÷ fabric count for 14, 16 and 18 count within 1%.",
    "MATERIALS — fabric, DMC numbers and skein amounts are identical on the cover, the materials page, the key and the Design spec."
  ],
  embroidery: () => [
    "TEMPLATE — the test square measures exactly 1 in / 2.5 cm at 100% print; the template fits the stated hoop and its bounding box fits inside 6.5 × 9 in so it prints at 100% on both US Letter and A4, or it is tiled with overlap marks.",
    "CALLOUTS — every numbered area has a stitch and a color, every callout is in the legend, and the stitch guide covers every stitch used.",
    "MATERIALS — fabric, hoop, DMC numbers, strands and skeins are identical on the materials page, the map and the Design spec."
  ],
  punch_needle: () => [
    "TEMPLATE — the template is mirrored and labeled \"back side\", the test square measures exactly 1 in / 2.5 cm at 100% print, and the template fits inside 6.5 × 9 in (prints at 100% on US Letter and A4) or is tiled with overlap marks.",
    "CALLOUTS — every color area has a yarn color and a loop height that are in the legend.",
    "MATERIALS — foundation, needle size and yarn amounts are identical on the materials page, the map and the Design spec."
  ],
  sewing: () => [
    "PIECES — every piece in the cutting chart appears on the pattern pages with its label, grainline, notches and cut quantity; edges that are sewn together have equal length within 1/8 in.",
    "TILING — the page-assembly map matches the tiled pages, the test square measures exactly 1 in / 2.5 cm at 100% print, and the A0 file holds every piece.",
    "YARDAGE — the cutting layouts fit the stated yardage for both fabric widths, and finished dimensions equal piece dimensions minus seam allowances."
  ],
  macrame: () => [
    "CORDS — the cord count and the cut lengths are identical in the cutting list, the instructions and the Design spec, and each length includes a 20% margin.",
    "NUMBERING — every row is numbered 1…N with no gap or repeat, and every row names its cord numbers and a measurement.",
    "MATERIALS — cord type, thickness, total length and dowel size are identical on the cover, the materials page and the Design spec."
  ]
};

export function qaProtocol(input: QaInput): string[] {
  const intro = [
    "Write ONE Python script (pypdf or pdfplumber; PyMuPDF if available) that opens every delivered file and prints a PASS/FAIL table, one line per check below.",
    "Paste the script output itself, not a summary. A step is not done while any line says FAIL: fix the files and run the script again.",
    "Saying \"checked\" without the script output does not count. Only if you cannot run code at all: give one PASS/FAIL line per check with the evidence you looked at."
  ];
  // Cilt payı yalnız deliği/cildi olan sayfalarda: planlayıcı, günlük, tarif dosyası sayfaları ve desen PDF'i (kartlarda yok).
  const binding = input.type === "printable" && ["planner", "journal"].includes(input.kind);
  const nameWhere = input.type === "printable" && input.kind === "wall_art" ? "on the size guide and the license page" : input.type === "printable" && (input.kind === "wallpaper" || input.kind === "app_icons") ? "on the setup guide and the license page" : input.type === "printable" && input.kind === "spreadsheet" ? "on the 'Start here' tab and in the quick-start PDF" : "on the cover and on the thank-you or final page";
  const common = (name: string) => [
    `NAME — the product name "${name}" appears ${nameWhere}, spelled exactly like this, and no other product name or old working name appears anywhere.`,
    "PLACEHOLDERS — no \"Lorem\", \"TODO\", \"TBD\", \"XXX\", \"undefined\", \"NaN\", stray brackets or empty headings.",
    input.type === "printable" && input.kind === "spreadsheet"
      ? "FONTS — the quick-start PDF embeds every font, and the workbook uses only fonts that come with both Excel and Google Sheets (for example Arial or Georgia); print the font list."
      : "FONTS — every font is embedded; print the font list.",
    input.type === "printable" && input.kind === "spreadsheet"
      ? "MARGINS — in the quick-start PDF every word's bounding box is at least 6 mm from each page edge; in the workbook no text is cut off in its cell at 100% zoom."
      : `MARGINS — every word's bounding box is at least 6 mm from each page edge${binding ? " (19 mm on the binding side of print editions)" : input.type === "printable" && input.kind === "recipe" ? " (19 mm on the binding side of the binder pages)" : ""}; nothing is clipped.`,
    `AMERICAN ENGLISH — list every word in the files and file names that is not in an American English dictionary and fix the real typos (the product name "${input.name}" is a coined word: keep it); also list and fix any British spelling or word (\"colour\", \"favourite\", \"organise\", \"grey\", \"centre\", \"Mum\", \"maths\") and any Turkish word or Turkish-only letter (c-cedilla, g-breve, dotless i, o-umlaut, s-cedilla, u-umlaut).`,
    "VISUAL — render every page to a contact-sheet image, look at it and list anything empty, crowded, cut off or inconsistent."
  ];
  if (input.type === "printable") {
    const textKind = TEXT_KINDS.has(input.kind);
    const tablet = input.kind === "digital_planner" || input.formats.some((format) => /tablet|hyperlink/i.test(format));
    const checks = [
      filesCheck(input),
      ...(["planner", "digital_planner", "journal"].includes(input.kind) ? ["SEQUENCES — extract the text of every page and test every numbered sequence: hour labels run in order with the right AM/PM (… 11 AM, 12 PM, 1 PM …), day numbers 1–31 have no gaps or repeats, weekday lists follow the page's Monday-start or Sunday-start order, and footer page numbers match the real page index."] : []),
      ...(textKind && !["planner", "digital_planner", "journal", "labels", "spreadsheet"].includes(input.kind) ? ["PAGE NUMBERS — footer page numbers match the real page index and have no gaps or repeats."] : []),
      input.kind === "app_icons"
        ? "DUPLICATES — no two icons use the same symbol, and no two widgets or wallpapers share the same artwork."
        : input.kind === "spreadsheet"
        ? "DUPLICATES — repeated tabs (for example the 12 monthly tabs) are the same template on purpose; every other tab has its own purpose."
        : input.kind === "wall_art" || input.kind === "wallpaper"
        ? `DUPLICATES — no two ${input.kind === "wallpaper" ? "wallpapers" : "prints"} share the same artwork or composition (the size files of one ${input.kind === "wallpaper" ? "wallpaper" : "print"} are the same art on purpose).`
        : `DUPLICATES — no two pages share the same or nearly the same ${textKind ? "text (90% or more), except declared Monday/Sunday variants and declared repeated template pages (for example the daily page of an undated planner, or free-writing pages)" : "artwork or composition"}. Every page must earn its place.`,
      ...(!["wall_art", "wallpaper", "app_icons", "spreadsheet"].includes(input.kind) ? ["COVER — page 1 is a real cover: no page number, running header or navigation label."] : []),
      ...(tablet ? ["LINKS — the tablet edition has working internal links (count them) and every page links back to the index; print editions have no tab bars or buttons that only work on a tablet."] : []),
      ...(!textKind ? [ART_TEXT_CHECKS[input.kind] || (input.kind === "coloring"
        ? "TEXT-FREE ART — the line art itself contains no text or letters: run OCR (for example pytesseract) on every art image before it is placed; on the pages, text is allowed only in the bottom margin (the small page number and © line); if OCR is not available, list every image where letters or pseudo-letters are visible on the contact sheet."
        : `TEXT-FREE ART — ${input.kind === "paper_craft" ? input.papersOnly ? "the patterned and solid papers contain" : "the patterned papers, solid papers and ephemera sheets contain" : "the art prints contain"} no text, letters, page number or footer: extract the PDF text of those pages and run OCR (for example pytesseract) on every art image; if OCR is not available, list every image where letters or pseudo-letters are visible on the contact sheet.`)] : []),
      ...(input.kind === "paper_craft" && !input.papersOnly ? ["EPHEMERA — every ephemera PNG has a transparent background and keeps its white cutting border."] : []),
      input.kind === "calendar"
        ? "THEME — every month's artwork fits its own month, and all 12 months share one style and palette."
        : input.kind === "wallpaper" || input.kind === "app_icons"
        ? `THEME — every ${input.kind === "app_icons" ? "icon, widget and wallpaper" : "wallpaper"} fits the theme in the Product spec; none adds a different holiday, season or mood.`
        : input.kind === "spreadsheet"
        ? "THEME — every tab uses the same palette, fonts and header style from the Product spec."
        : "THEME — list every page title; none names a different holiday, season or mood than the theme in the Product spec.",
      ...(textKind || input.kind === "calendar" || input.kind === "cards" ? ["LEGIBILITY — body text at least 9 pt, labels at least 7 pt, label color contrast at least 4.5:1 on white."] : []),
      ...(KIND_CHECKS[input.kind] || []),
      ...common(input.name)
    ];
    return [...intro, ...checks.map((check, index) => `${index + 1}. ${check}`)];
  }
  const checks = [
    input.craft === "sewing"
      ? "FILES — the instructions PDF (US Letter, prints on A4), the tiled US Letter pieces PDF, the tiled A4 pieces PDF and the A0 pieces PDF all exist and open; fonts are embedded; the upload set has at most 5 files of at most 20 MB each."
      : "FILES — the PDF opens, pages are US Letter and print safely on A4, fonts are embedded, and the page count matches the plan.",
    ...(PATTERN_CHECKS[input.craft || "crochet"] || PATTERN_CHECKS.crochet)(input),
    "TEST-MAKE — list every [TEST-MAKE CHECK] item that is still open.",
    ...common(input.name)
  ];
  return [...intro, ...checks.map((check, index) => `${index + 1}. ${check}`)];
}
