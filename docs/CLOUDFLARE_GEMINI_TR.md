# Cloudflare + Gemini ücretsiz başlangıç

Bu yapı ürün fotoğrafı analizi, SEO ilan metni ve yanıt taslağını Gemini ücretsiz katmanıyla çalıştırır. Gemini anahtarı yalnızca Cloudflare Secret olarak saklanır; GitHub'a ve APK'ya yazılmaz.

## Cloudflare kurulumu

1. Cloudflare `Workers & Pages` ekranında `Create application` seçin.
2. `Import a repository` veya `Connect to Git` seçeneğiyle `goxel1907/gxl-akilli-satici` deposunu bağlayın.
3. Üretim dalını `main` olarak seçin.
4. Root directory alanını boş bırakın.
5. Build command alanına `npm install` yazın.
6. Deploy command alanına `npm run worker:deploy` yazın.
7. Worker adı olarak `gxl-akilli-satici-api` kullanın ve kurulumu başlatın.

## Gizli değerler

Worker açıldıktan sonra `Settings > Variables and Secrets > Add` yolundan ekleyin:

- Secret: `GEMINI_API_KEY` = Google AI Studio anahtarınız
- Variable: `GEMINI_MODEL` = `gemini-2.5-flash-lite`
- İsteğe bağlı Secret: `APP_ACCESS_TOKEN` = sizin oluşturduğunuz uzun ve rastgele uygulama anahtarı

Anahtarları ekledikten sonra `Deployments > Retry deployment` ile yeniden yayınlayın.

## Test

Worker adresinin sonuna `/health` ekleyin. Örnek:

`https://gxl-akilli-satici-api.gxl-marketstudio.workers.dev/health`

Yanıtta `ok: true` ve `ai: gemini` görünmelidir.

## Expo bağlantısı

Expo projesinin `preview` ortamına şunları ekleyin:

- `EXPO_PUBLIC_API_URL` = Worker adresi (`/health` olmadan)
- `EXPO_PUBLIC_GXL_APP_TOKEN` = Cloudflare'da `APP_ACCESS_TOKEN` eklediyseniz aynı değer

Ardından `preview` profiliyle yeni APK oluşturun. Eski APK yeni ortam değişkenlerini kendiliğinden alamaz.

## Güvenlik ve ücretsiz kota

- Ücretsiz kota bittiğinde API `429` döndürür ve ücretli işlem yapılmaz.
- Müşteri telefonu, adresi, e-postası ve özel mesaj geçmişi ürün analizine gönderilmez.
- Fotoğrafın gösterdiği marka, ayar, orijinallik ve üretim yılı kesin bilgi sayılmaz; uygulama belge veya satıcı doğrulaması ister.
- İlk müşteri teması insan onayından geçer. İzin veya gerçek etkileşim sinyali yoksa otomatik mesaj hazırlanmaz.
