# GXL Akıllı Satıcı: proje hafızası (her oturumda önce bunu oku)

Kısa ve güncel tut. Ayrıntı için `docs/STATE.md` (son durum, açık işler) ve ilgili `docs/*.md`.
Token tasarrufu: bütün dosyayı okumadan önce `grep -n` ile yeri bul; App.tsx (~4300 satır) ve
printable-studio.ts büyük dosyalardır, yalnız gereken satır aralığını oku.

## Kim, ne
- Sahip: Türkçe konuşan satıcı (GXL Market Studio). Kullanıcıyla Türkçe, kısa ve sade konuş.
- Etsy mağazası: GXLMarketStudio (açık, para birimi TRY, konum Türkiye). Shopier'de gümüş tesbih.
- Ürün: dijital ürünler (planlayıcı, parti oyunu, sunum oyunu vb.). İçerik Amerikan İngilizcesi.

## Değişmez kurallar
- Kimlik, IBAN, kart, şifre, token sohbete ya da depoya yazılmaz. Anahtarlar yalnız Cloudflare/GitHub secrets'ta.
- Etsy'de satıcının yerine giriş yapma, ödeme yapma, yayınlama yok. Dijital ilanda uygulama yalnız TASLAK oluşturur.
- Marka/IP yok (Jeopardy, Family Feud, Grinch, Rudolph, Elf on the Shelf, Disney...). Görsellerde logo yok.
- İlan görselleri gerçek dosyayı gösterir; sayılar dosyalarla aynı; yapay zekâ beyanı açıklamada.
- Commit/PR'da model adı yok. Force push yok. main'e birleştirme: kullanıcı izni verdi ("birleştirme varsa birleştir").

## Depo ve yayın
- GitHub: goxel1907/gxl-akilli-satici. Claude dalı: `claude/busy-wright-ivbe3h`.
  Akış: dalda değiştir → test → commit → PR → "Workers Builds" kontrolü yeşil → squash merge (tam head sha ile)
  → `git merge origin/main` ile dalı eşitle. Codex/ChatGPT de main'e PR birleştiriyor (#50-#70); işe başlamadan
  `git fetch && git merge origin/main` yap, gerekirse `npm install`.
- Sunucu: Cloudflare Worker `gxl-akilli-satici-api` (apps/worker/src/index.ts), main'e merge ile kendiliğinden yayın.
- Telefon: Expo, apps/mobile/App.tsx (+ ListingMascot, ProductionTracker, ListingOfferPicker...). Sürüm 0.8.6,
  OTA güncelleme (Özet → Güncellemeyi denetle). Telefon kodu değişince kullanıcıya güncellemeyi söyle.
- Test: `npm test` (380 test, hepsi geçmeli), `npm run typecheck`. Testler gerçek ekranları render eder
  (apps/api/test/fixtures/mobile-ui); buton etiketi değişirse ilgili testi güncelle.

## Önemli dosyalar
- worker: printable-studio.ts (19 dijital tür, başlık/13 etiket/açıklama), master-prompt.ts (ChatGPT/Claude paketi),
  qa-protocol.ts, output-guard.ts, us-market.ts, decor.ts, digital-delivery.ts (yükleme, Etsy taslağı, USD→TL,
  dosya denetimi), pinterest.ts (manualOnly pinler), listing-scorecard.ts, etsy-setup.ts, shop-settings.ts, archive-qa.ts.
- Pinterest API onaysız: otomatik kapalı, "Elle paylaş" kullanılır.

## Kullanıcı tercihleri
- Ücretsiz araçlar. Fazla "devam" istenmesin. Görseller rakiplerden sıyrılsın (büyük başlık, ürün baskın).
- Goxi (ilan rehberi kartı) sade olsun; ayrıntı kapalı başlar.
- Fiziksel üründe kargoyu satıcı öder (Shipentegra), ücret fiyata eklenir; alıcı "Free shipping" görür (11 Kasım kararı).
- Her işten sonra kısa Türkçe özet: ne yapıldı, kullanıcı ne yapacak.
