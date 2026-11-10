# Son durum (her oturum sonunda güncelle; eskiyen satırları sil)

Güncelleme: 9 Kasım 2026

## Etsy
- Yayında: Christmas Trivia Game (listing 4610454145, 349.99 TL, Cream-Lamo-Trivia-Game-Slides.zip, 10 görsel).
- Tosery Wedding Planner: dosya denetimi geçti (Tosery-Wedding-Planner-PRODUCT-6-PDF.zip); Etsy durumu doğrulanmadı.
- Ivory Ogemora Christmas Games (parti oyunu, 18 oyun, US Letter + A4 + 5x7): ChatGPT'de üretildi, "Library file not found"
  ile ürün ZIP'i indirilemedi; elde 9 görsel var (listing-07 eksik). Görseller zayıf (küçük yazı, kırpılmış başlık).

## Açık işler
- Cream Uflevia Word Search (49 sayfa, US Letter + A4) ChatGPT'de üretiliyor; 9 Kasım 23:52'de 36/49 sayfa.
- 1. ilan: "Christmas" kişiselleştirme kutusu kaldırıldı mı, Holiday=Christmas seçildi mi — doğrulanmadı.
- Mağaza Headline virgül sonrası boşluk ("Calm, practical ...") — doğrulanmadı.
- Kaçış odası (christmas escape room) paketi hazır; ürün üretilmedi.
- Bildirim (e-posta/WhatsApp) altyapısı var, gönderici bağlı değil (Codex #69).

## Kalite güvenceleri (testlerde)
- category-offers-sweep.test.ts: 19 dijital türde rakip örneklemi + öneriler; başlıkta yanlış format/marka/test verisi yok.
- all-tabs-smoke.test.ts: uzman ve basit moddaki her sekme ve Etsy alt sekmesi hatasız açılıyor.

## Bu oturumda (Claude, 9 Kasım)
- Silme: Dijital ürün kartında "Uygulamadan sil"; kayıtlı çalışmada "Bu çalışmayı listeden sil" (Etsy'ye dokunmaz).
- Başlık: basılmayan ürünlerde (duvar kâğıdı, ikon, tablo, sunum, özgeçmiş) "printable pdf", sunum/tablo/ekran ürünlerinde kâğıt ölçüsü başlığa girmez.
- Fiziksel ürün: bebek/çocuk algılanır ("for women/gift for her" yerine baby…, CPSIA uyarısı); çanta/battaniyeye giyim etiketi yok; takıda 13 etiket dolar; açıklamada ABD teslim süresi (7-21 gün); "ay yıldız"/"nazar" çevirisi.
- Video: taslaktan sonra "Video ekle (5-15 sn)" → POST /api/etsy/listings/:id/video → Etsy (sunucuda saklanmaz).
- Fotoğraf analizi: Gemini → OpenAI → yoksa ücretsiz Cloudflare Workers AI (wrangler "ai" bağlaması, llama-3.2-11b-vision, lisans 'agree' otomatik).
- Kargo ALICIYA AİT (kullanıcı kararı): fiyata eklenmez; kargo profiline kesintiyi karşılayan tutar (buyerShippingTry) yazılır, Etsy alıcıya gösterir. Not: Etsy ABD'de 35$+ ücretsiz kargoyu aramada öne alır.
- Araştırma: arama türü söylemiyorsa tür kelimesi eklenir (sunum oyunu → "powerpoint"); "christmas trivia game" artık öneri alıyor.
- Görsel seçimi: dosyalardan seçme + ada göre doğal sıralama + ekleyerek seçme + temizle.
- Büyük dosyada (>2.5 MB) dosya denetimi hafif modda; sunucu düşerse taslağa devam edilebilir.
- Sunucu hata mesajı kod numaralı ve anlaşılır.
- Goxi kartı sade (görev listesi "Ayrıntılar" altında).
- Paket: adımlar arası onay beklenmez; kapak/görsel için rakipten sıyrılma kuralları.
- Talep önce: hasBuyerDemand (trend-priority.ts). Trend, Keşif, Sezon listelerinde, otomatik arama seçiminde, ilan önerilerinde
  ve ajan ürün fikirlerinde "Talep zayıf" aramalar önerilmez; listede "Talebi zayıf N … göster" düğmesiyle açılır.
- Goxi metinleri gerçek düğme adlarıyla yeniden yazıldı (dijital: dosya/görsel/denetim/taslak/video; fiziksel: otomatik doldur,
  alıcı öder kargo, kargo profili). Basit fiziksel sihirbazda "Fotoğraftan otomatik doldur" düğmesi var (yalnız basınca çalışır);
  ChatGPT/Claude sohbet kutusu katlı.
- Ekran kaydı (9 Kasım 23:48) incelendi: ChatGPT her 4 sayfada durup 'devam' bekliyordu. Paket artık parçaları aynı yanıtta
  art arda çalıştırır (her sayfayı elle değil, tek betikle üretir); GXL_PROGRESS JSON'u yalnız adım bitince eklenir.
- Trend: 45 altı puan "en iyi fırsat" sayılmaz; gruptaki tüm aramalar zayıfsa açıklama kartı çıkar (Tesbih/Vintage böyleydi).
- Not: Google Drive indirmesi için ortam ağına drive.google.com ve drive.usercontent.google.com eklendi.
- Kapak kuralları (10 Kasım, kullanıcı isteği): her kategoride kapak rakiplerden daha dikkat çekici. Dev başlık (%12+),
  temalı zengin zemin, en fazla 3 rozet (biri büyük sayı rozeti). Rakip hataları yasak: logo/uygulama adı, marka ve ünlü adı,
  insan fotoğrafı, kalabalık rozet, fiyat/indirim yazısı, abartılı sayı. Varsayılan palet artık bej değil.
- Goxi denetimi (10 Kasım): 4 fiziksel tür Goxi düğmesiyle uçtan uca, 19 dijital türün yükleme rehberi testte.
  Düzeltilenler: sihirbazda "kim yaptı" 2. adımda soruluyor; fotoğraftan sonra Goxi "sonraki adım" diyor; yarım aktarımda
  "Etsy yüklemesini tamamla"; test onayı "satılan her ölçüde"; kart türü 13 etiket; kargo yazıları alıcı öder ile uyumlu.
- Fotoğraf analizi hatası (10 Kasım 21:03, tesbih): Gemini anahtarı tanımlı ama hata veriyordu; yedeğe geçilmiyordu.
  Artık sağlayıcılar sırayla denenir (Gemini → OpenAI → ücretsiz Workers AI). Gemini hatasının nedeni Cloudflare loglarında
  "AI provider gemini failed" satırında görünür.
- Fiziksel ürün kapsamı (10 Kasım): kaşık, cüzdan, kartlık, kemer, anahtarlık, mum, mumluk, sabun, makrome, nazarlık, duvar süsü,
  kupa, peştemal, seccade, örtü, çini, toka, magnet, tablo; malzeme: seramik, porselen, ahşap, zeytin ağacı/zeytinyağı, keçe, taş,
  mermer, reçine, jüt, hasır, soya. "item" içeren arama ve "pot gift" gibi kopuk etiket yok. 1. adımda "ChatGPT/Claude ile
  güzelleştir" (ürün değişmez; ışık, renk, kırpma, arka plan).
