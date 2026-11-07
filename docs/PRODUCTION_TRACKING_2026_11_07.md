# Persistent production context through Etsy publication — 2026-11-07

## Problem

The previous flow saved only one printable workspace and opened the share sheet without recording any production stage. Returning from ChatGPT/Claude or restarting the app could show product research again instead of the selected listing. The seller could not tell which title, description, tags and price belonged to the current work.

## Changes

- Add a per-product local production ledger keyed by the server handoff identity, preserving the full selected workspace, assistant, listing metadata, scope and bounded stage history. Up to fifty records are retained; reaching the limit reports an error instead of silently discarding unfinished work. Writes are serialized within the app runtime.
- Keep the legacy workspace key and migrate a compatible existing package. Its old production stage is explicitly unknown, never invented. Preserve all existing prepared records when another product is selected. The work list lets the seller resume an earlier project.
- On startup, resume the selected unfinished production in simple or expert mode without silently requesting new research. Returning to the foreground restores local progress; when online, bounded read-only product and Etsy-status requests reconcile the current linked product.
- Display selected title, description, all thirteen tags, price and scope in the same production view. Preserve exact selected metadata into the upload form. Goxi explains the next required action at each phase.
- Record opening the share sheet separately from the seller confirming generation. Share, production, artwork, QA, files-ready and downloaded milestones are not file or publication verification. Continuation text refers to the same exact product and explicitly requests the previous package when context is absent. Explain that share can create a new assistant chat: copy continuation text into the existing conversation.
- Append a product-bound GXL_PROGRESS JSON contract to the outgoing package. An imported receipt may update only the reporting assistant's production stage and must match both project ID and product name. It cannot change listing metadata, mark phone downloads, upload files, create drafts or mark publication. Imported status is labeled an assistant report, not verified file QA.
- Actual product upload and draft evidence update the linked record. Only a successful Etsy API read returning active for the linked, completely transferred listing marks publication verified. Failed or nonactive checks do not complete the project. No assistant text can substitute for that read.
- Production handoff identities no longer expire after thirty days. Suggestion quotes still have their separate short lifetime. This prevents newly selected projects losing server identity while files are still being made. Previously expired legacy identities cannot be recovered from deleted KV data by this change.
- Distinguish local tracking-storage failures from successful server uploads. Do not falsely report an uploaded product as failed and encourage duplicate uploads.

## Validation and boundaries

Full suite: 364 passed, zero failures. Additional focused production tests pass after final wording changes. Root and mobile TypeScript, web build and Android Expo export pass. Tests cover multiple projects, exact retained metadata, restart/offline resume, legacy startup migration, mismatched receipts, prohibited status escalation, identity matching, partial transfers, failed/nonactive Etsy status, durable handoff identity and preventing share when local persistence fails. Existing UI-to-Worker integration still exercises upload, file audit, draft and simulated active status.

Hosted sandbox browser QA: selected a weekly-planner offer, opened its outbound package, verified exact listing metadata plus product ID in tracking instructions, imported a matching QA-stage sample report, reloaded the app and saw the same project and QA stage automatically restored. Full description, thirteen tags, price and scope remained present. These are synthetic market/store responses, not the user's real Tosery files or live Etsy publication.

The app cannot read consumer ChatGPT/Claude conversations or automatically retrieve their files. The seller supplies external progress manually or imports the bound status block, then selects downloaded files. Consumer subscriptions are not API credentials. This is local phone persistence, not cross-device/cloud backup: clearing app data, uninstalling, device loss, storage corruption or storage failure can affect recovery. It is not a guarantee against every failure. No real Etsy listing was published and no real assistant message was sent during this work. OTA success does not prove receipt on the user's phone.

Follow-up: persist the share-opened milestone before invoking the OS handoff, so an app process killed while ChatGPT/Claude is foregrounded retains that stage. A thrown share error restores the previous stage if no later progress has arrived. The same helper covers guided and manual package sharing. A regression test observes durable storage at the exact share invocation.
