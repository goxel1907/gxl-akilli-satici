import { themeFamilies, type ThemeFamily } from "./theme.js";

// İlan görsellerinin süsü: yapay zekâ ürünün temasına uyan küçük süsleri (kar tanesi, kalp, balkabağı…) kodla,
// spec paletinde, yalnız kenarlara ve köşelere çizer. Gerçek ürün, başlık ve rozet olduğu gibi kalır; logo,
// karakter ve yazı olmaz. Böylece her kapak dikkat çeker ama ürünü olduğundan farklı göstermez.
const DECOR: Array<[ThemeFamily[], string]> = [
  [["christmas"], "a string of small lights along the top edge, snowflakes, holly sprigs with red berries and small wrapped gift boxes"],
  [["halloween", "witchy", "dark"], "small pumpkins, bats, stars and a crescent moon"],
  [["thanksgiving", "fall"], "fall leaves, small pumpkins and wheat sprigs"],
  [["easter", "spring"], "pastel eggs, tulips and small flowers"],
  [["valentine", "mothers_day"], "small hearts and simple flowers"],
  [["st_patricks"], "shamrocks and small gold coins"],
  [["patriotic"], "stars and a bunting garland in red, white and blue"],
  [["hanukkah"], "dreidels, simple stars and soft glowing dots"],
  [["ramadan"], "a crescent moon, stars and small lanterns"],
  [["winter"], "snowflakes and pine sprigs"],
  [["summer", "coastal", "citrus"], "seashells, small waves and sun rays"],
  [["fathers_day", "western"], "simple stars and a thin rope-style border"],
  [["birthday", "bachelorette", "graduation", "playful"], "confetti, balloons and paper streamers"],
  [["bridal"], "soft greenery sprigs and small flowers"],
  [["baby_shower"], "soft balloons, small stars and clouds"],
  [["botanical", "woodland", "boho", "cozy", "vintage", "safari"], "leaf sprigs, small flowers and soft dots"]
];
const DEFAULT_DECOR = "soft confetti dots, small stars and a thin border";

export function decorFor(themes: Iterable<ThemeFamily> | string): string {
  const families = typeof themes === "string" ? themeFamilies(themes) : new Set(themes);
  for (const [keys, decor] of DECOR) if (keys.some((key) => families.has(key))) return decor;
  return DEFAULT_DECOR;
}
