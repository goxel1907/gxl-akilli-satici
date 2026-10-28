# Uygulama güncellemeleri (APK kurmadan)

0.8.6 sürümünden itibaren uygulama, ekran ve metin düzeltmelerini **APK'yi yeniden kurmadan** alır (Expo EAS Update).

## Nasıl çalışır

1. Bir düzeltme `main` dalına birleştirilir.
2. GitHub'da **"GXL uygulama güncellemesi (EAS Update)"** iş akışı çalışır ve güncellemeyi `preview` kanalına yayınlar.
3. Telefonda uygulama açıldığında ya da öne geldiğinde yeni sürümü indirir ve **"Güncelleme hazır"** diye sorar. **"Yeniden başlat"** deyin.
4. Hangi sürümde olduğunuz **Özet** ekranının en altında yazar. Örnek: `Uygulama 0.8.6 · güncelleme 29.10.2026 14:05`. Yeni APK'yi kurduğunuz ilk açılışta `APK ile gelen sürüm` yazar.

## Ne zaman yeni APK gerekir?

Yeni bir telefon özelliği için native paket eklendiğinde (ör. kamera, bildirim). O zaman `app.json` içindeki `version` yükseltilir ve expo.dev'de yeni APK derlenir. Eski APK, kendisine uymayan güncellemeyi **almaz**; bu yüzden uygulama bozulmaz.

Bu kural testle korunur: `apps/mobile/native-modules.json` APK'nin içindeki paketleri listeler. Paket listesi değişip sürüm aynı kalırsa `npm test` kırmızı yanar.

## Bir kez yapılacak kurulum (EXPO_TOKEN)

GitHub'ın Expo'ya güncelleme yayınlayabilmesi için bir anahtar gerekir. Anahtarı **yalnızca GitHub'ın gizli değerlerine** girin; sohbete, uygulamaya veya koda yazmayın.

1. **expo.dev**'e girin → sağ üstte profil → **Account settings** (Hesap ayarları) → **Access tokens** (Erişim anahtarları) → **Create token** (Anahtar oluştur).
   - Ad: `github-eas-update`.
   - Anahtar yalnızca bir kez gösterilir; kopyalayın.
2. **github.com/goxel1907/gxl-akilli-satici** → **Settings** (Ayarlar) → **Secrets and variables** (Gizli değerler) → **Actions** → **New repository secret** (Yeni gizli değer).
   - Name: `EXPO_TOKEN`
   - Secret: kopyaladığınız anahtar
   - **Add secret** (Ekle)
3. Anahtar eklenene kadar iş akışı hata vermez; yalnızca "Güncelleme yayınlanmadı" notu düşer.

## APK derleme

expo.dev → proje → **Build from GitHub**:

- Base directory: `apps/mobile`
- Ref: `main`
- Profile: `preview`

`preview` profili `preview` güncelleme kanalını dinler.

GitHub'daki **"GXL Android APK"** iş akışı geliştirme amaçlı bir debug APK üretir. Telefonda kullanılacak APK expo.dev'den derlenir.
