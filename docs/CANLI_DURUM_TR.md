# GXL Akıllı Satıcı — Canlı durum ve güvenli çalışma sınırları

Son güncelleme: 14 Ağustos 2026

## Kanal durumu

| Kanal | Teknik durum | Uygulamanın yapacağı | Henüz yapamayacağı |
|---|---|---|---|
| Gemini | Yapılandırıldı | Fotoğraftaki görünür özellikleri analiz eder; doğrulanmış bilgilerle taslak üretir | Görselden marka, ayar, yaş, özgünlük veya malzeme uydurmaz |
| Etsy | API anahtarları hazır; mağaza açılışı ücret/ödeme adımında bekliyor | İngilizce başlık, açıklama, 13 etiket ve politika uyarısı taslağı hazırlar | Mağaza açılmadan ürün yayınlamaz veya sipariş yönetmez |
| Shopier | Erişim anahtarı girildi; Shopier erişim/onay sonucu bekleniyor | Bağlantı doğrulanırsa ürün ve sipariş özetlerini okur | Başarısız bağlantıyı “bağlı” göstermez; izin olmadan ürün değiştirmez |
| WhatsApp | Resmî Business API bağlı değil | Onaylanan taslağı telefon paylaşım ekranına devreder | Otomatik mesaj göndermez veya kişi taramaz |
| Instagram / Facebook | Meta Business bağlantısı yok | Meta gelen kutusunu manuel açar | İlgi gösterenleri otomatik çekmez veya DM göndermez |
| Letgo | Ücretli ilan nedeniyle arka planda / manuel | Türkçe ilan taslağı ve politika kontrolü üretir | API varmış gibi ilan yayınlamaz veya mesaj devralmaz |
| E-posta | Gmail hesabı hazır; e-posta API bağlantısı yok | E-posta uygulamasında manuel taslak açabilir | Bağlantı ve izin olmadan e-posta göndermez |

## Onaylı mesaj akışı

1. Aday yalnızca gerçek bir etkileşim veya açık izin kaynağından gelir.
2. Ajan adayın ürün ilgisini ve satın alma sinyallerini puanlar.
3. İlk temas taslağı kullanıcı onayına sunulur.
4. Onay verildiğinde durum kaydedilir; mesaj otomatik gönderilmiş sayılmaz.
5. Resmî kanal bağlantısı yoksa telefonun paylaşım ekranı açılır ve doğru alıcıyı kullanıcı seçer.
6. Kanalın izin verdiği ve müşteri konuşmayı başlattığı durumlarda sonraki yanıtlar otomatikleştirilebilir.

## Kesin güvenlik kuralları

- Rastgele kullanıcı tarama, takipçi kazıma, izinsiz toplu DM/e-posta ve sahte etkileşim yapılmaz.
- Ürün fotoğrafından görünmeyen veya satıcı tarafından doğrulanmayan özellikler kesin bilgi gibi yazılmaz.
- Etsy’de yalnızca platformun izin verdiği handmade, vintage veya craft supplies kategorileri kullanılır; atölye üretimi doğru şekilde beyan edilir.
- Silah, yasaklı bıçak, taklit marka, sahte koleksiyon ürünü, sağlık iddiası ve doğrulanmamış kıymetli maden beyanı engellenir veya incelemeye alınır.
- Stok, fiyat, kargo ve termin bilgileri yayınlamadan önce kullanıcı tarafından doğrulanır.
- Platformun resmî API/izin kapsamı dışında otomatik yayınlama veya mesajlaşma yapılmaz.

## Sonraki bağlantı sırası

1. Shopier destek onayı ve canlı bağlantı testi.
2. Etsy mağaza ödeme/kurulum tamamlanınca OAuth yetkilendirmesi ve mağaza doğrulaması.
3. Meta Business hesabı ve Instagram/Facebook mesaj izinleri.
4. WhatsApp Business Platform numarası ve mesaj şablonları.
5. Gmail OAuth bağlantısı.
6. Letgo, resmî entegrasyon imkânı oluşana kadar manuel taslak/devir modu.
