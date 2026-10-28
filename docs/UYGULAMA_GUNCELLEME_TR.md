# Uygulama güncellemeleri (APK kurmadan)

0.8.6 sürümünden itibaren uygulama, ekran ve metin düzeltmelerini **APK'yi yeniden kurmadan** alır (Expo EAS Update).

## Nasıl çalışır

1. Bir düzeltme `main` dalına birleştirilir.
2. Değişiklik `apps/mobile` klasöründeyse Expo'nun kendi sunucusunda **"Uygulama güncellemesi"** iş akışı çalışır (`apps/mobile/.eas/workflows/publish-update.yml`) ve güncellemeyi `preview` dalına yayınlar.
3. Telefonda uygulama açıldığında ya da öne geldiğinde yeni sürümü indirir ve **"Güncelleme hazır"** diye sorar. **"Yeniden başlat"** deyin.
4. Hangi sürümde olduğunuz **Özet** ekranının en altında yazar. Örnek: `Uygulama 0.8.6 · güncelleme 29.10.2026 14:05`. Yeni APK'yi kurduğunuz ilk açılışta `APK ile gelen sürüm` yazar.

İş akışının çalışıp çalışmadığını expo.dev → proje (gxl-akilli-satici) → **Workflows** (İş akışları) sayfasında görürsünüz.

## Neden GitHub Actions değil?

Bu GitHub hesabında Actions işleri "account is locked due to a billing issue" (hesap ödeme sorunu nedeniyle kilitli) uyarısıyla hiç başlamıyor. Expo'nun iş akışı GitHub Actions kullanmaz; APK derlemesinde kullanılan Expo–GitHub bağlantısıyla çalışır ve anahtar (token) gerektirmez.

GitHub'a daha önce eklenen `EXPO_TOKEN` gizli değeri ve expo.dev'deki `github-eas-update` robotu artık kullanılmıyor. İsterseniz silebilirsiniz:

- GitHub → Settings (Ayarlar) → Secrets and variables → Actions
- expo.dev → Access tokens (Erişim anahtarları)

## Ne zaman yeni APK gerekir?

Yeni bir telefon özelliği için native paket eklendiğinde (ör. kamera, bildirim). O zaman `app.json` içindeki `version` yükseltilir ve expo.dev'de yeni APK derlenir. Eski APK, kendisine uymayan güncellemeyi **almaz**; bu yüzden uygulama bozulmaz.

Bu kural testle korunur: `apps/mobile/native-modules.json` APK'nin içindeki paketleri listeler. Paket listesi değişip sürüm aynı kalırsa `npm test` kırmızı yanar.

## APK derleme

expo.dev → proje → **Build from GitHub**:

- Base directory: `apps/mobile`
- Ref: `main`
- Profile: `preview`

`preview` profili `preview` güncelleme kanalını dinler.
