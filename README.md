# GXL Akıllı Satıcı

GXL Market Studio için ürün kategorisinden bağımsız, Android merkezli çok kanallı satış ve pazar fırsatı asistanı.

Sistem; serbest kategorili ürün kataloğu, pazar fırsatları, müşteri adayları, ilk temas onayı, onay sonrası otomatik konuşma, ürün önerisi, çok kanallı satış yönlendirmesi ve insan devralma kurallarını tek yerde toplar.

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
- Meta, Shopier ve Letgo bağlayıcı sınırları
- Testler, API örnekleri ve canlıya geçiş kontrol listesi

Bu sürüm bir üretim çekirdeği ve kurulabilir prototiptir. Canlı mesaj gönderimi; işletme doğrulaması, kanal erişim anahtarları, KVKK metinleri ve Meta/Shopier uygulama onayları tamamlanınca etkinleşir.
