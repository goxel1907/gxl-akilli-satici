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

1. `apps/api/test/fixtures/output-matrix.ts` gerçek Etsy aramalarına benzeyen 25'ten fazla senaryoyu her biri 3 farklı tohumla üretir. Senaryolar dijital ürünler (basılan ve telefona yüklenen), desenler, tesbih/vintage/örgü ürünleri ve reklam planlarıdır.
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
  - Dijital üründe görsellerden biri dosyaların düzenlenmemiş önizlemesidir. Talimattaki C4 görseli bu yüzden görsel aracıyla değil, kodla ve gerçek sayfalardan yapılır.
- **Yapay zekâ beyanı.** Yapay zekâ destekli dijital ürünlerde açıklamada beyan bulunur. Etsy formu sorarsa "evet" seçilir.
- **Robot ilanı yasak.** Uygulama yalnız taslak açar; yayına almadan önce ilanı siz kontrol edersiniz.
- **Doğru ürün türü.** Planlayıcı, duvar sanatı, boyama sayfası, oyun, günlük ve tarif kartı "bitmiş ürün" olarak; desen ve kâğıt kiti "malzeme" olarak listelenir.
- **Marka adı yok.** iPad, Android, GoodNotes, DMC gibi uyumluluk markaları başlığa ve etikete girmez; gerekirse açıklamada düz metin olarak yazılır.
- **"Vintage" yalnız eski ürüne.** Yeni üründe "vintage-style" yazılır.
- **Doğru vaat.**
  - "Ücretsiz kargo" yalnız kargo bedeli fiyata eklendiyse yazılır.
  - Üründe birden çok malzeme varsa (ör. Oltu taşı ve galalit) hepsi yazılır.

## Yapay zekâyla satılabilen ürün türleri

Uygulamada 19 dijital ürün türü var. Her türün kendi sayfa bütçesi, görsel planı, dosya seti ve otomatik kontrol listesi vardır:

- **Mevcut türler:** planlayıcı, dijital planlayıcı, günlük, boyama, duvar sanatı, parti oyunları, boş tarif kartı, çocuk etkinlik sayfaları, junk journal kiti / dijital kâğıt.
- **Basılan yeni türler ve kontrolleri:**
  - Yıllık takvim: tarihler kodla üretilir ve gerçek takvimle karşılaştırılır.
  - Çıkartma seti: basılır, kesilir, ayrıca şeffaf PNG olarak gelir.
  - Tebrik kartı ve hediye etiketi: 5x7 katlanır; katlama ve kesim işaretleri kontrol edilir.
  - Büyük puntolu bulmaca kitabı: her bulmaca kodla yeniden çözülür ve cevap anahtarı denetlenir.
  - Kiler ve ev düzeni etiketleri: her kelimenin yazımı denetlenir.
- **Telefona ve tablete yüklenen türler (baskı yok):**
  - Telefon duvar kâğıdı: piksel ölçüleri kesindir; her ölçü ayrı ZIP'tir.
  - İkon ve widget paketi: her sette 16 genel sembol, widget görselleri ve uyumlu duvar kâğıtları vardır. İkonlar 1024 piksel kare, şeffaf PNG'dir; marka logosu çizilmez.
  - Bütçe tablosu: formüller, giriş hücreleri ve makrosuz dosya kontrol edilir; Excel ve Google Sheets'te açılır.
  - Ekranda kullanılan türlerin (dijital planlayıcı dahil) ilanında "printable", "PDF" veya baskı kelimesi geçmez.

- **Programda açılıp düzenlenen şablonlar:**
  - Bütçe tablosu (.xlsx): Excel ve Google Sheets.
  - Sunum oyunu (.pptx): PowerPoint, Google Slides ve Keynote'ta tıklanabilir bilgi yarışması. Her kutu kendi sorusuna, her soru cevabına, her cevap tahtaya bağlıdır. Kalite betiği bağlantıları tek tek okur, cevapları ve slayt sayısını denetler. TV yarışması adları (ör. Jeopardy, Family Feud) marka olduğu için kullanılmaz.
  - Özgeçmiş şablonu (.docx): tek ve iki sayfalık özgeçmiş, ön yazı ve referans sayfası; US Letter ve A4. ABD kurallarına uyar: fotoğraf, doğum tarihi, medeni durum ve maaş yoktur; örnek bilgiler kurgusaldır. Kalite betiği her şablonun sayfasına sığdığını ve özgeçmiş tarama yazılımlarının (ATS) metni doğru sırayla okuduğunu denetler.
  - Bu türlerde "editable" (düzenlenebilir) doğru bir bilgidir; diğer türlerde yanıltıcı sayılır.
  - Program adları (PowerPoint, Word, Google) yalnız açıklamada geçer; başlığa, etikete ve ürün adına girmez.

Her tür trend verisi olmasa bile 13 etiketin tamamını doldurur.

**Eklenmeyenler ve nedeni:**
- **Kurulan program (APK, .exe, tarayıcı eklentisi).** Etsy'nin kurallarında bunlar için açık bir izin bulunamadı. Alıcının cihazı bilinmeyen kaynaktan program kurarken güvenlik uyarısı verir; iade ve kötü yorum riski yüksektir. Telefona ve bilgisayara yüklenen ürünler bu yüzden dosya olarak satılır: duvar kâğıdı, ikon paketi, dijital planlayıcı ve program şablonları.
- **Preset, yazı tipi, fırça.** Yapay zekâ bunları deneyip doğrulayamaz; denenmemiş dosya iade ve kötü yorum getirir.
- **Canva ve Notion şablonları.** Bilgisayarda o programın içinde satıcının kurması gerekir; istenirse ayrıca eklenebilir.

Paket, Stüdyo'da seçilen yapay zekâya göre yazılır:
- **ChatGPT:** görselleri kendi görsel aracıyla üretir.
- **Claude:** görselleri kodla vektör olarak çizer. Fotoğraf gibi sahneler için görsel promptunu verir.

## Dil düzeni: Türkçe istek, Amerikan İngilizcesi ürün

Talimat paketi iki kısımdır:

- **Türkçe istek kısmı.** Dil kuralı, ABD pazarı kuralları, adımlar ve araç notları Türkçedir.
  - Yapay zekâ sizinle hep Türkçe konuşur.
  - Sizden istediği her işi (ekran görüntüsü yükleme, bir promptu görsel aracında çalıştırma, Canva'da başlık ekleme) kısa, numaralı Türkçe adımlarla yazar.
  - Her adım "ADIM n TAMAM - devam etmek için 'devam' yaz" satırıyla biter. Siz "devam" yazarsınız.
- **İngilizce teknik şartname.** Brief A–D, Automated QA ve Final checklist İngilizcedir.
  - Bu kısım ürüne aynen girecek metinleri, ölçüleri ve görsel tariflerini birebir verir.
  - Çevrilirse ürüne Türkçe kelime veya yanlış çeviri sızabilir.

Ürüne giren her şey Amerikan İngilizcesidir: dosyalar, dosya adları, görsellerdeki yazılar, ilan ve pinler. Otomatik denetim şunlara bakar:

- Şartnamede Türkçe harf olmamalı.
- İngiliz yazımı (colour, grey, organise, Mum, icing sugar) ilan ve pinlerde yerinde Amerikan yazımına çevrilir. Karşılığı bağlama göre değişenler (fortnight, postcode) raporlanır.
- Paket dil kuralını içermeli; istek kısmında İngilizce adım kalmamalı.

Yapay zekânın çalıştırdığı kalite betiği de dosyalarda Türkçe harf, Türkçe kelime ve İngiliz yazımı arar.

## ABD pazarı ve eyalet farkları

Her paket, türüne uyan ABD kurallarını Türkçe olarak taşır. Eyaletten eyalete değişen bilgiler ürüne sabit olarak yazılmaz:

- **Vergi.** Satış vergisi ve eyalet gelir vergisi eyalete göre değişir.
  - Oregon, Montana, New Hampshire ve Delaware'de satış vergisi yoktur.
  - Texas ve Florida gibi dokuz eyalette eyalet gelir vergisi yoktur.
  - Bütçe tablosu ve bütçe planlayıcısında vergi oranı sabit yazılmaz; alıcının dolduracağı boş bir alan olur.
  - İlanda "tax included" yazılmaz; Etsy vergiyi alıcının eyaletine göre kendisi ekler.
- **Resmî tatiller.** Bazı tatiller yalnız birkaç eyalette geçerlidir (ör. Patriots' Day Massachusetts ve Maine'de). Takvim ve planlayıcıya tatil basılmaz.
- **Okul yılı.** Okul yılı güneyde ve batıda Ağustos'ta, kuzeydoğuda Eylül'de başlar. Öğretmen ve öğrenci planlayıcıları tarihsizdir ve Ağustos–Temmuz düzenindedir.
- **Müfredat.** Eyaletlerin standartları farklıdır. Çocuk çalışma kâğıdında "Common Core" veya bir eyalet standardına uyum iddia edilmez. Sınıf adları ABD'deki gibidir (Pre-K, Kindergarten, 1st grade).
- **İklim.** Florida, Arizona, Hawaii ve güney California'da kış karlı geçmez. İlan ve pin metinleri herkese aynı iklimi varsaymaz.
- **Alkol yaşı.** Alkol yaşı her eyalette 21'dir. Alkolden söz eden parti oyununa "21+" yazılır.
- **Biçimler.**
  - Kâğıt boyutu önce US Letter.
  - Ölçü önce inç ve °F.
  - Tarih "January 5, 2027" veya ay/gün/yıl.
  - Saat AM/PM ile; hafta Pazar başlar.
  - Para "$1,234.56".
  - Tarif ve kiler etiketlerinde ABD market adları kullanılır (powdered sugar, all-purpose flour).
- **Telefon.** ABD'de telefonların yarıdan fazlası iPhone'dur. Duvar kâğıdı ve ikon paketlerinde önce iPhone ölçüleri gelir.

**Pinterest zamanlaması.** İlk pin ilan yayına girince gider. Sonraki pinler ABD akşamına zamanlanır: Doğu saatiyle 20:00–21:00, Pasifik saatiyle 17:00–18:00.

**Trend verisi olmadan.** Ürünü elle yazdığınızda da paket temiz üretilir; ürün adındaki konu çizilir ("mandala coloring pages" → mandala sayfaları). 17 türün hepsi için bu test edilir.
