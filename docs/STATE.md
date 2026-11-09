# Son durum (her oturum sonunda güncelle; eskiyen satırları sil)

Güncelleme: 9 Kasım 2026

## Etsy
- Yayında: Christmas Trivia Game (listing 4610454145, 349.99 TL, Cream-Lamo-Trivia-Game-Slides.zip, 10 görsel).
- Tosery Wedding Planner: dosya denetimi geçti (Tosery-Wedding-Planner-PRODUCT-6-PDF.zip); Etsy durumu doğrulanmadı.
- Ivory Ogemora Christmas Games (parti oyunu, 18 oyun, US Letter + A4 + 5x7): ChatGPT'de üretildi, "Library file not found"
  ile ürün ZIP'i indirilemedi; elde 9 görsel var (listing-07 eksik). Görseller zayıf (küçük yazı, kırpılmış başlık).

## Açık işler
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
- Araştırma: arama türü söylemiyorsa tür kelimesi eklenir (sunum oyunu → "powerpoint"); "christmas trivia game" artık öneri alıyor.
- Görsel seçimi: dosyalardan seçme + ada göre doğal sıralama + ekleyerek seçme + temizle.
- Büyük dosyada (>2.5 MB) dosya denetimi hafif modda; sunucu düşerse taslağa devam edilebilir.
- Sunucu hata mesajı kod numaralı ve anlaşılır.
- Goxi kartı sade (görev listesi "Ayrıntılar" altında).
- Paket: adımlar arası onay beklenmez; kapak/görsel için rakipten sıyrılma kuralları.
