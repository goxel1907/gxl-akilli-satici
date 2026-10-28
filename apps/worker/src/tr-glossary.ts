// Satıcı Türk, alıcı ABD'de. Satıcının Türkçe yazdığı renk ve özellikler İngilizceye çevrilir; çevrilemeyen kelime
// ilana girmez (yanlış İngilizce yerine hiç yazmamak daha güvenli). Üretilen İngilizce başlık ve etiketler de
// satıcının kontrol edebilmesi için kelime kelime Türkçeye açıklanır.

const COLORS: Record<string, string> = {
  "krem": "cream", "bej": "beige", "ekru": "ecru", "beyaz": "white", "kırık beyaz": "off white", "siyah": "black",
  "gri": "gray", "açık gri": "light gray", "koyu gri": "charcoal", "antrasit": "charcoal", "füme": "smoke gray",
  "kırmızı": "red", "bordo": "burgundy", "şarap kırmızısı": "wine red", "pembe": "pink", "pudra": "blush pink",
  "toz pembe": "dusty pink", "fuşya": "fuchsia", "mor": "purple", "lila": "lilac", "lavanta": "lavender",
  "mavi": "blue", "açık mavi": "light blue", "bebe mavisi": "baby blue", "lacivert": "navy blue", "turkuaz": "turquoise",
  "petrol mavisi": "teal", "petrol": "teal", "yeşil": "green", "açık yeşil": "light green", "koyu yeşil": "dark green",
  "zümrüt yeşili": "emerald green", "adaçayı yeşili": "sage green", "adaçayı": "sage green", "mint": "mint green",
  "mint yeşili": "mint green", "haki": "khaki", "zeytin yeşili": "olive green", "sarı": "yellow", "hardal": "mustard",
  "turuncu": "orange", "somon": "salmon", "mercan": "coral", "kahverengi": "brown", "kahve": "brown",
  "açık kahve": "light brown", "deve tüyü": "camel", "vizon": "taupe", "taba": "tan", "altın": "gold",
  "altın sarısı": "gold", "gümüş": "silver", "gümüş gri": "silver gray", "bakır": "copper", "bronz": "bronze",
  "çok renkli": "multicolor", "rengarenk": "multicolor", "şeffaf": "clear", "kehribar rengi": "amber"
};

const FEATURES: Record<string, string> = {
  "oversize": "oversized", "bol kesim": "oversized", "kalın": "chunky", "kalın örgü": "chunky", "ince": "lightweight",
  "burgu": "cable knit", "burgulu": "cable knit", "saç örgü": "cable knit", "kare motif": "granny square",
  "dantel": "lace", "dantelli": "lace", "çiçekli": "floral", "çiçek motifli": "floral", "püskül": "tassel",
  "püsküllü": "tassel", "telkari": "filigree", "kalem işi": "hand engraved", "el gravürlü": "hand engraved",
  "gravürlü": "hand engraved", "oksitli": "oxidized", "kafes": "cage", "kafesli": "cage", "kapüşonlu": "hooded",
  "düğmeli": "button up", "fermuarlı": "zip up", "kısa": "cropped", "crop": "cropped", "v yaka": "v neck",
  "balıkçı yaka": "turtleneck", "boğazlı": "turtleneck", "bisiklet yaka": "crew neck", "uzun kollu": "long sleeve",
  "kısa kollu": "short sleeve", "kolsuz": "sleeveless", "çizgili": "striped", "ekose": "plaid", "yumuşak": "soft",
  "sıcak tutan": "warm", "dövme": "hammered", "işlemeli": "embroidered", "nakışlı": "embroidered", "desenli": "patterned",
  "geometrik": "geometric", "boho": "boho", "minimalist": "minimalist", "sade": "minimalist", "retro": "retro",
  "osmanlı": "ottoman", "el boyaması": "hand painted", "mineli": "enameled", "yuvarlak": "round", "oval": "oval"
};

const ENGLISH_EXTRA = ["dark", "light", "pale", "deep", "bright", "neutral", "pastel", "rust", "ivory", "oatmeal", "natural", "rose", "wine", "plum", "cobalt", "royal", "sky", "forest", "moss", "honey", "caramel", "chocolate", "mauve", "peach", "terracotta", "denim", "rainbow", "ombre", "speckled", "textured", "ribbed", "slouchy", "fitted", "long", "short", "sleeve", "neck", "square", "granny", "cable", "knit", "crochet", "vintage", "classic", "elegant", "cute", "cozy"];

const ENGLISH_WORDS = new Set([...Object.values(COLORS), ...Object.values(FEATURES), ...ENGLISH_EXTRA].flatMap((value) => value.split(" ")));

function normalizeTr(value: string): string {
  return value.toLocaleLowerCase("tr-TR").replace(/[^a-zçğıöşü\s-]/g, " ").replace(/\s+/g, " ").trim();
}

// Renk veya özellik listesini İngilizceye çevirir. Sözlükteki Türkçe kelime çevrilir, bilinen İngilizce kelime kalır.
// Türkçe harf içeren ve sözlükte olmayan kelime ilana girmez (dropped). Sözlükte olmayan ama İngilizce olabilecek kelime
// (ör. fotoğraf analizinden "heather gray") kalır ama satıcıya kontrol için gösterilir (unchecked).
export function termsToEnglish(values: unknown, kind: "color" | "feature", limit: number): { terms: string[]; dropped: string[]; unchecked: string[] } {
  const map = kind === "color" ? COLORS : FEATURES;
  const terms: string[] = [];
  const dropped: string[] = [];
  const unchecked: string[] = [];
  for (const raw of Array.isArray(values) ? values : []) {
    const value = normalizeTr(String(raw));
    if (value.length < 2) continue;
    if (map[value]) terms.push(map[value]);
    else if (/[çğıöşü]/.test(value) || value.length > 24) dropped.push(String(raw).trim());
    else {
      terms.push(value);
      if (!value.split(" ").every((word) => ENGLISH_WORDS.has(word))) unchecked.push(value);
    }
  }
  const kept = [...new Set(terms)].slice(0, limit);
  return { terms: kept, dropped, unchecked: unchecked.filter((value) => kept.includes(value)) };
}

// İngilizce ifade → Türkçe karşılık. Uzun ifadeler önce eşlenir ("gift for her" tek parça).
const PHRASES: Record<string, string> = {
  "prayer beads": "tesbih", "gift for her": "kadına hediye", "gift for him": "erkeğe hediye", "gift for mom": "anneye hediye",
  "unisex gift": "herkese uygun hediye", "for women": "kadınlar için", "for men": "erkekler için", "handmade in türkiye": "Türkiye'de el yapımı",
  "instant download": "anında indirme", "digital download": "dijital indirme", "habit tracker": "alışkanlık takip sayfası",
  "life tracker": "yaşam takip sayfası", "mood tracker": "ruh hali takip sayfası", "budget tracker": "bütçe takip sayfası",
  "self care": "öz bakım", "us letter": "US Letter (ABD kâğıt boyu)", "half letter": "Half Letter (yarım ABD kâğıdı)",
  "planner inserts": "planlayıcı ek sayfaları", "crochet pattern": "tığ işi deseni", "knitting pattern": "şiş örgü deseni",
  "granny square": "kare motif", "cable knit": "burgu örgü", "hand knit": "el örgüsü", "one size": "tek beden",
  "islamic gift": "İslami hediye", "muslim gift": "Müslüman'a hediye", "home decor": "ev dekorasyonu", "wall art": "duvar sanatı",
  "coloring pages": "boyama sayfaları", "sterling silver": "925 ayar gümüş", "kuka wood": "kuka ağacı", "oltu stone": "oltu taşı",
  "mother of pearl": "sedef", "serving tray": "servis tepsisi", "pillow cover": "yastık kılıfı", "coffee cup": "kahve fincanı",
  "candle holder": "şamdan", "turkish coffee pot": "cezve", "button up": "düğmeli", "zip up": "fermuarlı", "v neck": "V yaka",
  "crew neck": "bisiklet yaka", "long sleeve": "uzun kollu", "short sleeve": "kısa kollu", "hand engraved": "el gravürlü",
  "hand painted": "el boyaması", "king chain": "kral zincir", "off white": "kırık beyaz", "sage green": "adaçayı yeşili",
  "navy blue": "lacivert", "light blue": "açık mavi", "baby blue": "bebe mavisi", "dusty pink": "toz pembe", "blush pink": "pudra pembe",
  "olive green": "zeytin yeşili", "mint green": "mint yeşili", "emerald green": "zümrüt yeşili", "wine red": "şarap kırmızısı",
  "light gray": "açık gri", "silver gray": "gümüş gri", "light brown": "açık kahve", "dark green": "koyu yeşil", "light green": "açık yeşil",
  "merino wool": "merino yün", "alpaca wool": "alpaka yünü", "worry beads": "tespih (oyalanma tespihi)",
  "tasbih misbaha": "tesbih (tasbih ve misbaha aynı ürünün adları)", "muslim gift for him": "Müslüman erkeğe hediye",
  "muslim gift for her": "Müslüman kadına hediye", "islamic gift for men": "erkeklere İslami hediye", "islamic gift for women": "kadınlara İslami hediye",
  "eid gift": "Bayram hediyesi", "ramadan gift": "Ramazan hediyesi", "life planner": "yaşam planlayıcı",
  "gift idea": "hediye fikri", "crochet gift": "tığ işi hediye", "knitted gift": "örgü hediye"
};

const WORDS: Record<string, string> = {
  crochet: "tığ işi", knit: "örgü", knitted: "örgü", sweater: "kazak", pullover: "kazak", cardigan: "hırka", vest: "yelek",
  beanie: "bere", scarf: "atkı", poncho: "panço", mittens: "eldiven", hat: "şapka", top: "bluz", dress: "elbise", skirt: "etek",
  blanket: "battaniye", shawl: "şal", bag: "çanta", tote: "bez çanta", handmade: "el yapımı", gift: "hediye", gifts: "hediyeler",
  women: "kadın", womens: "kadın", woman: "kadın", men: "erkek", mens: "erkek", her: "ona (kadın)", him: "ona (erkek)", mom: "anne",
  unisex: "unisex (herkese)", vintage: "vintage (20+ yıllık)", antique: "antika (100+ yıllık)", turkish: "Türk", ottoman: "Osmanlı",
  tray: "tepsi", copper: "bakır", brass: "pirinç", silver: "gümüş", gold: "altın", rug: "halı", kilim: "kilim", vase: "vazo",
  bowl: "kase", plate: "tabak", lamp: "lamba", box: "kutu", mirror: "ayna", lantern: "fener", ewer: "ibrik", pitcher: "sürahi",
  teapot: "çaydanlık", samovar: "semaver", brooch: "broş", ring: "yüzük", necklace: "kolye", bracelet: "bilezik", earrings: "küpe",
  watch: "saat", tasbih: "tesbih", misbaha: "tesbih (misbaha)", tesbih: "tesbih", beads: "taneler", amber: "kehribar",
  planner: "planlayıcı", planners: "planlayıcılar", printable: "yazdırılabilir", printables: "yazdırılabilir ürünler",
  undated: "tarihsiz", daily: "günlük", weekly: "haftalık", monthly: "aylık", yearly: "yıllık", goal: "hedef", tracker: "takip sayfası",
  journal: "defter", pattern: "desen", patterns: "desenler", pdf: "PDF", digital: "dijital", download: "indirme", template: "şablon",
  cards: "kartlar", recipe: "tarif", minimalist: "sade", boho: "bohem", cozy: "rahat", winter: "kış", floral: "çiçekli", lace: "dantel",
  chunky: "kalın", oversized: "bol kesim", cropped: "kısa (crop)", soft: "yumuşak", warm: "sıcak tutan", lightweight: "ince",
  hooded: "kapüşonlu", turtleneck: "balıkçı yaka", sleeveless: "kolsuz", striped: "çizgili", plaid: "ekose", hammered: "dövme",
  embroidered: "işlemeli", patterned: "desenli", geometric: "geometrik", retro: "retro", enameled: "mineli", round: "yuvarlak",
  oval: "oval", filigree: "telkari", oxidized: "oksitli", cage: "kafesli", tassel: "püsküllü", design: "tasarım", with: "ile",
  and: "ve", cotton: "pamuk", wool: "yün", acrylic: "akrilik", linen: "keten", bamboo: "bambu", mohair: "moher", cashmere: "kaşmir",
  merino: "merino", alpaca: "alpaka", yarn: "iplik", size: "beden", cream: "krem", beige: "bej", white: "beyaz", black: "siyah",
  gray: "gri", grey: "gri", red: "kırmızı", burgundy: "bordo", pink: "pembe", purple: "mor", lilac: "lila", lavender: "lavanta",
  blue: "mavi", turquoise: "turkuaz", teal: "petrol mavisi", green: "yeşil", khaki: "haki", yellow: "sarı", mustard: "hardal",
  orange: "turuncu", coral: "mercan", brown: "kahverengi", camel: "deve tüyü", taupe: "vizon", tan: "taba", multicolor: "çok renkli",
  charcoal: "antrasit", ecru: "ekru", fuchsia: "fuşya", salmon: "somon", bronze: "bronz", clear: "şeffaf", wood: "ağaç",
  stone: "taş", galalith: "galalit", agate: "akik", onyx: "oniks", obsidian: "obsidyen", ebony: "abanoz", leather: "deri", silk: "ipek",
  home: "ev", decor: "dekor", kitchen: "mutfak", wall: "duvar", art: "sanat", coloring: "boyama", kids: "çocuk", baby: "bebek",
  pages: "sayfalar", page: "sayfa", life: "yaşam", inserts: "ek sayfalar", bundle: "set", set: "set", kit: "set",
  christmas: "Noel", halloween: "Cadılar Bayramı", ramadan: "Ramazan", eid: "Bayram", islamic: "İslami", muslim: "Müslüman"
};

// Etsy arama ifadeleri (trend, keşif ve sezon kartları) için ek sözlük. Bu sözlükte olmayan kelime
// sunucuda yapay zekâyla çevrilip saklanır; yapay zekâ yoksa İngilizce bırakılır ve kartta öyle görünür.
Object.assign(PHRASES, {
  "coloring pages": "boyama sayfaları", "coloring book": "boyama kitabı", "baby shower": "baby shower (doğum öncesi kutlaması)",
  "bridal shower": "bridal shower (gelin partisi)", "cross stitch": "kanaviçe (etamin)", "punch needle": "punch nakış",
  "junk journal": "junk journal (kolaj defteri)", "digital paper": "dijital kâğıt", "wall decor": "duvar dekoru",
  "home decor": "ev dekorasyonu", "mothers day": "Anneler Günü", "fathers day": "Babalar Günü", "valentines day": "Sevgililer Günü",
  "st patricks day": "Aziz Patrick Günü", "new year": "Yılbaşı", "back to school": "okula dönüş", "fall decor": "sonbahar dekoru",
  "gift idea": "hediye fikri", "prayer rug": "seccade", "prayer mat": "seccade", "evil eye": "nazar boncuğu", "nazar boncugu": "nazar boncuğu",
  "beginner friendly": "yeni başlayanlara uygun", "easy crochet": "kolay tığ işi", "no sew": "dikişsiz", "step by step": "adım adım",
  "video tutorial": "video anlatım", "instant download": "anında indirme", "digital download": "dijital indirme",
  "sterling silver": "925 ayar gümüş", "silver jewelry": "gümüş takı", "turkish rug": "Türk halısı", "kilim pillow": "kilim yastık",
  "tote bag": "bez çanta", "bucket hat": "kova şapka", "christmas gift": "Noel hediyesi", "birthday gift": "doğum günü hediyesi",
  "anniversary gift": "yıldönümü hediyesi", "wedding gift": "düğün hediyesi", "graduation gift": "mezuniyet hediyesi",
  "housewarming gift": "yeni ev hediyesi", "mothers day gift": "Anneler Günü hediyesi", "valentines gift": "Sevgililer Günü hediyesi", "granny square": "kare motif", "amigurumi pattern": "amigurumi (örgü oyuncak) deseni"
});
Object.assign(WORDS, {
  quilt: "yorgan (kapitone)", quilting: "kapitone", embroidery: "nakış", sewing: "dikiş", macrame: "makrome",
  needlepoint: "goblen", tapestry: "goblen", amigurumi: "amigurumi (örgü oyuncak)", knitting: "şiş örgü", doily: "dantel örtü",
  stitch: "ilmek", toy: "oyuncak", toys: "oyuncaklar", doll: "oyuncak bebek", animal: "hayvan", animals: "hayvanlar",
  flower: "çiçek", flowers: "çiçekler", heart: "kalp", hearts: "kalpler", ornament: "süs", ornaments: "süsleri", pumpkin: "balkabağı",
  shamrock: "yonca", bow: "fiyonk", bows: "fiyonklar", menorah: "menora (Yahudi şamdanı)", games: "oyunları", game: "oyun", bingo: "tombala", party: "parti",
  invitation: "davetiye", invitations: "davetiyeler", stickers: "çıkartmalar", sticker: "çıkartma", clipart: "küçük çizimler (clipart)",
  poster: "poster", posters: "posterler", print: "baskı", prints: "baskılar", calendar: "takvim", checklist: "kontrol listesi",
  schedule: "plan", cleaning: "temizlik", meal: "yemek", budget: "bütçe", habit: "alışkanlık", reading: "okuma", gratitude: "şükür",
  worksheet: "çalışma kâğıdı", worksheets: "çalışma kâğıtları", homeschool: "evde eğitim", activity: "etkinlik", activities: "etkinlikler",
  preschool: "okul öncesi", toddler: "küçük çocuk", teacher: "öğretmen", classroom: "sınıf", wedding: "düğün", birthday: "doğum günü",
  thanksgiving: "Şükran Günü", valentine: "Sevgililer Günü", valentines: "Sevgililer Günü", easter: "Paskalya", hanukkah: "Hanuka",
  jewelry: "takı", pendant: "kolye ucu", charm: "küçük süs (charm)", rosary: "tespih (Hristiyan)", pillow: "yastık", cushion: "minder",
  slippers: "patik", socks: "çorap", shirt: "gömlek", purse: "el çantası", basket: "sepet", coaster: "bardak altlığı", coasters: "bardak altlıkları",
  keychain: "anahtarlık", bookmark: "kitap ayracı", cottagecore: "kır evi tarzı (cottagecore)", coquette: "fiyonklu romantik tarz (coquette)",
  kawaii: "sevimli Japon tarzı (kawaii)", y2k: "2000'ler tarzı (Y2K)", aesthetic: "estetik", cute: "sevimli", easy: "kolay",
  beginner: "yeni başlayan", beginners: "yeni başlayanlar", simple: "basit", modern: "modern", rustic: "rustik", farmhouse: "çiftlik evi tarzı",
  neutral: "nötr renkli", pastel: "pastel", rainbow: "gökkuşağı", mushroom: "mantar", frog: "kurbağa", bear: "ayı", bunny: "tavşan",
  cat: "kedi", dog: "köpek", ghost: "hayalet", witch: "cadı", skull: "kafatası", star: "yıldız", moon: "ay", sun: "güneş", tree: "ağaç",
  leaf: "yaprak", bee: "arı", butterfly: "kelebek", strawberry: "çilek", cherry: "kiraz", lemon: "limon", coffee: "kahve", tea: "çay",
  book: "kitap", fall: "sonbahar", autumn: "sonbahar", spring: "ilkbahar", summer: "yaz", decoration: "dekorasyon", decorations: "süslemeler",
  prayer: "dua", worry: "oyalama", islam: "İslam", quran: "Kuran", allah: "Allah", arabic: "Arapça", calligraphy: "hat sanatı",
  jewish: "Yahudi", catholic: "Katolik", personalized: "kişiye özel", custom: "kişiye özel", name: "isim", family: "aile", couple: "çift",
  nursery: "bebek odası", bedroom: "yatak odası", bathroom: "banyo", office: "ofis", desk: "masa", storage: "saklama", organizer: "düzenleyici",
  notes: "notlar", notebook: "defter", sketchbook: "çizim defteri", diary: "günlük", workbook: "çalışma kitabı",
  goodnotes: "GoodNotes (tablet uygulaması)", ipad: "iPad", hyperlinked: "tıklanabilir bağlantılı", editable: "düzenlenebilir", canva: "Canva",
  svg: "SVG (kesim dosyası)", png: "PNG", sublimation: "süblimasyon baskı", cricut: "Cricut (kesim makinesi)", apron: "önlük", afghan: "örgü battaniye", cowl: "boyunluk", headband: "saç bandı",
  bandana: "bandana", balaclava: "kar maskesi (balaklava)", shrug: "bolero", bralette: "örgü büstiyer", bikini: "bikini", granny: "nine",
  square: "kare", squares: "kareler", hexagon: "altıgen", motif: "motif", border: "kenar", edging: "kenar örgüsü",
  pdfs: "PDF'ler", instant: "anında", sheet: "sayfa", sheets: "sayfalar", list: "liste", log: "kayıt", glass: "cam",
  ceramic: "seramik", porcelain: "porselen", pottery: "çömlek", enamel: "mine", pearl: "inci", pearls: "inciler", gemstone: "değerli taş"
});
const MAX_PHRASE_WORDS = Math.max(...Object.keys(PHRASES).map((key) => key.split(" ").length));

function glossParts(english: string): { text: string; unknown: string[] } {
  // Sözlükte olmayan parça (beden harfi, ölçü, marka dışı özel ad) yazıldığı gibi kalır.
  const original = english.replace(/[^A-Za-z0-9üÜ'\s%.-]/g, " ").split(/\s+/).filter(Boolean);
  const words = original.map((word) => word.toLowerCase());
  const out: string[] = [];
  const unknown: string[] = [];
  for (let index = 0; index < words.length;) {
    let matched = false;
    for (let size = Math.min(MAX_PHRASE_WORDS, words.length - index); size >= 2; size -= 1) {
      const phrase = words.slice(index, index + size).join(" ");
      if (PHRASES[phrase]) { out.push(PHRASES[phrase]); index += size; matched = true; break; }
    }
    if (matched) continue;
    const word = words[index];
    const known = /^\d{4}s$/.test(word) ? `${word.slice(0, 4)}'ler` : word === "for" ? "için" : WORDS[word];
    if (!known && /^[a-z][a-z'-]{2,}$/.test(word)) unknown.push(word);
    out.push(known || original[index]);
    index += 1;
  }
  return { text: out.join(" "), unknown };
}

export function glossTr(english: string): string {
  return glossParts(english).text;
}

// Etsy arama ifadesi → Türkçe ad. İngilizce sıra Türkçeye çevrilir: "crochet bag pattern" → "tığ işi çanta deseni",
// "budget planner printable" → "yazdırılabilir bütçe planlayıcı", "coloring pages for kids" → "çocuklar için boyama sayfaları".
// unknown: sözlükte bulunamayan İngilizce kelimeler (sunucu bunları yapay zekâyla çevirir).
const PHRASE_TAIL: Record<string, string> = { pattern: "deseni", patterns: "desenleri", pdf: "(PDF)", template: "şablonu", templates: "şablonları", chart: "şeması", svg: "(SVG)" };
const FOR_TARGETS: Record<string, string> = {
  men: "erkekler için", women: "kadınlar için", her: "kadına", him: "erkeğe", mom: "anneye", dad: "babaya", kids: "çocuklar için",
  baby: "bebek için", babies: "bebekler için", beginners: "yeni başlayanlar için", teachers: "öğretmenler için", girls: "kız çocukları için",
  boys: "erkek çocukları için", toddlers: "küçük çocuklar için", adults: "yetişkinler için", grandma: "büyükanneye", wife: "eşe (kadın)", husband: "eşe (erkek)"
};

export function phraseTr(keyword: string): { tr: string; unknown: string[] } {
  let words = keyword.toLowerCase().replace(/[^a-z0-9'\s-]/g, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return { tr: "", unknown: [] };
  if (PHRASES[words.join(" ")]) return { tr: PHRASES[words.join(" ")], unknown: [] };
  const tail: string[] = [];
  let printable = false;
  while (words.length > 1) {
    const last = words[words.length - 1];
    if (last === "printable" || last === "printables") { printable = true; words = words.slice(0, -1); continue; }
    if (!PHRASE_TAIL[last] || PHRASES[words.slice(-2).join(" ")]) break;
    tail.unshift(PHRASE_TAIL[last]);
    words = words.slice(0, -1);
  }
  if (words.length > 1 && words[0] === "printable") { printable = true; words = words.slice(1); }
  let target = "";
  const forAt = words.lastIndexOf("for");
  if (forAt > 0 && forAt < words.length - 1) {
    const who = FOR_TARGETS[words.slice(forAt + 1).join(" ")];
    if (who) { target = who; words = words.slice(0, forAt); }
  }
  const body = glossParts(words.join(" "));
  const tr = [target, printable ? "yazdırılabilir" : "", body.text, ...tail].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return { tr, unknown: body.unknown };
}

export function explainListingTr(input: { title?: unknown; tags?: unknown }): { titleTr: string; tags: Array<{ tag: string; tr: string }> } {
  const title = String(input.title || "").slice(0, 300);
  const tags = (Array.isArray(input.tags) ? input.tags : []).map((tag) => String(tag).slice(0, 40)).filter(Boolean).slice(0, 20);
  return {
    titleTr: title.split(/\s*[,|]\s*/).filter(Boolean).map(glossTr).join(" · "),
    tags: tags.map((tag) => ({ tag, tr: glossTr(tag) }))
  };
}
