# Mimari ve kapsam

## Uygulama akışı

1. Ürünler fotoğraf, video, stok, fiyat ve Shopier/Letgo bağlantılarıyla kataloğa alınır.
2. Müşteri adayı yalnızca izinli kaynaklardan veya kendi gelen mesajından oluşur.
3. İlgi alanları ve satın alma sinyalleri adaya puan verir.
4. Ajan ilk mesaj taslağı üretir; uygulama sahibinin onayı olmadan gönderilmez.
5. Onaydan sonra gelen mesajlara ajan katalog ve politika sınırları içinde yanıt verir.
6. Satın alma niyetinde Shopier veya ilgili ilan sayfasına yönlendirir.
7. İndirim, iade, şikâyet, çakı ve belirsiz stok insan devralmasına gider.

## GXL ürünleri

| Ürün | Doğrulanan bilgi | Satış bağlantısı |
| --- | --- | --- |
| Ay-yıldızlı oksitli tesbih | 925 ayar gümüş, 24 g | Letgo `1732503836` |
| Arpa kesim tesbih | 925 ayar gümüş, 17 g | Letgo `1732517403` |
| Telkâri tesbih | 925 ayar gümüş; gram ve fiyat bekleniyor | Shopier `49555980` |

## Üretim bileşenleri

| Bileşen | Görev | Bu pakette |
| --- | --- | --- |
| Android uygulaması | Panel, onay, müşteri ve katalog | Çalışan Expo arayüzü |
| API servisi | İş kuralları ve webhook'lar | Çalışan Node.js servisi |
| Ajan | Öneri, cevap, devralma kararı | Demo + OpenAI sağlayıcısı |
| Veritabanı | Ürün, müşteri, izin ve mesajlar | Demo bellek; üretimde PostgreSQL |
| Medya deposu | Fotoğraf/video | URL alanları; üretimde şifreli nesne deposu |
| Mesaj kuyruğu | Gönderim, tekrar deneme | Üretim aşamasında Redis/SQS |
| Meta bağlantısı | WhatsApp/Instagram/Facebook | Bağlayıcı ve webhook iskeleti |
| Shopier | Ürün/sipariş ve satış linkleri | Webhook ve bağlantı alanları |
| Letgo | İlan/satış yönlendirmesi | Manuel devralma ve derin bağlantı |

## Müşteri bulma sınırı

Uygulama; Instagram takipçileri, reklam formu dolduranlar, QR/WhatsApp bağlantısından yazanlar, mevcut izinli müşteri listesi, Shopier siparişleri ve sizin elle eklediğiniz adayları puanlayabilir. Kişisel hesapları kazıma, telefon/e-posta toplama, sahte etkileşim veya izinsiz seri mesaj bu kapsamda değildir.

## İkinci üretim aşaması

- PostgreSQL şeması ve migration'lar
- Yönetici kimlik doğrulama ve roller
- İmzalı Meta/Shopier webhook doğrulaması
- Gerçek medya yükleme ve sıkıştırma
- Kampanya segmentleri ve performans raporları
- Sipariş durumu, kargo ve satış sonrası takip
- Bulut dağıtımı, izleme, yedek ve felaket kurtarma
