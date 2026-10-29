import type { PatternCraft, PrintableKind } from "./etsy-trends.js";

// Yapay zekâ "kontrol ettim" dediğinde bile saat (AM/PM), kopya sayfa, eksik format gibi hatalar kaçıyor.
// Bu protokol kontrolü göze değil koda bağlar: dosyaları açan bir betik yazılır, çıktısı yapıştırılır, FAIL kalmadan adım bitmez.
// Her ürün türü yalnız kendisine uyan kontrolleri alır (boyama kitabına saat sırası, kâğıt kitine sekme bağlantısı sorulmaz).
export type QaInput =
  | { type: "printable"; name: string; kind: PrintableKind; formats: string[]; pages: number }
  | { type: "pattern"; name: string; craft?: PatternCraft; terms: string; unit: string; sizes?: string };

// Sayfa ölçüsü tablosu yalnız ürünün gerçek formatlarından kurulur.
const POINT_SIZES: Array<[RegExp, string]> = [
  [/us letter|^letter/i, "US Letter 612×792 pt"], [/^a4/i, "A4 595×842 pt"], [/^a5/i, "A5 420×595 pt"], [/half letter/i, "Half Letter 396×612 pt"],
  [/4x6/i, "4×6 in 288×432 pt"], [/5x7/i, "5×7 in 360×504 pt"], [/8x10/i, "8×10 in 576×720 pt"], [/11x14/i, "11×14 in 792×1008 pt"], [/12x12/i, "12×12 in 864×864 pt"]
];
const pageSizes = (formats: string[]) => [...new Set(formats.flatMap((format) => POINT_SIZES.filter(([pattern]) => pattern.test(format)).map(([, size]) => size)))].join(", ") || "the size of each format";
const TEXT_KINDS = new Set<PrintableKind>(["planner", "digital_planner", "journal", "recipe", "party", "kids"]);

const KIND_CHECKS: Partial<Record<PrintableKind, string[]>> = {
  planner: ["CALENDAR — monthly grids have 6 rows × 7 columns; Monday-start and Sunday-start versions differ only in weekday order."],
  wall_art: ["PRINT SIZE — every ratio file has the stated pixel size at 300 dpi (for example 2:3 = 4800×7200 px for 16×24 in), and important elements stay inside the safe area in every ratio."],
  coloring: ["LINE ART — lines are closed, at least 1 pt thick, with no gray fills; every page is single-sided with a blank back; no two pages share the same subject."],
  party: ["ANSWER KEYS — every game with right answers (quizzes, matching, word games) has an answer key with one answer per question; games without right answers (advice cards, predictions) are marked \"no key needed\"."],
  recipe: ["CUT LINES — 4×6 and 5×7 cards have crop marks, and the card content stays 3 mm inside them."],
  journal: ["PROMPTS — no prompt is repeated; count the prompts and confirm there are at least 40, as the content requires."],
  kids: ["ANSWER KEYS — every activity with a correct answer has a matching key entry; the age range is stated on the cover."],
  paper_craft: ["PATTERN TILES — seamless papers repeat without visible seams at 100% zoom; every 12×12 paper is a 3600×3600 px JPG; ephemera PNG files have a transparent background."]
};

function filesCheck(input: Extract<QaInput, { type: "printable" }>): string {
  const limit = "the upload set is at most 5 files of at most 20 MB each";
  if (input.kind === "paper_craft") {
    const pdfs = input.formats.filter((format) => !/12x12/.test(format));
    return `FILES — ${pdfs.length ? `the ${pdfs.join(" and ")} PDF editions exist, open and have the same page order and count; each page size matches its format within 1 pt (${pageSizes(pdfs)}); ` : ""}the 12×12 papers exist as JPG files; ${limit}.`;
  }
  if (input.kind === "wall_art") return `FILES — every print exists in every ratio file (${input.formats.join(", ")}), each opens and has the stated pixel size; ${limit}.`;
  return `FILES — every promised format exists as its own file: ${input.formats.join(", ")}. Each file opens; every edition has the same page count (${input.pages} core pages plus the cover, ${input.kind === "digital_planner" ? "import guide" : "how-to-print"}, thank-you and license pages); ${input.kind === "digital_planner" ? "every page has the stated tablet canvas size" : `each page size matches its format within 1 pt (${pageSizes(input.formats)})`}; ${limit}.`;
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
    "TEMPLATE — the test square measures exactly 1 in / 2.5 cm at 100% print; the template fits the stated hoop.",
    "CALLOUTS — every numbered area has a stitch and a color, every callout is in the legend, and the stitch guide covers every stitch used.",
    "MATERIALS — fabric, hoop, DMC numbers, strands and skeins are identical on the materials page, the map and the Design spec."
  ],
  punch_needle: () => [
    "TEMPLATE — the template is mirrored and labeled \"back side\", and the test square measures exactly 1 in / 2.5 cm at 100% print.",
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
    "Saying \"checked\" without the script output does not count."
  ];
  const binding = input.type === "pattern" || ["planner", "journal", "recipe"].includes(input.kind);
  const nameWhere = input.type === "printable" && input.kind === "wall_art" ? "on the size guide and the license page" : "on the cover and on the thank-you or final page";
  const common = (name: string) => [
    `NAME — the product name "${name}" appears ${nameWhere}, spelled exactly like this, and no other product name or old working name appears anywhere.`,
    "PLACEHOLDERS — no \"Lorem\", \"TODO\", \"TBD\", \"XXX\", \"undefined\", \"NaN\", stray brackets or empty headings.",
    "FONTS — every font is embedded; print the font list.",
    `MARGINS — every word's bounding box is at least 6 mm from each page edge${binding ? " (19 mm on the binding side of print editions)" : ""}; nothing is clipped.`,
    `SPELLING — list every word that is not in an English dictionary and fix the real typos (the product name "${input.name}" is a coined word: keep it).`,
    "VISUAL — render every page to a contact-sheet image, look at it and list anything empty, crowded, cut off or inconsistent."
  ];
  if (input.type === "printable") {
    const textKind = TEXT_KINDS.has(input.kind);
    const tablet = input.kind === "digital_planner" || input.formats.some((format) => /tablet|hyperlink/i.test(format));
    const checks = [
      filesCheck(input),
      ...(["planner", "digital_planner", "journal"].includes(input.kind) ? ["SEQUENCES — extract the text of every page and test every numbered sequence: hour labels run in order with the right AM/PM (… 11 AM, 12 PM, 1 PM …), day numbers 1–31 have no gaps or repeats, weekday lists follow the page's Monday-start or Sunday-start order, and footer page numbers match the real page index."] : []),
      ...(textKind && !["planner", "digital_planner", "journal"].includes(input.kind) ? ["PAGE NUMBERS — footer page numbers match the real page index and have no gaps or repeats."] : []),
      `DUPLICATES — no two pages share the same or nearly the same ${textKind ? "text (90% or more), except declared Monday/Sunday variants" : "artwork or composition"}. Every page must earn its place.`,
      "COVER — page 1 is a real cover: no page number, running header or navigation label.",
      ...(tablet ? ["LINKS — the tablet edition has working internal links (count them) and every page links back to the index; print editions have no tab bars or buttons that only work on a tablet."] : []),
      ...(!textKind ? [`TEXT-FREE ART — ${input.kind === "paper_craft" ? "patterned papers, solid papers and ephemera sheets" : input.kind === "wall_art" ? "the art prints" : "the coloring artwork"} contain no text, letters, page number or footer inside the art area (extract the text of each page to prove it).`] : []),
      "THEME — list every page title; none names a different holiday, season or mood than the theme in the Product spec.",
      ...(textKind ? ["LEGIBILITY — body text at least 9 pt, labels at least 7 pt, label color contrast at least 4.5:1 on white."] : []),
      ...(KIND_CHECKS[input.kind] || []),
      ...common(input.name)
    ];
    return [...intro, ...checks.map((check, index) => `${index + 1}. ${check}`)];
  }
  const checks = [
    "FILES — the PDF opens, pages are US Letter and print safely on A4, fonts are embedded, and the page count matches the plan.",
    ...(PATTERN_CHECKS[input.craft || "crochet"] || PATTERN_CHECKS.crochet)(input),
    "TEST-MAKE — list every [TEST-MAKE CHECK] item that is still open.",
    ...common(input.name)
  ];
  return [...intro, ...checks.map((check, index) => `${index + 1}. ${check}`)];
}
