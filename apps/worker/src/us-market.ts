import type { PrintableKind } from "./etsy-trends.js";

// ABD pazarı kuralları: talimat paketinin Türkçe bölümüne girer. Yapay zekâ satıcıyla Türkçe konuşur, ama ürüne
// giren her metni ABD'nin 50 eyaletinde doğal okunan Amerikan İngilizcesiyle ve ABD biçimleriyle yazar.
// Eyaletten eyalete değişen konular (vergi, resmî tatil, okul yılı, iklim, müfredat) ürüne sabit bilgi olarak yazılmaz.
// Her ürün yalnız kendisine uyan kuralları alır; ilgisiz kural paketi uzatır ve yapay zekânın dikkatini dağıtır.

const SCREEN_ONLY = new Set<PrintableKind>(["digital_planner", "wallpaper", "app_icons", "spreadsheet", "slides"]);
const DATED = new Set<PrintableKind>(["planner", "digital_planner", "calendar", "journal"]);
const MONEY = /\b(budget|finance|financial|money|savings?|debt|expense|bill|bills|paycheck|income|spending|cash|sinking funds?)\b/i;
const SCHOOL = /\b(academic|teacher|teachers|student|students|school|homeschool|college|classroom|semester)\b/i;

export interface UsMarketInput {
  kind?: PrintableKind;
  productType?: string;
  keyword?: string;
}

export function usMarketRulesTr(input: UsMarketInput): string[] {
  const kind = input.kind;
  const product = `${input.productType || ""} ${input.keyword || ""}`;
  const lines = [
    "Alıcılar ABD'nin 50 eyaletinden. Ürüne giren her metni her eyalette doğal okunan, sade standart Amerikan İngilizcesiyle yaz; bölgesel söyleyiş ve argo kullanma (ör. \"y'all\", içecek için \"pop\" ya da \"soda\" farkı).",
    "Yazım ve kelimeler Amerikan olsun: \"color\", \"favorite\", \"organize\", \"gray\", \"center\", \"labeled\", \"canceled\", \"Mom\", \"math\", \"vacation\". İngiliz yazımı ve kelimeleri kullanma: \"colour\", \"favourite\", \"organise\", \"grey\", \"centre\", \"Mum\", \"maths\", \"fortnight\".",
    "Tarih yazılacaksa \"January 5, 2027\" ya da ay/gün/yıl (\"01/05/2027\") biçiminde olur; hafta varsayılan olarak Pazar (\"Sunday\") günü başlar.",
    "Para \"$\" işaretiyle ve ABD biçiminde yazılır: \"$1,234.56\".",
    "Kültürel göndermeler ABD'li alıcıya uysun; Türkiye'ye özgü bayram, ölçü veya kavram ürüne girmez. Ürünün teması dışında başka bir bayram ya da mevsim eklenmez.",
    "İklim eyaletten eyalete çok değişir: Florida, Arizona, Hawaii ve güney California'da kış karlı geçmez. Ürünün kendi teması ve görselleri olduğu gibi kalır; ama ilan, pin ve görsel metinleri herkese aynı iklimi varsaymasın (\"for snowy winter days\" gibi ifadeler kullanma).",
    "Satış vergisini Etsy alıcının eyaletine göre kendisi ekler; ilanda ve görsellerde \"tax included\" gibi bir ifade kullanma."
  ];
  // Ölçü birimi yalnız basılan veya ölçü taşıyan ürünlerde geçer (ekran ürünlerinde ölçü pikseldir).
  if (!kind || !SCREEN_ONLY.has(kind)) lines.splice(2, 0, "Ölçüler önce ABD birimiyle yazılır: inç (\"in\"), \"ft\", \"°F\", \"oz\", \"lb\"; metrik ölçü yalnız ikinci bilgi olarak parantez içinde verilir.");
  // Saat yalnız saatli sayfası olan ürünlerde geçer (boyama veya kâğıt kitine saat kuralı yazılmaz).
  if (kind === "planner" || kind === "digital_planner" || kind === "journal") lines.push("Saatler 12 saatlik düzende ve AM/PM ile yazılır (\"7 AM\", \"12 PM\"); 24 saatlik düzen kullanılmaz.");
  if (!kind || !SCREEN_ONLY.has(kind)) lines.push("Kâğıtta ilk format US Letter (8.5 x 11 in) olur; A4 yalnız uluslararası alıcılar için ek formattır. ABD'li alıcılar evde çoğunlukla US Letter yazdırır.");
  if (kind && DATED.has(kind)) {
    lines.push("Resmî tatiller eyalete göre değişir: \"Patriots' Day\" yalnız Massachusetts ve Maine'de, \"Mardi Gras\" Louisiana'da, \"Cesar Chavez Day\" California'da tatildir. Ürüne tatil basma; alıcı kendi tatilini yazar. Bir tatil mutlaka yazılacaksa yalnız 11 federal tatilden biri olur ve tarihi kodla hesaplanır, çünkü bazı federal tatiller her yıl başka güne denk gelir.");
    lines.push("ABD'de 6 saat dilimi var; dosyaya saat dilimi (\"EST\", \"PST\") yazma.");
  }
  if ((kind === "planner" || kind === "digital_planner") && SCHOOL.test(product)) {
    lines.push("Okul yılı eyalete göre değişir: güney ve batı eyaletlerinde Ağustos başında, kuzeydoğuda Eylül'de başlar. Akademik veya öğretmen planlayıcısı tarihsiz olur ve \"August to July\" (Ağustos–Temmuz) düzeninde sıralanır.");
  }
  if (kind === "spreadsheet" || ((kind === "planner" || kind === "digital_planner") && MONEY.test(product))) {
    lines.push("Vergi eyaletten eyalete değişir: Oregon, Montana, New Hampshire ve Delaware'de satış vergisi yoktur (Alaska'da yalnız yerel vergi var); Alaska, Florida, Nevada, New Hampshire, South Dakota, Tennessee, Texas, Washington ve Wyoming'de eyalet gelir vergisi yoktur. Bu yüzden ürüne hiçbir sabit vergi oranı yazma; vergi için alıcının kendi oranını yazacağı boş bir alan koy.");
    lines.push("Para terimleri ABD'de kullanılan sözcüklerle olsun: \"paycheck\", \"bills\", \"checking\", \"savings\", \"credit card\", \"401(k)\"; İngiliz karşılıkları (\"current account\", \"pay packet\") kullanılmaz.");
  }
  if (kind === "kids") {
    lines.push("Sınıf adları ABD sistemine göre yazılır: \"Pre-K\", \"Kindergarten\", \"1st grade\", \"2nd grade\"; kapağa yaş aralığı da yazılır. Okul terimleri ABD'de olduğu gibi: \"math\", \"recess\", \"homework\".");
    lines.push("Müfredat standartları eyaletten eyalete değişir (ör. Texas'ta TEKS, Florida'da B.E.S.T.); ürüne \"Common Core aligned\" ya da herhangi bir eyalet standardına uyumlu deme.");
    lines.push("Para alıştırması varsa ABD bozuk paraları kullanılır: \"penny\", \"nickel\", \"dime\", \"quarter\"; ölçme alıştırmasında önce inç.");
  }
  if (kind === "recipe") {
    lines.push("Mutfak ölçüleri ABD'deki gibi: \"cups\", \"tbsp\", \"tsp\", \"oz\", \"lb\", fırın sıcaklığı \"°F\"; dönüşüm tablosunda metrik karşılığı ikinci sütundadır ve her sayı kodla hesaplanır. İngiliz mutfak sözcükleri kullanılmaz: \"icing sugar\" yerine \"powdered sugar\", \"cornflour\" yerine \"cornstarch\".");
  }
  if (kind === "labels") {
    lines.push("Etiket sözcükleri ABD market adlarıyla yazılır: \"all-purpose flour\", \"powdered sugar\", \"brown sugar\", \"baking soda\", \"cornstarch\", \"oatmeal\", \"cilantro\", \"zucchini\", \"cookies\", \"chips\". İngiliz adları kullanılmaz: \"plain flour\", \"icing sugar\", \"bicarbonate of soda\", \"courgette\", \"biscuits\", \"crisps\".");
  }
  if (kind === "cards") {
    lines.push("Kartlar ABD standardındadır: katlanınca 5x7 in olur ve \"A7\" zarfa girer. Selamlar ürünün temasında, ABD'de doğal söylendiği gibi yazılır; İngiliz kalıpları (ör. \"Mum\") kullanılmaz.");
  }
  if (kind === "party") {
    lines.push("Parti ve kişi adları ABD'deki gibi yazılır (ör. \"Mom-to-be\", \"bride-to-be\"); İngiliz karşılıkları kullanılmaz. ABD'de alkol yaşı her eyalette 21'dir: alkolden söz eden bir oyun varsa üstüne \"21+\" yazılır; anne adayı ve çocuk partisi oyunlarında alkol geçmez.");
  }
  if (kind === "puzzles") {
    lines.push("Bulmaca kelimeleri her eyalette bilinen ortak Amerikan kelimeleridir; bölgesel sözcük, İngiliz yazımı ve marka adı kullanılmaz. Büyük puntolu ürünün alıcısı çoğunlukla yaşlılardır; ilan metninde \"seniors\" sözcüğü uygundur.");
  }
  if (kind === "wallpaper" || kind === "app_icons") {
    lines.push("ABD'de telefonların yarıdan fazlası iPhone'dur: önce iPhone ölçüleri, sonra yaygın Android ölçüleri gelir. Kurulum anlatımında uygulama ve telefon adları yalnız düz metin olarak geçer; logo kullanılmaz.");
  }
  if (kind === "slides") {
    lines.push("Sorular ABD'deki aileler, sınıflar ve arkadaş grupları için genel kültür olsun; yalnız bir eyalette bilinen yerel konu (yerel spor takımı, eyalet yasası, yerel ünlü) sorulmaz. Her cevap doğrulanır; cevabı tartışmalı ya da zamanla değişen soru (ör. güncel rekorlar, \"en yüksek bina\") konmaz. Ölçü ve sıcaklık soruları ABD birimiyle sorulur.");
    lines.push("Bilinen TV yarışmalarının adları marka olduğu için oyunda, dosya adında ve ilanda geçmez (\"Jeopardy\", \"Family Feud\" ve benzerleri; \"Jeopardy style\" de olmaz). Oyun \"quiz-show game\" ya da \"trivia game\" diye anlatılır.");
  }
  if (kind === "resume") {
    lines.push("ABD özgeçmiş kuralları: fotoğraf, doğum tarihi, yaş, medeni durum, uyruk, din ve kimlik numarası yazılmaz; ABD'de işe alımda ayrımcılığı önlemek için bu bilgiler istenmez. Adres yalnız şehir ve eyalet kısaltmasıdır (\"City, ST\").");
    lines.push("Maaş bilgisi yazılmaz: California ve New York gibi birçok eyalet ve şehir işverenin maaş geçmişini sormasını yasaklar. Belgenin adı \"resume\"dir; \"CV\" ABD'de akademik başvurular için kullanılır. Tarihler \"Jan 2024 – Present\" biçimindedir.");
    lines.push("Örnek bilgiler kurgusaldır: telefon \"(555) 555-0123\", e-posta \"name@example.com\"; gerçek şirket, okul veya kişi adı geçmez. Ürün adı özgeçmiş sayfalarına yazılmaz, çünkü alıcı bu sayfaları kendi belgesi olarak kullanır.");
  }
  if (kind === "wall_art") {
    lines.push("Çerçeve ölçüleri ABD standardında inçle yazılır (5x7, 8x10, 11x14, 16x20, 18x24 in); ISO ölçüleri (A4, A3) ek bilgidir.");
  }
  return lines;
}
