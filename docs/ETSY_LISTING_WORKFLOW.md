# Etsy listing workflow: app, assistant and phone files

## Product preparation

1. Select the digital product kind and the intended Etsy search in Studio.
2. Prepare the package. The updated app requests fresh research for that search. Only digital listings classified as the same product kind and matching the requested topic enter the comparison. At least three comparable listings and usable price data are required; failed research does not silently reuse an old price.
3. Review the sample size, query, timestamp and suggested USD price. This is an observed sample and a pricing suggestion, not Etsy sales data or a sales forecast.
4. Share the combined package with the selected ChatGPT or Claude app. The seller chooses the destination in the phone's share sheet. This is a user-directed handoff, not an authenticated connection to the seller's assistant account.
5. Complete every production and QA step in the same conversation. Actual product files, file names, listing text and image overlays use American English. The assistant speaks Turkish with the seller.

The package and listing are invalidated when their source form fields change. The seller must generate a fresh package before uploading. The generated title, description, tags, price, product name and research snapshot are passed together to the upload form.

## Returning files to the app

1. Download the assistant's final files and listing images to the phone.
2. Extract an outer convenience download ZIP before selecting the actual Etsy PDF/ZIP files.
3. Open the upload form from the same product's Studio result. Select the actual deliverables and real product previews, review the auto-filled listing and price, and confirm that the final files were tested.
4. The app stages each file and image in a separate authenticated request. Only after all parts arrive does it finalize the product record. Temporary parts expire after one hour; completed staging parts are removed.
5. Missing/expired parts, invalid PDFs, declared paper-size mismatches, missing supported formats, duplicate files, a changed product name/type, incorrect tag count or file names that do not match the handoff stop completion.
6. Create the Etsy draft, inspect it in Etsy, and publish it manually.

PDF validation checks parseability, encryption, page existence and paper dimensions where identified in the filename. It does not verify puzzle solutions, spelling, image fidelity or every embedded ZIP member. Those require the product-specific QA and seller review. Image/header and ZIP-directory checks must not be represented as a full visual/content audit.

## Compatibility and release order

The old multipart product endpoint remains supported. New mobile clients use `/api/digital/upload-part` followed by a small metadata-finalization request. Deploy the Worker first and publish the mobile update after it is available. No new mobile native package was added, so the existing 0.8.6 preview runtime is retained.

The app cannot download files from a ChatGPT or Claude account by itself. The seller downloads and selects those files. It also does not publish digital Etsy listings automatically.

## Other fixes in this batch

- Disabling Pinterest automation stops existing scheduled automatic jobs; an explicit manual run remains distinct.
- Pending approvals recheck consent and blocking status; manual handoff no longer records an unsent outbound message as delivered or enables automatic replies.
- Missing management credentials fail closed; public health and policy routes remain available.
- Local phone catalog records survive refresh; failed secondary service requests do not take the dashboard offline.
- Agent conversation history is retained locally and supplied as bounded context.
- Calendar year resolution, explicit per-page coloring artwork, A-Z animal mapping and escape-room defaults are consistent with the generated product.
- Shopier catalog pagination, existing edit currency/media, storefront retry, and partial sales-count labels are corrected.

## Remaining separate work

- Customer, approval and inbound-message records now use the transactional SQLite-backed CRM object; see `CRM_STORAGE.md` for deployment and validation. The legacy development Node server remains separate.
- Native Android and authenticated production end-to-end checks require the real device/service sessions. Unit tests and bundle builds do not establish those results.
- Rate limiting, retry/resume of interrupted staging and full ZIP-content inspection are not implemented by this batch.

## Validation

Run `npm test`, `npm run typecheck`, `npx tsc --noEmit` in `apps/mobile`, and `npx wrangler deploy --dry-run` from the root. Tests use parseable PDF fixtures and mocked external APIs; they do not send real messages, pins or listings.

## Product identity and topic matching

New Studio packages receive a server-stored handoff ID valid for 30 days. The upload form locks name, kind and product type; the server checks these fields against that ID. Generate a new package to change identity or replace an expired handoff. Legacy clients without an ID retain the existing checks. Saved products retain the handoff ID for traceability.

Long deliverable names preserve both their beginning and final format suffix within the filename limit. Topic comparison uses title/tags, known theme synonyms, remaining search anchors and calendar year. It is a conservative text filter, not a full visual or package-equivalence audit; review the returned sample before accepting the suggested price. Fewer than three matches stops generation.

## Guided workflow and publication checks

The mobile GXL Rehber shows the current next action in Studio, the upload form and the saved product: research/listing preparation; assistant production and phone download; file/image/QA review; Etsy draft transfer; Etsy review/publication. It never treats a prepared prompt or completed draft upload as proof of a published listing. Its helper icon uses the existing app icon set and requires no new native dependency.

New mobile uploads require an image, the final test acknowledgement, 13 distinct tags within the field limits and a positive price. The server also refuses a product with no usable USD/TRY price. Failed or partial image/file counters are not considered a completed transfer. The seller can read the current Etsy state with the authenticated per-product `etsy-status` endpoint and button. The state check verifies the listing belongs to the connected shop and does not publish or modify the listing. A physical-publication response without a confirmed active state triggers a read-back; it is never defaulted to active.

Validation includes a single mocked external-API pipeline from a researched product plan through individual staged files/images, final product identity and metadata, partial Etsy file-upload failure and resume in the same draft, and draft/active state verification. It checks that title, description, all tags and suggested price reach Etsy unchanged. The test uses parseable PDF fixtures and a repository PNG for upload mechanics; it does not inspect a real product's content or buyer experience. No real Etsy listing was created or published.

## Trend priority and agent context

Trend ranking evaluates the tracked fixed niches, discoveries and upcoming season queries. It no longer truncates automatic selection to the first 30 candidates. Freshness is six hours, matching the scan cache; stale results appear below fresh evidence and are labeled for rescan. Top product recommendations exclude known samples smaller than three listings. An unscanned discovery receives no invented score. Automatic Studio selection rotates among the strongest fresh matches for the chosen kind; without a current measured winner it requests a scan and labels unverified fallback data.

The owner agent receives measured product ideas and timestamps from the same candidate pool. Direct product-ranking questions use deterministic priority ordering even when an AI provider is configured. General AI responses receive the ranked evidence and instructions to distinguish measurements from guesses. No fresh evidence produces a rescan instruction rather than a fabricated winner. Each group contributes up to five ideas so one group cannot hide the others.

The opportunity score uses 40% age-adjusted favorite interest, 25% competition, 20% share of recently created listings and 15% price. It is not a probability of sales or attention. Favorites/month is a lifetime age-adjusted average, not observed growth during the last month; new listings are not necessarily new shops. Recently created listings' tags are separately marked, while a tag discovered in the full sample is not advertised as a confirmed rising search. Google Trends links do not provide an integrated search-volume dataset.

The automatic scanner still attempts only one query per 30-minute cron run. Failed attempts now rotate away instead of blocking later queries; the displayed run count is labeled attempts. API configuration is required before the status reports automatic scanning enabled. The ranking covers measured candidates, not all of Etsy. Visual appeal, actual search volume, conversion and product-market fit require separate evidence or real listing experiments.
