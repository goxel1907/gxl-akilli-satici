export interface ListingProgressInput {
  phase: "studio" | "upload" | "saved";
  planReady?: boolean;
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
  if (input.phase === "saved" && input.verifiedState === "active") return step(5, "Etsy’de yayında olduğu doğrulandı", "Etsy’den alınan son durum aktif. İlanı açıp alıcının gördüğü başlığı, fiyatı, görselleri ve dosya açıklamalarını kontrol et.", true);
  if (input.phase === "studio") return input.planReady
    ? step(2, "Ürünü üret ve son dosyaları indir", "Tek paketi seçtiğin ChatGPT veya Claude’a gönder. Ürün dosyalarını ve gerçek sayfalardan hazırlanan ilan görsellerini tamamlatıp telefonuna indir.")
    : step(1, "Araştır ve ilanı hazırla", "Ürün türünü ve hedef Etsy aramasını seç. Rakip analiziyle başlık, açıklama, 13 etiket ve önerilen fiyatı birlikte hazırla.");
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
