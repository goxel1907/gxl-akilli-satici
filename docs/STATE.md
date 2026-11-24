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
- (Eski, 9 Kasım) Kargo alıcıya aitti; 11 Kasım'da değişti (aşağıda).
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
- Fiziksel ilan sonucu ekranında "ChatGPT / Claude ile ilan metnini güçlendir": talimata Etsy rakip verisi gider, yanıt
  (GXL_PHYSICAL_LISTING_V1: başlık, 13 etiket, tanıtım paragrafı) denetlenip uygulanır; fiyat/kargo/teslim bölümleri uygulamada kalır.
  Sunucu taslakta marka/telif adı ve doğrulanmamış gümüş/altın iddiasını engeller ("gold tone" serbest).
- Fiziksel tam ilan sohbetten (GXL_PHYSICAL_FULL_V1): 1. adımda "Tüm ilan talimatını paylaş" → ChatGPT/Claude fotoğraf+video,
  birkaç soru, araştırma, başlık/13 etiket/tanıtım, ABD fiyatı, kargo tahmini, kapak ve görseller → JSON "Tüm boşlukları doldur".
  USD öneri /api/products/net-from-price ile "Elinize geçecek" TL'ye çevrilir. Metin ilan ekranında malzeme onayıyla yeniden denetlenir.
- 10 Kasım 22:58 hatası: ChatGPT Türkçe başlık verdi ve görsel aracı başka bir tesbih çizdi. Artık başlık/etiket/tanıtım
  İngilizce değilse reddedilir ("Türkiye" serbest); fiziksel ürün görselleri yalnız Python koduyla düzenlenir (görsel aracı yasak).
- 11 Kasım (gümüş tesbih denemesi): Etsy kategorisi "Hair Beads & Cuffs" seçiliyordu → tesbih her zaman "prayer beads",
  kategori tam ad → son iki → son kelime, saç/craft supplies cezalı. İade politikası yoksa taslakta Etsy standardı (30 gün)
  oluşturulur. Sunucu Türkçe başlık/etiketi reddeder; Türkçe "İngilizce ad" yok sayılır ("gm tesbih" olmaz).
  Kapak: kodla kesip stüdyo zeminine koyma (GrabCut). Kargo: Shipentegra "Fiyat Hesapla" teklifi.
- KARGO KARARI (11 Kasım, kullanıcı): kargoyu satıcı öder (Shipentegra), ücret ürün fiyatına eklenir, alıcı "Free shipping" görür.
  computePricing kargoyu başabaşa ekler; açıklama "Free shipping to the US with a tracking number"; kargo profili ücretsiz (0) açılır;
  taslak ABD ücreti 0 olan profili seçer, ücretli profil varsa uyarır. net-from-price kargoyu düşer.
- 11 Kasım akşam (siyah mine tesbih denemesi): Etsy taslağında yayın için zorunlu alanlar eksik kalıyordu. Artık taslakta
  hazırlık süresi (processing) profili yoksa oluşturulur (hazır: 1-3, siparişe: 5-10 gün); "Etsy'de yayınla" önce ilanı okur,
  eksik iade politikası/hazırlık süresi/kargo profilini PATCH ile tamamlar, kategori/kim yaptı/fotoğraf eksikse açıkça söyler.
  Açıklamada Türkçe harf varsa taslak gönderilmez. Tam ilan JSON'u origin (1-4 numaralı soru) ve hallmarkConfirmed taşır;
  Goxi "kim yaptı" yanıtsızsa bunu adıyla ister.
- "Bu ilana reklam ver" (12 Kasım): ilan karnesi, Dijital ürün kartı ve fiziksel taslak kutusunda. Etsy API'de reklam yok:
  uygulama ilana özel karar/bütçe/durdurma kuralını (marketing-plan etsy_ads) gösterir, etsy.com/listing/{id} açar
  (Seller listing tools → Promote). Ödeme ve Start satıcıda.
- 24 Kasım: Dijital yüklemede 503 (5 duvar posteri ZIP'i + 10 görsel). Neden: ürün kaydı 5 ZIP'i yeniden açıp denetliyordu
  (Cloudflare işlem süresi sınırı). Artık denetim parça yüklemede bir kez; 2.5 MB üstünde hafif (ZIP içerik listesi, tehlikeli
  dosya, PDF sonu), sonuç parça kaydında saklanır; kayıt dosyayı tek okuyup tek yazar. KV günlük sınırı dolunca açık mesaj
  (STORAGE_LIMIT). Telefon parçayı bir kez yeniden dener ve "Dosya 3/5 gönderiliyor" gösterir.
- 24 Kasım (2): Dijital kapak rakiplerden ayrışır. color-standout.ts rakip başlık/etiketlerindeki renkleri sayar (her ilan bir kez);
  kapak zemini bunlardan ton olarak uzak, temaya uygun doygun renk (hex ile) olur. Seed paleti rakip renklerini kopyalamaz
  (yalnız aranan ifadedeki renk kalır; örgü kalıplarında iplik rengi korunur), stillere canlı paletler eklendi.
  Hız: basılı/dijital türlerde yalnız C1 zemini, C2 ve C6 görsel aracıyla; C3-C5, C7-C12 gerçek dosyalardan tek Python
  betiğiyle aynı yanıtta (AdVisual.tool). Pin/reklam C1 backdrop.png'yi yeniden kullanır.
- 24 Kasım (3): Satış göstergeli rakip analizi (sales-proof.ts): listings/batch (Shop, Images, Videos) + ilan yorum sayısı;
  liderler yorum sayısına göre sıralanır, salesEvidence "proxy". İlk sayfa kapaklarının gerçek ton ölçümü kapak rengine girer.
  Fiziksel planda da salesProof döner. Öneri akışında yorum sorgusu 3 (Cloudflare dış çağrı sınırı).
  Gemini üçüncü üretim aracı (assistants.ts): paket, fotoğraf/tam ilan/denetim talimatları, sohbet bağlantısı gemini.google.com/app.
  Ajan ekibi (agent-team.ts, AgentTeam.tsx): üyelik ve "kredisi az" işaretine göre üretici/görselci/denetçi; denetçi ajan
  GXL_LISTING_REVIEW_V1 JSON'u verir, uygulama başlık/13 etiket/açılış paragrafını sayı ve dil denetiminden geçirip uygular.
- 24 Kasım (4): Ajan hattı (agent-pipeline.ts, AgentPipeline): dijitalde 15, fizikselde 13 ajan; her adımın sahibi Goxi
  (otomatik), ajan ekibindeki ChatGPT/Claude/Gemini ya da satıcı. Otomatik denetçi POST /api/agents/review (agent-review.ts):
  sunucu yapay zekâsı + 'rakipten iyi mi?' kapısı (beatCompetitors: arama ifadesi başta, 13 etiket, görsel sayısı, video,
  fiyat aralığı, sayı, YZ beyanı). Kredi paylaşımı: visualAssistant üreticiden farklıysa paket sahneleri o araca bırakır.
- 24 Kasım (5): Yükleme yeniden yazıldı. Satış dosyaları 4 MB ham parçalarla (/api/digital/upload-chunk; ücretsiz planda 10 ms
  işlemci sınırı 20 MB'lık form ayrıştırmasını düşürüyordu); baş/son parçadan denetim; dosya digital:chunked:<id>:<adet>.
  Görseller yüklemede medya deposuna, ZIP'ler kalıcı anahtara yazılır; ürün kaydı baytları okumaz (DigitalFile.key).
  Bağlanmayan parçalar 6 saat sonra silinir (digital:pending-part). Görseller telefonda 3000 px JPEG'e küçültülür.
  GXL klasörü (gxl-folder.ts, Android SAF, expo-file-system/legacy): ZIP/PDF ve görselleri ayırır, listing-images.zip'i
  fflate ile açar (jsOnly paket, APK gerekmez), yüklenenleri Yuklendi'ye taşır. Yüklemeden sonra Etsy taslağı kendiliğinden
  açılır (yayın satıcıda). Paket: satış dosyaları ayrı bağlantı, görseller listing-images.zip.
