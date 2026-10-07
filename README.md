# GXL Akıllı Satıcı

GXL Market Studio için ürün kategorisinden bağımsız, Android merkezli çok kanallı satış ve pazar fırsatı asistanı.

Sistem; serbest kategorili ürün kataloğu, pazar fırsatları, müşteri adayları, ilk temas onayı, onay sonrası otomatik konuşma, ürün önerisi, çok kanallı satış yönlendirmesi ve insan devralma kurallarını tek yerde toplar.

Güncel kanal önceliği Etsy'dir; Shopier ve Letgo ikinci plandadır. Uygulama Etsy sekmesiyle açılır. Etsy kanalı hobi PDF desenlerini, tesbih ve gümüş ürünleri ve vintage ürünleri satar. Shopier uygulamada ayrı bir satış merkezi olarak canlı ürün/sipariş okuma, açık onaylı ürün oluşturma ve güncelleme, stok yönetimi ve imzalı webhook doğrulaması sağlar. Etsy ayrı bir kanal olarak tutulur; mağaza sahibi kurulum ücretini onaylayıp mağazayı açana kadar ödeme öncesi hazırlık aşamasında kalır. Letgo beklemededir.

Yeni akıllı ürün modülü; telefondan seçilen gerçek ürün fotoğrafını analiz eder, yalnızca gözlemlenebilir özellikleri çıkarır, doğrulanamayan marka/yıl/malzeme iddialarını soruya dönüştürür, Etsy için İngilizce; Shopier ve Letgo için Türkçe ilan taslakları hazırlar. Deterministik politika kilidi `YASAK`, `İNCELEME GEREKLİ` ve `UYGUNLUK KONTROLÜ GEÇTİ` sonuçlarından birini verir; yasak veya eksik kanıtlı ürün otomatik yayınlanmaz.

## Hızlı başlangıç

```bash
cp .env.example .env
npm install
npm test
npm run dev
```

API `http://localhost:8787` adresinde açılır. Android arayüzü için:

```bash
cd apps/mobile
npm install
npm start
```

Expo Go ile QR kodunu Android telefonda açabilirsiniz. Gerçek kanal bağlantıları için `docs/KURULUM_TR.md` dosyasını izleyin.

## Telefona doğrudan APK kurma

`apps/mobile/eas.json` içindeki `preview` profili doğrudan Android telefona kurulabilen APK üretir. Bulut derlemesi bir Expo hesabında şu komutla başlatılır:

```bash
cd apps/mobile
npx eas-cli build --platform android --profile preview
```

Derleme tamamlandığında oluşan güvenli indirme bağlantısı Android telefonda açılır ve APK yüklenir. Xiaomi/HyperOS ilk kurulumda tarayıcıya “bilinmeyen uygulama yükleme” izni sorabilir. İzin yalnızca resmi derleme bağlantısından indirilen bu APK için verilmelidir.

### GitHub üzerinden bilgisayarsız APK

Depodaki `GXL Android APK` iş akışı `main` dalına yapılan her mobil uygulama güncellemesinde kurulabilir debug APK üretir. GitHub'da **Actions → GXL Android APK → son çalışma → Artifacts → GXL-Akilli-Satici-APK** yolundan ZIP indirilir; ZIP içindeki `app-debug.apk` telefona kurulur.

## Güvenli otomasyon modeli

- Uygulama internetten kişisel veri kazımaz ve toplu istenmeyen mesaj göndermez.
- İlk giden mesaj `pending` onay kuyruğunda bekler.
- Onaydan sonra yalnızca aynı görüşme ve izinli kanal penceresi içinde otomatik cevap verir.
- Fiyat indirimi, belirsiz stok, şikâyet, iade ve hassas içerik insan onayına düşer.
- `STOP`, `İPTAL`, `MESAJ İSTEMİYORUM` gibi talepler kişiyi hemen engelleme listesine alır.

## Teslim kapsamı

- Çalışan Node.js/TypeScript API
- Android/iOS için Expo React Native yönetim uygulaması
- Demo ürün kataloğu ve müşteri görüşmeleri
- GXL 925 ayar gümüş tesbih fotoğrafları ve gerçek satış bağlantıları
- İlk temas onay motoru
- Kural tabanlı demo ajanı ve isteğe bağlı OpenAI Responses API sağlayıcısı
- Görselden ürün tanıma, üç platforma özel ilan üretimi ve politika kilidi
- İzinli etkileşimleri niyet, güncellik ve katalog eşleşmesine göre puanlayan potansiyel müşteri motoru
- Meta, Shopier ve Letgo bağlayıcı sınırları
- Bağımsız Shopier satış merkezi, canlı ürün oluşturma/güncelleme ve imzalı webhook doğrulaması
- Telefondan Shopier ürün fotoğrafı seçme ve R2 üzerinden güvenli görsel sunma
- Etsy trend radarı: hobi deseni, tesbih/gümüş ve vintage nişlerini Etsy resmî aramasıyla 0–100 arası puanlama
- Otomatik keşif (otopilot): her 30 dakikada bir Etsy taraması; yeni ilanlarda yükselen etiketlerden yeni arama ifadeleri çıkarıp takibe alma
- Uygulama içi Etsy kullanım kılavuzu (Etsy → Kılavuz)
- Desen stüdyosu: sistemin seçtiği desen adı, referanstan farklılaştırma planı, Claude/ChatGPT PDF promptu, 3D render promptu ve Etsy kurallarına uygun başlık ile 13 etiket
- ABD sezon fırsatları: yaklaşan alışveriş dönemleri, son listeleme tarihleri ve dönemlik arama puanları
- Fiziksel ürün Etsy stüdyosu: alıcı arama ifadesi, etiket, başlık, açıklama, TL→USD fiyat analizi, Etsy kural kapısı, taslak ve tek onayla yayınlama (`docs/ETSY_URUN_STUDYOSU_TR.md`)
- Korumalı PDF teslimi: Etsy'ye taslak dijital ilan ve dosya yükleme, Shopier ve doğrudan satışlar için siparişe özel, süreli ve indirme sınırlı bağlantılar (`docs/DIJITAL_DESEN_SATISI_TR.md`)
- Testler, API örnekleri ve canlıya geçiş kontrol listesi

Bu sürüm bir üretim çekirdeği ve kurulabilir prototiptir. Canlı mesaj gönderimi; işletme doğrulaması, kanal erişim anahtarları, KVKK metinleri ve Meta/Shopier uygulama onayları tamamlanınca etkinleşir.
