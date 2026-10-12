import type { PrintableKind } from "./etsy-trends.js";

// Yapay zekâ "kontrol ettim" dediğinde bile saat (AM/PM), kopya sayfa, eksik format gibi hatalar kaçıyor.
// Bu protokol kontrolü göze değil koda bağlar: dosyaları açan bir betik yazılır, çıktısı yapıştırılır, FAIL kalmadan adım bitmez.
export type QaInput =
  | { type: "printable"; name: string; kind: PrintableKind; formats: string[]; pages: number }
  | { type: "pattern"; name: string; terms: string; unit: string; sizes?: string };

const PAGE_SIZES = "US Letter 612×792 pt, A4 595×842 pt, A5 420×595 pt, Half Letter 396×612 pt";

const KIND_CHECKS: Partial<Record<PrintableKind, string[]>> = {
  planner: ["CALENDAR — monthly grids have 6 rows × 7 columns; Monday-start and Sunday-start versions differ only in weekday order."],
  digital_planner: ["TABS — every tab and index entry jumps to the right page; count links per page and list any page without a way back to the index."],
  wall_art: ["PRINT SIZE — every ratio file has the stated pixel size at 300 dpi (for example 2:3 = 7200×10800 px for 24×36 in); no artwork is cropped at any ratio."],
  coloring: ["LINE ART — lines are closed, at least 1 pt thick, with no grey fills; every page is single-sided with a blank back."],
  party: ["ANSWER KEYS — every question has exactly one matching answer in the key; counts of questions and answers are equal."],
  recipe: ["CUT LINES — 4×6 and 5×7 cards have crop marks, and the card content stays 3 mm inside them."],
  journal: ["PROMPTS — no prompt is repeated; count the prompts and confirm the number promised in the listing."],
  kids: ["ANSWER KEYS — every activity with a correct answer has a matching key entry; the age range is stated on the cover."],
  paper_craft: ["PATTERN TILES — seamless papers repeat without visible seams at 100% zoom; every sheet is 12×12 in at 300 dpi where promised."]
};

export function qaProtocol(input: QaInput): string[] {
  const intro = [
    "Write ONE Python script (pypdf or pdfplumber; PyMuPDF if available) that opens every delivered file and prints a PASS/FAIL table, one line per check below.",
    "Paste the script output itself, not a summary. A step is not done while any line says FAIL: fix the files and run the script again.",
    "Saying \"checked\" without the script output does not count."
  ];
  const common = (name: string) => [
    `NAME — the product name "${name}" appears on the cover and on the thank-you or final page, and no other product name or old working name appears anywhere.`,
    "PLACEHOLDERS — no \"Lorem\", \"TODO\", \"TBD\", \"XXX\", \"undefined\", \"NaN\", stray brackets or empty headings.",
    "FONTS — every font is embedded; print the font list.",
    "MARGINS — every word's bounding box is at least 6 mm from each page edge (19 mm on the binding side of print editions); nothing is clipped.",
    "SPELLING — list every word that is not in an English dictionary and fix the real typos.",
    "VISUAL — render every page to a contact-sheet image, look at it and list anything empty, crowded, cut off or inconsistent."
  ];
  if (input.type === "printable") {
    const checks = [
      `FILES — every promised format exists as its own file: ${input.formats.join(", ")}. Each file opens; every edition has the same page count (planned about ${input.pages}); each page size matches its format within 1 pt (${PAGE_SIZES}); the upload set is at most 5 files of at most 20 MB.`,
      "SEQUENCES — extract the text of every page and test every numbered sequence: hour labels run in order with the right AM/PM (… 11 AM, 12 PM, 1 PM …), day numbers 1–31 have no gaps or repeats, weekday lists follow the page's Monday-start or Sunday-start order, and footer page numbers match the real page index.",
      "DUPLICATES — no two pages share the same or nearly the same text (90% or more), except declared Monday/Sunday variants. Every page must earn its place.",
      "COVER — page 1 is a real cover: no page number, running header or navigation label.",
      "LINKS — the tablet edition has working internal links (count them); print editions carry no navigation labels such as \"INDEX\".",
      "LEGIBILITY — body text at least 9 pt, labels at least 7 pt, label colour contrast at least 4.5:1 on white.",
      ...(KIND_CHECKS[input.kind] || []),
      ...common(input.name)
    ];
    return [...intro, ...checks.map((check, index) => `${index + 1}. ${check}`)];
  }
  const checks = [
    "FILES — the PDF opens, pages are US Letter and print safely on A4, fonts are embedded, and the page count matches the plan.",
    `NUMBERING — every ${input.unit} is numbered 1…N with no gap or repeat in the written instructions and in the charts; N is the same in both and in the Design spec.`,
    `STITCH MATH — build a table in code for every ${input.unit}: starting count, increases, decreases, repeats × multiplier, stated end count and computed end count. The computed count must equal the stated count, and each starting count must equal the previous end count.`,
    `SIZES — ${input.sizes ? `for every size (${input.sizes}), ` : "if there are several sizes, "}stitch counts and yardage grow with the size, and finished measurements equal stitches divided by gauge within 3%.`,
    `ABBREVIATIONS — every abbreviation used is in the abbreviation table, every table entry is used, and all follow ${input.terms}.`,
    "MATERIALS — yarn weight, fibre, hook or needle size and yardage are identical on the cover, the materials page and the Design spec.",
    "TEST-MAKE — list every [TEST-MAKE CHECK] item that is still open.",
    ...common(input.name)
  ];
  return [...intro, ...checks.map((check, index) => `${index + 1}. ${check}`)];
}
