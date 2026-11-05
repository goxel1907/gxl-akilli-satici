# Etsy listing workflow: app, assistant and phone files

## Product preparation

1. Select the digital product kind and the intended Etsy search in Studio.
2. Prepare the package. The updated app requests fresh research for that search. Only digital listings classified as the same product kind enter the comparison. At least three comparable listings and usable price data are required; failed research does not silently reuse an old price.
3. Review the sample size, query, timestamp and suggested USD price. This is an observed sample and a pricing suggestion, not Etsy sales data or a sales forecast.
4. Share the combined package with the selected ChatGPT or Claude app. The seller chooses the destination in the phone's share sheet. This is a user-directed handoff, not an authenticated connection to the seller's assistant account.
5. Complete every production and QA step in the same conversation. Actual product files, file names, listing text and image overlays use American English. The assistant speaks Turkish with the seller.

The package and listing are invalidated when their source form fields change. The seller must generate a fresh package before uploading. The generated title, description, tags, price, product name and research snapshot are passed together to the upload form.

## Returning files to the app

1. Download the assistant's final files and listing images to the phone.
2. Extract an outer convenience download ZIP before selecting the actual Etsy PDF/ZIP files.
3. Open the upload form from the same product's Studio result. Select the actual deliverables and real product previews, review the auto-filled listing and price, and confirm that the final files were tested.
4. The app stages each file and image in a separate authenticated request. Only after all parts arrive does it finalize the product record. Temporary parts expire after one hour; completed staging parts are removed.
5. Missing/expired parts, invalid PDFs, declared paper-size mismatches, missing supported formats, duplicate files, a changed product name, incorrect tag count or file names that do not match the handoff stop completion.
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

- Customer, approval and message arrays in the production Worker still require a durable, concurrency-safe storage migration. Do not describe the CRM as a production database.
- Native Android and authenticated production end-to-end checks require the real device/service sessions. Unit tests and bundle builds do not establish those results.
- Rate limiting, retry/resume of interrupted staging and full ZIP-content inspection are not implemented by this batch.

## Validation

Run `npm test`, `npm run typecheck`, `npx tsc --noEmit` in `apps/mobile`, and `npx wrangler deploy --dry-run` from the root. Tests use parseable PDF fixtures and mocked external APIs; they do not send real messages, pins or listings.
