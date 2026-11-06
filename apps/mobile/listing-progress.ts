export interface ListingProgressInput {
  phase: "studio" | "upload" | "saved";
  planReady?: boolean;
  ownPattern?: boolean;
  assistant?: "claude" | "chatgpt";
  qaOk?: boolean;
  files?: number;
  images?: number;
  tested?: boolean;
  title?: string;
  description?: string;
  tags?: string[];
  priceUsd?: string | number;
  priceTry?: string | number;
  etsy?: { listingId?: number; fileUploaded?: boolean; filesUploaded?: number; imagesUploaded?: number; error?: string };
  verifiedState?: string;
}
export interface ListingProgress { step: number; title: string; instruction: string; complete: boolean; }
export function etsyTransferComplete(input: ListingProgressInput): boolean {
  const files = input.files || 0;
  const images = input.images || 0;
  return Boolean(input.etsy?.listingId && input.etsy.fileUploaded && files && images
    && (input.etsy.filesUploaded ?? (files === 1 ? 1 : 0)) >= files && (input.etsy.imagesUploaded || 0) >= images);
}
export function listingProgress(input: ListingProgressInput): ListingProgress {
  const step = (number: number, title: string, instruction: string, complete = false) => ({ step: number, title, instruction, complete });
  if (input.phase === "saved" && input.qaOk === false) return step(3, "Dosyaları düzelt ve yeniden denetle", "Dosya denetiminde hata var. Rapordaki dosyayı veya eksik formatı düzelt; doğru paketi yeniden yükle. Başarılı sonuç almadan Etsy aktarımına geçme.");
  if (input.phase === "saved" && input.verifiedState === "active") return step(5, "Etsy’de yayında olduğu doğrulandı", "Etsy’den alınan son durum aktif. İlanı açıp alıcının gördüğü başlığı, fiyatı, görselleri ve dosya açıklamalarını kontrol et.", true);
  if (input.phase === "studio") return input.planReady
    ? input.ownPattern
      ? step(2, "Kendi denenmiş deseninin dosyalarını hazırla", "Kendi yazıp bizzat uyguladığın son desen PDF’ini ve bitmiş ürünün gerçek fotoğraflarını telefonuna al. İlan yardımını kendi dosyalarınla karşılaştır; deseni yapay zekâya yazdırma.")
      : step(2, "Ürünü üret ve son dosyaları indir", `Tek paketi ${input.assistant === "claude" ? "Claude’a" : input.assistant === "chatgpt" ? "ChatGPT’ye" : "seçtiğin ChatGPT veya Claude’a"} gönder. Aynı sohbette üretimi tamamlat; son dosyaları ve gerçek içeriğe ait ilan görsellerini telefonuna indir. Paylaşmak, dosyaların üretildiği anlamına gelmez.`)
    : step(1, "Araştır ve ilanı hazırla", input.ownPattern ? "Kendi deseninin ürününü seç. Yazarlık, bizzat uygulama ve gerçek fotoğraf onaylarını tamamla; ardından kendi desenin için ilanı hazırla." : "Ürün türünü ve hedef Etsy aramasını seç. Rakip analiziyle başlık, açıklama, 13 etiket ve önerilen fiyatı birlikte hazırla.");
  if (!input.files) return step(2, "Satılacak dosyaları seç", "İndirdiğin son PDF veya ZIP dosyalarını ekle. Dış indirme paketini gerekiyorsa aç; Etsy’ye verilecek dosyaları seç.");
  if (!input.images) return step(3, "İlan görsellerini ekle", "En az bir görsel ekle. İlk görsel ürünü açıkça göstermeli; önizlemelerde satılan dosyaların gerçek sayfaları yer almalı.");
  if (input.phase === "upload") {
    if (!input.tested) return step(3, "Son dosyaları dene", "Ürününe uygun açma, baskı veya bağlantı kontrollerini tamamla. Kontrol etmeden test onayını işaretleme.");
    const tags = input.tags || [];
    const price = (value: unknown) => { const number = Number(String(value || "").replace(",", ".")); return Number.isFinite(number) && number > 0; };
    if (!input.title?.trim() || input.title.length > 140 || !input.description?.trim() || tags.length !== 13 || new Set(tags.map(tag => tag.trim().toLowerCase())).size !== 13 || tags.some(tag => !tag.trim() || tag.length > 20) || !price(input.priceUsd) && !price(input.priceTry)) return step(3, "İlan bilgilerini kontrol et", "Başlık, açıklama, 13 geçerli etiket ve pozitif fiyat gerekli. Hazır gelen bilgileri ürünün son dosyalarıyla karşılaştır.");
    return step(3, "Kaydetmeye hazır", "Dosyalar, görseller ve ilan bilgilerini gözden geçirip yükle. Kaydetmek Etsy’de ilan yayımlamaz.");
  }
  if (!etsyTransferComplete(input)) return input.etsy?.listingId
    ? step(4, "Etsy aktarımını tamamla", "Dosya veya görsel aktarımı tamamlanmamış. ‘Etsy yüklemesini tamamla’ ile yeniden dene; aynı taslaktan devam edilir.")
    : step(4, "Etsy taslağını oluştur", "Kaydedilen başlık, açıklama, etiket, fiyat, dosya ve görselleri Etsy’ye taslak olarak gönder. Ardından taslağı Etsy’de aç.");

  return step(5, "Etsy’de son kontrol ve yayın", "Taslağı aç. Dosyaları, görsel sırasını, fiyatı, kategoriyi ve gerekiyorsa yapay zekâ açıklamasını kontrol et. Etsy’de yayınladıktan sonra buradan yayın durumunu denetle.");
}

export function listingTasks(input: ListingProgressInput): string[] {
  const guide = listingProgress(input);
  if (input.qaOk === false) return ["Dosya denetimindeki hata satırlarını oku.", "Hatalı dosyanın son sürümünü düzeltip telefonuna indir.", "Doğru dosyalarla yüklemeyi ve denetimi tekrarla."];
  if (guide.complete) return ["Alıcıya görünen ilanı aç ve son kez kontrol et.", "Gerçek ziyaret ve sipariş sonuçlarını Etsy istatistiklerinden izle."];
  if (guide.step === 1) return input.ownPattern ? ["Desenin sana veya mağaza üyene ait olduğunu doğrula.", "Deseni uygulayıp bitmiş ürünün gerçek fotoğraflarını hazırla.", "Ürün bilgilerini girip ilan hazırlama düğmesine bas."] : ["Ürün türünü, konuyu ve hedef Etsy aramasını gir.", "İstersen karşılaştırılacak rakip ilan bağlantılarını ekle.", "Hazırlanınca rakip örneklemini ve önerilen fiyatı incele."];
  if (input.phase === "studio") return input.ownPattern ? ["Son desen PDF’ini kendi ölçülerinle karşılaştır.", "Bitmiş ürünün gerçek fotoğraflarını seç.", "Dosyaların hazırsa yükleme formuna geç."] : ["Paketi seçtiğin asistana bir kez gönder; aynı sohbetten devam et.", "Ürün dosyalarını ve ilan görsellerini indir; gerekiyorsa dış ZIP’i aç.", "Dosyaları açıp kontrol ettikten sonra yükleme formuna geç."];
  if (guide.step === 2) return ["Telefonundaki İndirilenler klasörünü aç.", "Bu ürüne ait son PDF/ZIP dosyalarını seç; en fazla 5 dosya."];
  if (guide.step === 3) return ["Satılan son dosyaların gerçek önizlemelerini ekle; ilk görsel kapaktır.", "Dosyaları hedef uygulamada aç; ürüne uygun baskı veya işlev kontrolünü yap.", "Başlık, açıklama, 13 etiket ve fiyatı karşılaştır; sonra kaydet."];
  if (guide.step === 4) return ["Dosya denetimi sonucunu incele; hata varsa önce düzelt.", "Taslak oluşturmayı onayla; kesilen aktarımı aynı taslaktan tamamla.", "Taslak kaydı henüz yayında ilan değildir."];
  return ["Etsy taslağını aç; kategori, fiyat, görsel sırası ve dosyaları kontrol et.", "Etsy’de yayınlama işlemini tamamla.", "Buraya dönüp ‘Yayın durumunu denetle’ düğmesine bas."];
}

export function physicalListingProgress(input: { wizardStep?: number; photos: number; kind: string; name: string; price?: number; shipping?: number }): ListingProgress {
  const number = input.wizardStep || (!input.photos ? 1 : !input.kind || input.name.trim().length < 3 ? 2 : !input.price || !input.shipping ? 4 : 5);
  const titles = ["Önce ürününün gerçek fotoğraflarını ekle", "Ürünün bilgilerini doğrula", "Renk ve özellikleri ekle", "Net tutarı ve ABD kargosunu yaz", "Rakipleri araştırıp ilanı hazırla"];
  const instructions = ["Galeriden seç veya fotoğraf çek. Ön, arka, detay ve ölçü kareleri kullan; ilk fotoğraf kapaktır. ChatGPT/Claude fotoğraf analizi isteğe bağlıdır.", "Ürün türünü, Türkçe adını, kimin yaptığını ve bildiğin malzemeleri yaz. Sohbet analizinden aktarabilirsin; emin olmadığın bilgiyi doğrulanmış sayma.", "Renkleri ve öne çıkan gerçek özellikleri Türkçe, virgülle ayırarak yazabilirsin. Bu adım isteğe bağlıdır.", "Elinde kalmasını istediğin net tutarı ve paketli ürün için gerçek ABD kargo teklifini TL olarak gir. Bilinmeyen kargoyu tahmin ederek geçme.", "Etsy araştırmasını başlat. Hazırlanan başlık, açıklama, 13 etiket, fiyat ve kural kontrolünü incele; sonra taslak aşamasına geç."];
  return { step: number, title: titles[number - 1], instruction: instructions[number - 1], complete: false };
}
