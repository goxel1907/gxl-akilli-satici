# Prepublication checks on the authenticated phone

The new **Yayın öncesi canlı kontrol** panel is available from expert-mode **Özet**, simple-mode **Yardım**, and **Etsy → Kılavuz**. It does not run automatically. It separates current service/device observations, seller-reported manual checks, failures, warnings, pending steps and steps not applicable to the current attempt. There is no aggregate publication approval or guarantee of a fault-free app.

## Actual access and validation

This session had no connected Android device or phone-control surface. The unauthenticated health request from the development environment returned HTTP 403; that alone does not establish an application outage or invalid phone credentials. Authenticated production reads, native phone interactions, assistant delivery, actual generated product content and a real Etsy draft were not independently exercised here.

281 automated tests pass, including ten diagnostics scenarios. Root and mobile TypeScript checks and an offline Android Expo export pass. Tests render the actual app/panel components with controlled native and network boundaries; they do not replace the phone checks below. The release adds no native dependency or runtime-version change.

## Automatic observations

The panel reuses the phone's existing application credential. Its adapter permits only same-origin GET requests to `/health`, `/api/dashboard`, `/api/channels/status`, `/api/etsy/readiness`, `/api/etsy/trends`, `/api/digital/products`, `/api/pinterest/status`, and the selected product's `/api/digital/products/{id}/qa`. Each network request has an 18-second abort timer. It does not call listing/draft writes, publication, approval, messaging, pin creation or external URLs.

- Installed app/runtime, channel, embedded-versus-OTA state and available update ID/date are recorded. These values do not prove that the latest update is installed.
- A dedicated temporary AsyncStorage key is written, read and removed. Persistence after a real app restart remains a separate manual check.
- Health and authenticated catalog reads are separate checks. A successful public health request does not validate protected access. Failed app authentication leaves dependent reads pending.
- Etsy account/shop and optional Shopier/Pinterest status are read. These observations do not prove upload permissions, draft creation, payment/identity completion, pin publishing or order handling.
- Preparation, trend-board and digital-catalog response shapes are checked. Reading a trend board does not validate a fresh search, its ranking, bestseller status or sales predictions.
- Native document/image picker exercises return a count. No selected file is uploaded by these exercises; a cancelled selection is a warning rather than a pass.
- An explicitly selected stored product can be structurally audited through the existing read-only QA route. Empty or internally inconsistent successful responses fail. Reported structural failures use fixed categories rather than raw filenames/errors. Correct answers, language, design, formulas and print quality still require review of the real files.

Cancelling preserves pending steps. Late results from an older read run cannot replace a newer run's persisted report. Saved reports are explicitly labeled as previous observations when reopened.

## Phone procedure

1. Install/reload the preview update. Open **Özet → Yayın öncesi canlı kontrol** (or either alternative entry above), then **Canlı okumaları başlat**. Inspect each result; a warning or pending step is not a pass.
2. Exercise both picker buttons with actual local files. If applicable, select the intended stored product and run **Seçili ürünün dosyalarını denetle**.
3. Follow the thirteen manual scenarios in the panel: every main tab in both modes; Trend subgroups/discoveries/seasons; all Studio paths and Goxi instructions; actual product-specific competitor evidence; photo/product provenance and facts; receipt in the intended ChatGPT/Claude conversation; genuine production/download/opening; every delivered page and answer; metadata/files/images after upload; navigation/restart/interrupted transfer; the real Etsy draft; agent/other-channel status; and phone layout/keyboard/back/rotation.
4. For each applicable scenario, record a result only after performing it. **Deneyip doğruladım** is a seller report, not automatic or independent agent verification. **Bu denemede uygulanmıyor** does not mean tested. Use **Hata var** for a failure and capture its screen separately if needed.
5. Stop at the real Etsy draft. Open that draft in Etsy and compare the actual title, description, 13 tags, price, category, image order, downloadable files and applicable shipping/production-partner fields. Do not press Publish or send customer messages/pins during this review. This panel does not globally disable write controls elsewhere in the app.
6. Use **Kontrol raporunu paylaş** and send the report to this ChatGPT conversation. Opening the share sheet alone does not prove delivery. Review the report alongside actual errors/screens and the real product files before deciding whether to publish.

## Local report and privacy

The latest report is stored locally and shared only through the seller's explicit native share action. It includes timestamps, installed version/update metadata, check results and an optional opaque product UUID to bind a stored-file audit. It omits credentials, customer contacts, product names, selected file names/paths/URIs and raw service/provider responses. Product names may appear in the local selector but are not exported. The report contains no arbitrary free-text error notes. It is not automatically sent to an assistant or server.
