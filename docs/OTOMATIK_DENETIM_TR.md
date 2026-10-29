# Otomatik denetim: talimat ve ilanlar gönderilmeden önce kontrol edilir

Uygulamanın ürettiği her metin telefona gelmeden önce sunucuda denetlenir:
- ChatGPT/Claude'a gönderilen tek paket talimat;
- Etsy başlığı, 13 etiket ve açıklama;
- Pinterest pinleri;
- Instagram, Facebook ve WhatsApp metinleri.

Küçük hatalar (fazla boşluk, "a orange" → "an orange", "christmas" → "Christmas") yerinde düzeltilir. Düzeltilemeyen bir sorun kalırsa ekranda kırmızı kutuda Türkçe açıklaması görünür ve "Tek paketi gönder" düğmesi göndermeden önce sorar.

Sorun yoksa yeşil kutuda "Otomatik denetim: N kontrol, sorun yok" yazar.

## Neleri yakalar?

### Talimat paketi (ChatGPT/Claude)
- **Tema karışması.** Bir ürün tek temada kalır: Noel kitine cadı veya dark academia, bridal shower oyununa bachelorette sayfası girmez. Bayramın kendi mevsimi (Noel için kış) uygundur.
- **Zamanlama.** Zamanı geçmiş ya da çok uzak bayram trend özelliğine alınmaz. Örneğin 29 Ekim'de Cadılar Bayramı yeni dijital ürün için geçtir; Noel ise uygundur.
- **Çizilemeyen konu.** "download", "junk journal", "commercial use" veya yalnız "cozy" gibi görsel konuları kabul edilmez.
- **Lisans çelişkisi.** Talimat ticari lisans sunmayı isterken lisans sayfası "yalnız kişisel kullanım" diyorsa yakalanır.
- **Yapılamayacak istek.** Video veya düzenlenebilir sürüm vaadi yakalanır; yapay zekâ bunları üretmez.
- **Yazı çelişkisi.** Tam sayfa kâğıda, duvar sanatına ya da boyama sayfasına altbilgi ve sayfa numarası istenmesi yakalanır.
- **Referans kuralı.** Başka satıcının ilan görselini veya telifli görseli referans almayı yasaklayan kural her pakette olmalı.
- **Ürün adı.** Yapay zekâya ürün adını değiştirme izni verilmez; ilan ve görseller o adla hazırdır.
- **Sayfa bütçesi.** Kâğıt, süs sayfası ve şablon sayılarının toplamı ürünün sayfa sayısına eşit olmalı.
- **Ürüne uymayan kontrol.** Boyama kitabına saat (AM/PM) kontrolü, tablet sürümü olmayan ürüne bağlantı kontrolü, kanaviçeye tığ işi ilmek hesabı gibi kontroller yakalanır.
- **Kopuk atıf.** "Brief B" veya "C9" gibi, pakette olmayan bir bölüme gönderme yakalanır.

### Etsy ilanı
- **Etsy kuralları.** En fazla 140 karakterlik başlık, tam 13 etiket, her etiket en fazla 20 karakter, izinli karakterler.
- **Anahtar kelime yığını.** Başlıkta bir kelime ikiden fazla, bir ifade iki kez geçmemeli.
- **Etiket uyumu.** Birbiriyle çatışan temalar (ör. "christmas" ve "halloween"), ürünün içermediği vaatler ("commercial use", "editable") ve marka/telif riskli kelimeler yakalanır.
- **Dijital ürün notu.** Kargo gönderilmeyeceği ve yıllı lisans satırı açıklamada yazmalı.
- **Açıklamanın ilk satırı.** Başlığın kopyası değil, ürünü anlatan bir cümle olmalı.

### Her metin
- **Yer tutucu.** Doldurulmamış yer tutucu ("undefined", "[fiyat]", "[Shopier bağlantısı]") yakalanır.
- **Tekrar.** Art arda tekrar eden kelime veya ad yakalanır ("the "X Kit" kit").
- **Noktalama ve boşluk.** Boşluk ve noktalama hataları, boş maddeler yakalanır.
- **Yazım (İngilizce metinlerde).**
  - Yanlış "a"/"an".
  - İngilizce metinde Türkçe harf veya kelime.
  - İngiliz yazımı ("colour" yerine "color" olmalı).
  - Küçük harfle yazılmış özel isim.

## Nasıl doğrulandı?

1. `apps/api/test/fixtures/output-matrix.ts` gerçek Etsy aramalarına benzeyen 25'ten fazla senaryoyu her biri 3 farklı tohumla üretir. Senaryolar PDF ürünleri, desenler, tesbih/vintage/örgü ürünleri ve reklam planlarıdır.
2. `apps/api/test/output-guard.test.ts` bu üretimlerin hiçbirinde hata kalmamasını şart koşar.
3. Kullanıcının ChatGPT'ye gönderdiği gerçek paketteki altı hata da testte yer alır; denetleyicinin bunları yakaladığı ayrıca test edilir.
4. Bağımsız bir ajan aynı çıktıları satır satır okuyup inceledi. Bulduğu 52 hata kaynağında düzeltildi; ikinci tur incelemesi sonucu doğrulamak içindir.

Çıktıları okumak için: `node --import tsx apps/api/test/fixtures/dump-outputs.ts <klasör> --first`
