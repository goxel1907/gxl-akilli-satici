# Shared-code browser QA — November 6, 2026

Private test URL: https://gxl-satici-web-test.major-lynx-2547.chatgpt.site/

Scope: actual React Native App.tsx rendered on the web, actual protected Worker routes and research, product, PDF, archive and draft logic. External Etsy responses, shop identity and credentials are explicitly synthetic. No real listing, message or pin was published. Browser success is not Android-device or live-shop success.

## Actual browser observations

| Area | Observed result |
| --- | --- |
| Simple navigation | Başla, Sat, Siparişler, Müşteri and Yardım opened. |
| Expert navigation | Etsy, Özet, Shopier, Ajan, Onaylar, Müşteriler and Ürünler opened. Optional/unconfigured services showed their state. |
| Etsy sections | Trend, Stüdyo, Dijital, Pinterest and Kılavuz opened. |
| Trend groups | Digital products, craft patterns, prayer beads/silver, vintage, discoveries and seasonal opportunities opened. |
| Studio modes | Digital, own pattern and physical-photo modes opened. Ownership/testing/real-photo confirmations were not auto-approved. |
| Research handoff | A reading-journal scan returned 30 marked synthetic listings. Trend subject/category reached Studio. This is not real market evidence. |
| Listing package | Navy Sumine Reading Journal retained its 10 core pages, Letter/A4, palette, price and 13 tags through prepared-workspace reload/restoration. |
| Assistant share | The browser displayed the complete outgoing 33,413-character package with a synthetic-test prefix. Actual ChatGPT/Claude receipt or generation was not claimed. |
| Pickers | Actual browser file choosers selected two valid, separately downloaded Letter/A4 PDFs and one marked preview PNG. |
| Safety gates | Missing test confirmation and a bound-workspace filename/identity mismatch were rejected. Test confirmations were simulated inputs, not evidence of actual printing. |
| Upload state regression | Reopened the same unfinished manual form and retained name, kind, product type, price, title, description, 13 tags, two PDFs and image. A component regression also checks equivalent seed rerenders and different-product reset. |
| Upload failure/recovery | Forced staged-upload 503 produced Yüklenemedi, without a saved product. Switched back to normal, reopened the retained form and saved exactly one product. |
| Structural audit | Both one-page test PDFs passed parsing/geometry/declared-format checks. The UI separately requires seller review of content, appearance, answers, formulas and target-app function. |
| Synthetic draft | Created one draft with the exact manual title/description, 13 tags, USD 5.49, two filenames and one image. Mock shop_id 777 and state draft were visible in the draft viewer. |
| Draft state after reload | Reloaded, reopened Digital and requested status again: Etsy durumu: Taslak; one product remained. No active/public listing was created. |
| Photo analysis failure | File picker worked. Missing server-model access produced the chat/manual fallback with an explicit subscription/API distinction. |
| Rate limiting | Actual Enter-key search submitted; simulated Etsy 429 displayed the rate-limit failure. |
| Diagnostics | Normal: 0 independently verified, 0 failed, 10 warning, 15 pending. 401: 1 failed; offline: 2 failed; Etsy disconnected: 1 failed. Manual checks stayed pending. All reports retained synthetic-web provenance. |

## Fixed defects

1. The browser XML validator referenced Buffer without a browser implementation, leaving a blank root. Added a browser-only polyfill and visible bootstrap failure reporting.
2. Split chunks resolved fonts/images under the wrong asset URL. Added an absolute public asset path and confirmed rendered icons/previews.
3. Trend keyboard submission did nothing. Connected Enter to the guarded scan and exposed an accessible search button.
4. Generated titles repeated identical comma-separated format phrases. Normalize those phrases case-insensitively.
5. Advice treated listing age as shop age and keyword/format mentions as rising demand or proven sales. Wording now identifies observation limits and testable pricing/content candidates; no unsupported legacy-price fallback.
6. Optional format ideas could sound included after a seller changed deliverables. Removed that promise.
7. Mock taxonomy omitted supported categories; mock drafts lacked shop_id and were rejected by the real shop-ownership check. Corrected synthetic contracts for all 19 digital categories, including older local mock drafts.
8. Closing/reopening DigitalUploadForm erased metadata and selected files, and removed Studio provenance. Keep an unfinished upload and its handoff while mounted; reset for a different seed or after successful save.

## Automated validation

295 tests passed, zero failures. Root and mobile TypeScript checks, web bundle and Android Expo export passed. Coverage includes actual-component regressions, nine sandbox scenarios, binary browser upload transport and real protected Worker routes. Browser inspections above are separate from these automated results.

## Remaining checks

Real Android layout, camera/gallery/document pickers, phone downloads, installed OTA identity and process restart behavior have not been independently inspected here. Real Etsy OAuth/scopes, live taxonomy/account responses, production drafts and listing fees require the connected production app. Actual assistant receipt and generated product quality, original artwork/rights, answers, page completeness, physical printing and target-app compatibility remain unverified. No bestseller outcome or fault-free operation is guaranteed.

Unsaved modal selections survive close/reopen in the mounted app; full page reload or app termination can discard unsaved selections. Saved products/drafts and the prepared Studio workspace were separately checked through ordinary browser reload, not a new browser profile.
