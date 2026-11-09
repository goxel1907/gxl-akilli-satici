import type { AdVisual } from "./ad-visuals.js";

// Android paylaşımı ChatGPT/Claude'da her seferinde yeni sohbet açar; yeni sohbet önceki parçayı (ad, palet, spec) bilmez.
// Bu yüzden tüm parçalar sıralı adımlarla tek bir pakete toplanır: tek paylaşım, tek sohbet, tutarlı ürün.
//
// Dil düzeni: paketin istek kısmı (dil kuralı, ABD kuralları, adımlar, araç notları) Türkçedir; yapay zekâ satıcıyla
// Türkçe konuşur ve ondan istediği her işi Türkçe yazar. "---" çizgisinden sonraki teknik şartname İngilizcedir, çünkü
// ürüne aynen girecek metinleri, ölçüleri ve görsel tariflerini birebir verir; ürün Amerikan İngilizcesiyle yapılır.
export interface MasterPromptInput {
  name: string;
  productLabel: string;
  specName: "Product spec" | "Design spec";
  filesBrief: string;
  artPrompts?: string[];
  // Brief B'nin başındaki ortak kurallar (çözünürlük, stil, referans yasağı).
  artNotes?: string[];
  renderPrompt?: string;
  adVisuals: AdVisual[];
  pins?: Array<{ title: string; description: string; overlay: string }>;
  checklist: string[];
  // Kodla çalıştırılacak kalite protokolü (qa-protocol.ts); çıktısı yapıştırılmadan adım bitmez.
  qa?: string[];
  // Satıcının seçtiği yapay zekâ: paket o aracın yapabildiğine göre yazılır (Claude fotoğraf üretmez, vektör çizer).
  assistant?: "chatgpt" | "claude";
  // Türün Türkçe adı (giriş cümlesi) ve ABD pazarı kuralları (us-market.ts, Türkçe).
  productLabelTr?: string;
  usRules?: string[];
  // Ürünün temasına uyan ilan görseli süsü (decor.ts); kodla, kenarlara çizilir.
  decor?: string;
}

// Teknik şartnamenin başladığı çizgi; otomatik denetim Türkçe ve İngilizce kısmı buradan ayırır.
export const SPEC_DIVIDER = "---";

function toolNotes(assistant: MasterPromptInput["assistant"], hasArt: boolean): string[] {
  const chatgpt = "- ChatGPT: görselleri yerleşik görsel aracınla üret, dosyaları Python ile kur (ör. reportlab ya da HTML'den PDF; tablo için openpyxl, sunum için python-pptx, belge için python-docx) ve indirme bağlantısı ver.";
  if (assistant === "chatgpt") return [chatgpt];
  const claude = [
    hasArt
      ? "- Claude: fotoğraf ya da piksel tabanlı görsel üretemezsin. Brief B'deki her görseli kodla, spec paletinde temiz vektör SVG olarak çiz ve belirtilen ölçüde PNG'ye çevir. Dosyaları kendi kod ve dosya araçlarınla kur, indirme bağlantısı ver."
      : "- Claude: fotoğraf ya da piksel tabanlı görsel üretemezsin. Dosyaları kendi kod ve dosya araçlarınla kur (HTML, SVG, PDF, XLSX, PPTX veya DOCX), çizimleri temiz vektör SVG olarak yap ve indirme bağlantısı ver.",
    ...(hasArt ? ["- Bir stil vektörle iyi çizilemiyorsa (ör. suluboya ya da fotoğraf gibi doku) bunu görsel adımında bana Türkçe söyle ve Brief B promptlarını spec değerleri doldurulmuş hâlde ver; görselleri bir görsel aracında yapıp bu sohbete yüklerim."] : []),
    "- İlan görselleri: önizleme, düz serim (flat lay) ve ölçü görsellerini gerçek sayfalardan kodla kendin kur. Fotoğraf gibi sahneler için her promptu spec değerleri doldurulmuş hâlde, İngilizce ver; ben bir görsel aracında çalıştırırım."
  ];
  if (assistant === "claude") return claude;
  return [chatgpt, "- Claude: fotoğraf üretemezsin. Dosyaları dosya araçlarınla kur (HTML, SVG, PDF, XLSX, PPTX veya DOCX), çizimleri temiz vektör SVG olarak yap. Fotoğraf adımlarında promptları spec değerleri doldurulmuş hâlde, İngilizce ver; ben bir görsel aracında çalıştırırım."];
}

export function buildMasterPrompt(input: MasterPromptInput): string {
  const spec = input.specName;
  const pinVisual = input.adVisuals.find((visual) => visual.aspect.startsWith("2:3"));
  const claude = input.assistant === "claude";
  const hasArt = Boolean(input.artPrompts?.length);
  const realProduct = input.renderPrompt ? "Brief R'deki renderlardaki ürün" : "bu sohbette yapılan gerçek sayfalar";
  // Sanat gerektiren türlerde dosyalar görselleri yerleştirdiği için önce görseller üretilir.
  const steps: Array<{ title: string; body: string }> = [
    { title: `Önce ${spec}`, body: `Paketin tamamını oku. Hiçbir dosyadan önce Brief A'da tarif edilen ${spec} JSON'unu yaz; JSON'daki değerler İngilizcedir. Bu JSON tek doğru kaynaktır: sonraki her dosya ve görsel ona birebir uyar (ad, palet hex kodları, yazı tipleri, sayfa veya motif listesi, sayılar). Bir değişiklik istersem önce JSON'u güncelle ve yeniden göster. Ürün dosyaları bitince son JSON'u tekrar göster.` }
  ];
  if (hasArt) steps.push({ title: "Görseller", body: claude
    ? "Brief B'deki görselleri kodla temiz vektör SVG olarak, her yanıtta bir tane çiz; Brief B'nin başındaki kurallara uy, spec paletini ve tek tutarlı stili kullan ve her birini PNG'ye çevir. Adlarını Brief B sırasıyla art-01.png, art-02.png diye koy; hangisinin nereye gideceğini 1. adımdaki sayfa planı söyler."
    : "Brief B'deki görselleri her yanıtta bir tane olacak şekilde üret; Brief B'nin başındaki kurallara uy, spec paletini ve tek tutarlı stili kullan. Adlarını Brief B sırasıyla art-01.png, art-02.png diye koy; hangisinin nereye gideceğini 1. adımdaki sayfa planı söyler." });
  steps.push({ title: "Ürün dosyaları", body: "Ürün dosyalarını Brief A'da yazdığı gibi, geçiş geçiş (PASS 1, 2, 3) kur. Her formatı teslim et; hiçbiri eksik olmasın. Adımı bitirmeden önce bitmiş dosyalarda Otomatik QA betiğini çalıştır, çıktısını aynen yapıştır, her FAIL satırını düzelt ve sonucu bana Türkçe kısaca anlat. Sonra Brief A'daki Etsy yükleme setini (en fazla 5 dosya, her biri 20 MB'den küçük) içeren TEK bir indirme zip'i ver ki hepsini bir kerede indireyim. Kod çalıştıramıyor ya da dosya oluşturamıyorsan bunu adımın başında Türkçe söyle, eksiksiz dosya içeriğini (ör. PDF olarak kaydedebileceğim baskıya hazır HTML) ver ve otomatik kontrolü UNVERIFIED olarak işaretle; yapılmamış testlere PASS yazma ve ürünü satışa hazır sayma." });
  if (input.renderPrompt) steps.push({ title: "Ürün renderları", body: `Brief R'deki renderları her yanıtta bir tane olacak şekilde üret. 1. adımdaki ${spec} JSON'unun renklerini, stilini ve bitmiş ölçüsünü kullan; tam sayılar şemalarda ve çizimlerde kalır.` });
  steps.push({ title: "İlan görselleri", body: claude
    ? `Brief C'deki ilan görsellerini sırayla yap: önizleme, düz serim ve ölçü görsellerini ${input.renderPrompt ? "renderlardan" : "bu sohbette yapılan gerçek sayfalardan"} kodla kur; fotoğraf gibi her sahne için spec değerleri doldurulmuş İngilizce promptu ver ve altına bir satır Türkçe açıklama yaz, ben bir görsel aracında çalıştırayım. Başka satıcıların ya da internetin görsellerini asla kullanma. Görsel aracına yazı, harf veya logo çizdirme; ben görseli yükleyince başlığı Brief C'nin başlık kurallarıyla kodla sen eklersin.`
    : `Brief C'deki ilan görsellerini sırayla, her yanıtta bir tane üret. Görselde görünen ürün ${realProduct} olmalı. Onları görsel olarak göremiyorsan benden Türkçe olarak 2-3 ekran görüntüsü yüklememi iste; başka satıcıların ya da internetin görsellerini asla kullanma. Görsel aracına yazı, harf veya logo çizdirme (görsel modelleri yazıyı bozar); görsel bitince Brief C'deki başlığı, Brief C'nin başındaki başlık kurallarıyla kodla (Python Pillow) ekle ve bitmiş görseli ver.` });
  if (input.pins?.length && pinVisual) steps.push({ title: "Pinterest görselleri", body: claude
    ? `Brief D'deki her pin için C${pinVisual.slot} görseline dayanan, spec değerleri doldurulmuş 2:3 dikey bir görsel promptu ver (İngilizce, altında bir satır Türkçe açıklama); pinler birbirinden farklı görünsün diye sahneyi her pinin konusuna göre değiştir ve üstteki %30'u başlık için boş bırak; görseli yükleyince başlığı kodla sen eklersin.`
    : `Brief D'deki her pin için C${pinVisual.slot} görseline dayanan 2:3 dikey bir görsel üret; pinler birbirinden farklı görünsün diye sahneyi her pinin konusuna göre değiştir. Üstteki %30'u boş bırak ve pinin başlığını Brief C'nin başlık kurallarıyla kodla ekle.` });
  steps.push({ title: "Son kontrol", body: input.qa?.length
    ? "Son yükleme setinde Otomatik QA betiğini yeniden çalıştır, çıktısını yapıştır, sonra Final checklist'i kontrol et. Ürüne hazır demeden önce her şey geçmeli. Sonucu bana Türkçe özetle: geçenler, düzelttiklerin ve benim yapmam gerekenler."
    : "Her şeyi Final checklist'e göre kontrol et ve bana Türkçe yaz: geçenler ve hâlâ düzeltilmesi gerekenler." });

  const briefs = ["A", ...(hasArt ? ["B"] : []), ...(input.renderPrompt ? ["R"] : []), "C", ...(input.pins?.length ? ["D"] : [])];
  const lines = [
    `# ${input.name} - eksiksiz ürün paketi (GXL Market Studio)`,
    "",
    `Bu paket Etsy'de ABD'li alıcılara satılacak özgün bir ürün içindir: ${input.productLabelTr ? `${input.productLabelTr.replace(/\s*\(.*\)$/, "")} ("${input.productLabel}")` : `"${input.productLabel}"`}. Bütün adımları BU sohbette, sırayla yap; böylece ürün adı, palet, yazı tipleri ve ${spec} her dosyada ve görselde aynı kalır. İşi başka sohbetlere bölme.`,
    "",
    "## Dil kuralı (zorunlu)",
    "- Benimle her zaman Türkçe konuş: adım özetleri, sorular, açıklamalar, QA sonuçlarının yorumu ve benden istediğin her iş (ör. ekran görüntüsü yüklemem, bir promptu görsel aracında çalıştırmam, beğenmediğim bir görseli değiştirmeni istemem) Türkçe olsun. Benim yapmam gereken işleri kısa, numaralı Türkçe adımlarla yaz.",
    `- Ürüne giren her şey Amerikan İngilizcesiyle olur: dosyalardaki bütün yazılar, sayfa ve sekme adları, dosya adları, ${spec} JSON değerleri, görsellerdeki yazılar, görsel promptları, ilan ve pin metinleri. Ürüne tek bir Türkçe kelime ya da Türkçe harf (ç, ğ, ı, ö, ş, ü) girmez.`,
    `- Aşağıdaki teknik şartname (${briefs.map((brief) => `Brief ${brief}`).join(", ")}${input.qa?.length ? ", Automated QA" : ""} ve Final checklist) bu yüzden İngilizce yazıldı: ürüne aynen girecek metinleri, ölçüleri ve görsel tariflerini birebir verir. Onu harfiyen uygula; tırnak içindeki İngilizce ifadeleri çevirme ve değiştirme.`,
    "- Görsel aracında çalıştırmam için bana bir prompt verirsen promptu İngilizce yaz, altına bir satır Türkçe ne olduğunu açıkla.",
    ...(input.usRules?.length ? ["", "## ABD pazarı kuralları (eyalet farkları dahil)", ...input.usRules.map((rule) => `- ${rule}`)] : []),
    "",
    "## Nasıl çalışacağız",
    "- Adımları sırayla ve kendiliğinden yap; adımlar arasında onay bekleme, bir adım bitince aynı yanıtta sonrakine geç. Yalnız üç durumda dur: benden bir şey gerekiyorsa (ör. görsel yüklemem ya da bir görsel aracında prompt çalıştırmam), bir karar vermem gerekiyorsa ya da yanıt sınırına geldiysen.",
    "- Durduğunda son satırın şu olsun: \"ADIM n TAMAM - devam etmek için 'devam' yaz\" (adım yarımsa \"ADIM n devam ediyor - sürdürmem için 'devam' yaz\"); 'devam' ya da 'next' yazınca kaldığın yerden sürdür. Ben yazmadan devam edemediğin için durduğunda asla 'senden işlem gerekmiyor' deme. Gereksiz yere durma ve 'devam' isteme.",
    "- Her adımın sonunda bana Türkçe kısa bir özet ver: ne yaptın, hangi dosyalar hazır ve varsa benim ne yapmam gerekiyor.",
    "- Donmamak için işi küçük parçalara böl ama her parçada durma: her sayfayı elle yazma; bütün sayfaları veriden üreten tek bir Python betiği yaz (ör. reportlab). Önce 2 sayfalık deneme çıktısıyla düzeni kontrol et, sonra kalan sayfaları 10-15 sayfalık parçalar hâlinde AYNI YANIT İÇİNDE art arda çalıştır ve her parçayı hemen diske kaydet. Bir parça bitince rapor verip durma; sıradaki parçayı hemen çalıştır. Bir çalıştırma 1-2 dakikadan uzun sürerse yalnız o parçayı küçült. Yazı tiplerini ve görselleri bir kez hazırla, sonra yeniden kullan.",
    "- Yanıt yarıda kesilir ya da sohbet donarsa ben 'kaldığın yerden devam et' yazarım: baştan başlama. Spec JSON'unu ve diske kaydettiğin dosyaları kullanıp eksik parçadan sürdür; dosyalar kaybolduysa bunu Türkçe söyle ve yalnız eksik olanları yeniden kur.",
    ...steps.map((step, index) => `- ADIM ${index + 1} - ${step.title}: ${step.body}`),
    "",
    "## Araç notları",
    ...toolNotes(input.assistant, hasArt),
    "",
    "# Teknik şartname (İngilizce: ürüne aynen giren metin, ölçü ve görsel tarifleri)",
    SPEC_DIVIDER,
    "## Brief A - product files",
    // Brief içindeki başlıklar bir alt düzeye iner; paketin kendi bölümleriyle karışmaz.
    input.filesBrief.trim().replace(/^## /gm, "### ")
  ];
  if (hasArt) {
    lines.push("", "## Brief B - artwork (one image per reply)", ...(input.artNotes || []).map((note) => `- ${note}`), ...(input.artPrompts || []).map((prompt, index) => `B${index + 1}. ${prompt}`));
  }
  if (input.renderPrompt) {
    lines.push("", "## Brief R - product renders (one image per reply)", input.renderPrompt.trim());
  }
  lines.push("", "## Brief C - listing images and separate marketing visuals (one per reply, in this order)",
    // Etsy'de en çok tıklanan kapaklar: tek net ürün, 3-6 kelimelik fayda başlığı, küçük bir sayı rozeti, sade arka plan.
    "Channel and delivery map: C1-C10 are the ten Etsy gallery images. Upload them in this order: C1, C4, C2, C3, C5, C6, C7, C8, C9, C10. Name them listing-01.jpg through listing-10.jpg in that upload order. C11 is the Pinterest reference and C12 is the social ad; save marketing assets separately, never as Etsy buyer download files or gallery substitutes.",
    "Headline rules (every image that has a headline):",
    "- Make the image first with no text at all, then add the headline in code (Python Pillow) in the clean area the prompt leaves for it; never let the image tool draw letters.",
    "- Use the bold heading font from the spec, exactly the words given, in capital letters; the headline height is at least 7% of the image height so it reads on a phone thumbnail.",
    "- Use a palette color with at least 4.5:1 contrast, or place it on a soft rounded band in a palette color; at most one small badge (for example a page or question count) besides it.",
    "- Stand out from competitors at thumbnail size: on the cover (C1) the headline is 2-5 words and at least 10% of the image height, the real product pages fill at least 55% of the frame (a fanned stack or a large screen, never small papers in a big empty scene), and the background is one bold palette color, not beige-on-beige. No text anywhere in an image is smaller than 3% of the image height; if a line would be smaller, cut the words instead. Never crop a page title or headline at an edge.",
    "- Before you hand over the images, put all of them side by side at 400 px wide and check each one: the headline reads at that size, the product is the biggest thing, every count matches the files, and no two images look alike. Redo any image that fails.",
    "- Keep the composition uncluttered: one clear hero, real product visible, no stickers, arrows or extra words. Treat this as a thumbnail-readability goal, not a proven sales claim.",
    "- If the headline needs two lines, break it at the separator (\"·\" or \"|\") and drop the separator; no line starts or ends with a separator.",
    "- Never draw a software or brand logo or an app icon (for example the PowerPoint, Word, Excel or PDF reader icons); program names appear only as plain text.",
    "- Every number in a headline or badge matches the files exactly (questions, bonus questions, slides, pages); count them in the files before writing it.",
    "- After adding it, read the headline back with OCR and fix any spelling difference.");
  if (input.decor) lines.push(
    "Decorations (every listing image, drawn in code with Pillow after the headline is placed):",
    `- Draw ${input.decor} as simple flat shapes in the spec palette, only along the edges and in the corners; the cover (C1) gets the fullest set, the other images small corner accents.`,
    "- Decorations never cover the product, the headline, a badge or any text; they take at most about 15% of the image, and the real product stays the hero, unchanged.",
    "- No characters, mascots, animals, logos, app icons or words in the decorations; check the finished image at thumbnail size and remove any decoration that touches the product or the text.");
  for (const visual of input.adVisuals) {
    lines.push(`### C${visual.slot}. ${visual.titleEn} - ${aspectEn(visual.aspect)}`, `Used for: ${visual.useEn}${visual.overlay ? `. Headline (add in code): "${visual.overlay}"` : ""}`, visual.prompt, "");
  }
  if (input.pins?.length) {
    lines.push("## Brief D - Pinterest pins");
    input.pins.forEach((pin, index) => lines.push(`D${index + 1}. Title: ${pin.title}`, `Description: ${pin.description}`, `Headline (add in code): ${pin.overlay}`, ""));
  }
  if (input.qa?.length) lines.push("## Automated QA (mandatory, run with code)", ...input.qa, "");
  lines.push("## Final checklist", ...input.checklist.map((item) => `- ${item}`));
  return lines.join("\n");
}

// Paketi Türkçe istek kısmı ve İngilizce teknik şartname olarak ikiye ayırır (otomatik denetim için).
export function splitMasterPrompt(prompt: string): { requestTr: string; specEn: string } {
  const lines = prompt.split("\n");
  const index = lines.indexOf(SPEC_DIVIDER);
  return index < 0 ? { requestTr: "", specEn: prompt } : { requestTr: lines.slice(0, index).join("\n"), specEn: lines.slice(index + 1).join("\n") };
}

// "4:3 yatay · 3000x2250 px" → "4:3 landscape, 3000x2250 px"
function aspectEn(aspect: string): string {
  return aspect.replace(/yatay/g, "landscape").replace(/dikey/g, "portrait").replace(/kare/g, "square").replace(/hikâye için/g, "story").replace(/ · /g, ", ");
}
