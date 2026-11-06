import { calendarYear, type PrintableKind } from "./etsy-trends.js";

// Research starting points, never ready-made winning titles or measured trends.
// Every supported kind has alternatives; the seller's explicit query takes priority.
export function printableSearches(now = Date.now()): Record<PrintableKind, string[]> {
  const year = calendarYear(now);
  return {
    planner: ["weekly planner printable", "goal planner printable", "travel planner printable"],
    digital_planner: ["undated digital planner", "student digital planner", "weekly digital planner"],
    coloring: ["animal coloring pages", "botanical coloring pages", "geometric coloring pages"],
    wall_art: ["botanical printable wall art", "abstract printable wall art", "nursery printable wall art"],
    party: ["family game night printable", "birthday party games printable", "printable escape room game", "bridal shower games", "baby shower games printable"],
    recipe: ["blank recipe card printable", "recipe binder printable", "recipe book template printable"],
    journal: ["reading journal printable", "gratitude journal printable", "travel journal printable"],
    kids: ["preschool activity worksheets", "alphabet worksheets printable", "math worksheets printable"],
    paper_craft: ["botanical junk journal kit", "vintage digital paper pack", "floral scrapbook paper printable"],
    calendar: [`${year} monthly calendar printable`, `${year} wall calendar printable`, `${year} desk calendar printable`],
    stickers: ["printable planner stickers", "floral stickers printable", "habit tracker stickers printable"],
    cards: ["birthday greeting cards printable", "thank you cards printable", "anniversary cards printable"],
    puzzles: ["large print word search", "sudoku puzzle book printable", "crossword puzzles printable"],
    wallpaper: ["botanical phone wallpaper", "minimal phone wallpaper", "abstract phone wallpaper"],
    labels: ["pantry labels printable", "spice labels printable", "home organization labels printable"],
    app_icons: ["minimal app icons", "botanical app icons", "pastel app icons"],
    spreadsheet: ["budget spreadsheet", "expense tracker spreadsheet", "savings tracker spreadsheet"],
    slides: ["family trivia game slides", "birthday trivia game slides", "classroom trivia game slides"],
    resume: ["minimal resume template", "entry level resume template", "professional resume template"]
  };
}
