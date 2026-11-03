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
3. Aynı test, denetleyicinin bu üretimlerde düzeltecek bir şey bulmamasını da şart koşar. Yani metinler kaynağında temiz üretilir; denetleyici yalnız beklenmedik durumlar için güvenlik ağıdır.
4. Kullanıcının ChatGPT'ye gönderdiği gerçek paketteki altı hata da testte yer alır; denetleyicinin bunları yakaladığı ayrıca test edilir.
5. Bağımsız bir ajan aynı çıktıları satır satır okuyup inceledi:
   - 1. tur: 52 hata bulundu, hepsi kaynağında düzeltildi.
   - 2. tur: 19 yeni hata ve 25 eksik düzeltme bulundu, hepsi kaynağında düzeltildi. Örnekler: siyah-beyaz dosyası olmayan ürüne "renkli + siyah-beyaz" görseli, 3 baskılık duvar sanatından 5-7 sayfa istenmesi, dikiş deseninde dosya planı çelişkisi, nakış şablonunun kâğıda sığmaması.
   - 3. tur: sonucu doğrulamak içindir.

## Yeni ürün türlerinde ne kontrol edilir?

- **Dosya planı.** Her ürünün yükleme seti en fazla 5 dosya, her dosya en fazla 20 MB. Duvar sanatında oranlar zip'lerde toplanır. Dijital planlayıcıda açık ve koyu tema ayrı dosyadır. Dikiş deseninde talimat, Letter, A4 ve A0 kalıp dosyaları ayrıdır.
- **Görseller gerçeği gösterir.** İlan görseli yalnız dosyada olanı gösterir. Örneğin siyah-beyaz dosyası yoksa "renkli + siyah-beyaz" görseli yapılmaz.
- **Desen görselleri.** Görsel yalnız stil ve rengi gösterir. Tam sayılar kodla çizilen şemalardadır, çünkü görsel modelleri sayıları tutturamaz.

Çıktıları okumak için: `node --import tsx apps/api/test/fixtures/dump-outputs.ts <klasör> --first`

## Etsy kuralları (22 Ekim 2026 güncellemesi)

Etsy yapay zekâ kurallarını 22 Ekim 2026'da sıkılaştırdı. Uygulama bu kurallara göre çalışır:

- **Yapay zekâ deseni yasak.** Örgü, tığ, dikiş, nakış, kanaviçe, punch ve makrome deseni, tarif ve talimat kılavuzu yapay zekâyla yazılamaz; ilanda belirtmek de yetmez.
  - Uygulama artık yapay zekâya desen yazdırmaz.
  - Desen bölümü yalnız sizin veya mağaza üyenizin yazıp bizzat denediği desen için ilan metni hazırlar.
  - Desen yalnız şu üç onayla yüklenebilir: kendi deseni, denendi, gerçek fotoğraf.
- **Gerçek fotoğraf ve önizleme.**
  - Desen ilanında bitmiş ürünün gerçek, düzenlenmemiş fotoğrafı olmalı.
  - Dijital üründe görsellerden biri PDF sayfalarının düzenlenmemiş önizlemesidir. Talimattaki C4 görseli bu yüzden görsel aracıyla değil, kodla ve gerçek sayfalardan yapılır.
- **Yapay zekâ beyanı.** Yapay zekâ destekli PDF ürünlerinde açıklamada beyan bulunur. Etsy formu sorarsa "evet" seçilir.
- **Robot ilanı yasak.** Uygulama yalnız taslak açar; yayına almadan önce ilanı siz kontrol edersiniz.
- **Doğru ürün türü.** Planlayıcı, duvar sanatı, boyama sayfası, oyun, günlük ve tarif kartı "bitmiş ürün" olarak; desen ve kâğıt kiti "malzeme" olarak listelenir.
- **Marka adı yok.** iPad, Android, GoodNotes, DMC gibi uyumluluk markaları başlığa ve etikete girmez; gerekirse açıklamada düz metin olarak yazılır.
- **"Vintage" yalnız eski ürüne.** Yeni üründe "vintage-style" yazılır.
- **Doğru vaat.**
  - "Ücretsiz kargo" yalnız kargo bedeli fiyata eklendiyse yazılır.
  - Üründe birden çok malzeme varsa (ör. Oltu taşı ve galalit) hepsi yazılır.

## Yapay zekâyla satılabilen ürün türleri

Uygulamada 15 dijital ürün türü var. Her türün kendi sayfa bütçesi, görsel planı, dosya seti ve otomatik kontrol listesi vardır:

- **Mevcut türler:** planlayıcı, dijital planlayıcı, günlük, boyama, duvar sanatı, parti oyunları, boş tarif kartı, çocuk etkinlik sayfaları, junk journal kiti / dijital kâğıt.
- **Yeni türler ve kontrolleri:**
  - Yıllık takvim: tarihler kodla üretilir ve gerçek takvimle karşılaştırılır.
  - Çıkartma seti: basılır, kesilir, ayrıca şeffaf PNG olarak gelir.
  - Tebrik kartı ve hediye etiketi: 5x7 katlanır; katlama ve kesim işaretleri kontrol edilir.
  - Büyük puntolu bulmaca kitabı: her bulmaca kodla yeniden çözülür ve cevap anahtarı denetlenir.
  - Telefon duvar kâğıdı: piksel ölçüleri kesindir; ilanda baskı kelimesi geçmez.
  - Kiler ve ev düzeni etiketleri: her kelimenin yazımı denetlenir.

Her tür trend verisi olmasa bile 13 etiketin tamamını doldurur.

Paket, Stüdyo'da seçilen yapay zekâya göre yazılır:
- **ChatGPT:** görselleri kendi görsel aracıyla üretir.
- **Claude:** görselleri kodla vektör olarak çizer. Fotoğraf gibi sahneler için görsel promptunu verir.
