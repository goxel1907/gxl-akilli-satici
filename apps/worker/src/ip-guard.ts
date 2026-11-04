// Etsy'de en sık ilan kaldırma ve mağaza kapatma nedeni marka/telif ihlalidir.
// Bu isimler trend etiketlerinde görünse bile başlığa, etikete ve tasarıma girmez.
const PROTECTED_TERMS = [
  "disney", "mickey", "minnie mouse", "frozen", "elsa", "encanto", "moana", "pixar", "marvel", "avengers", "spiderman", "spider-man", "star wars", "baby yoda", "mandalorian",
  "harry potter", "hogwarts", "gryffindor", "pokemon", "pikachu", "hello kitty", "sanrio", "kuromi", "my melody", "cinnamoroll", "barbie", "bluey", "paw patrol", "peppa pig",
  "cocomelon", "sesame street", "minecraft", "roblox", "fortnite", "lego", "taylor swift", "swiftie", "eras tour", "grinch", "dr seuss", "snoopy", "peanuts gang", "care bears",
  "stanley cup", "starbucks", "louis vuitton", "chanel", "gucci", "nike", "coca cola", "nfl", "nba", "mlb", "super bowl", "olympics", "squishmallow", "stitch and angel", "lilo and stitch",
  "sailor moon", "studio ghibli", "totoro", "my little pony", "strawberry shortcake", "winnie the pooh", "looney tunes", "scooby doo", "sonic the hedgehog", "super mario", "zelda",
  // Rakip planlayıcı/defter markaları: PDF ürünlerinde en sık görülen marka ihlali bunlardır.
  "erin condren", "happy planner", "hobonichi", "passion planner", "clever fox", "moleskine", "filofax", "plum paper",
  "labubu", "k-pop demon hunters", "bridgerton", "stranger things", "gilmore girls", "addams family",
  // TV yarışması adları: sunum oyunlarında en sık görülen marka ihlali ("Jeopardy style" de markadır).
  "jeopardy", "family feud", "wheel of fortune", "who wants to be a millionaire", "kahoot", "the price is right", "deal or no deal"
];

const PATTERNS = PROTECTED_TERMS.map((term) => ({ term, pattern: new RegExp(`(^|[^a-z])${term.replace(/[-]/g, "[- ]?").replace(/ /g, "[ -]?")}([^a-z]|$)`) }));

export function findIpRisks(text: string): string[] {
  const value = text.toLowerCase();
  return PATTERNS.filter(({ pattern }) => pattern.test(value)).map(({ term }) => term);
}

export function isIpRisky(text: string): boolean {
  return findIpRisks(text).length > 0;
}

// Uyumluluk markaları (iPad, GoodNotes, DMC…) açıklamada düz metin olarak "works with" diye geçebilir;
// etikete ve başlığa girmez, çünkü marka sahibinin adıyla arama trafiği almak Etsy'de fikrî mülkiyet şikâyeti getirir.
const COMPAT_BRANDS = /(^|[^a-z])(ipad|iphone|ios|android|goodnotes|notability|dmc|cricut|canva|kindle|procreate|samsung|apple|silhouette cameo|anchor floss|excel|google sheets|notion|lightroom|instagram|tiktok|powerpoint|power point|google slides|keynote|microsoft word|ms word|google docs|google|microsoft)([^a-z]|$)/;

export function hasBrandName(text: string): boolean {
  return COMPAT_BRANDS.test(text.toLowerCase());
}
