# Goxi: contextual listing guide

Implemented November 6, 2026. Goxi is a visible code-native character and speech card in the seller app. It requires no image download, new native module, chat subscription or API call. The existing 0.8.6 preview runtime is retained.

## Entry points and instructions

- Home: the guide introduces the listing journey and opens the existing product chooser.
- Overview: the guide opens the Etsy center.
- Product/channel chooser: the guide explains the physical, digital and channel choices before the seller selects one.
- Etsy Trend: the guide explains how a trend transfers into Studio and provides a direct Studio action.
- Digital Studio: instructions switch from product-specific research to the selected ChatGPT/Claude production handoff. The share action uses the current prepared package; the upload action carries the same product identity, listing, price, handoff and research. Sharing never marks production complete.
- Seller-owned pattern Studio: instructions preserve authorship, test-making and actual finished-product photos. Goxi does not offer AI pattern generation. Its actions reuse the existing author/test/photo validation and upload metadata.
- Photo Studio: instructions follow the actual wizard step or missing photo/product/price/shipping data. Gallery and Next actions reuse existing validation. Next never silently calls an AI API. The old wizard wording that implied automatic analysis on Next is corrected.
- Shopier-to-Etsy planner: the guide requests actual provenance, measurements and shipping data before research, then follows the existing physical listing result.
- Digital upload: the guide opens the real file and image pickers; its save action appears only when existing progress checks are ready and still runs the existing identity/field checks and confirmation.
- Saved digital products: the guide can run read-only file QA, request a confirmed draft transfer, or verify the Etsy status. A failed file audit directs correction and suppresses the completed-state claim. Partial uploads reuse the same existing retry flow.
- Physical listing result: the guide distinguishes eligibility issues, draft review and independently verified active state. Its actions reuse existing draft confirmations or open the actual Etsy result. It does not publish automatically.

The current instruction stays visible in the card. A collapsible roadmap explains the full journey; previous roadmap labels are not treated as completed checks. Publication completion requires active state, not merely prepared text, a shared prompt, stored files or an Etsy draft. Network-required guide actions are disabled while disconnected where the containing flow exposes connectivity state.

## Validation

All 265 automated tests pass. New behavior checks cover Home entry, Trend-to-Studio navigation, disconnected preparation, photo-wizard validation without an implicit API call, seller-owned patterns and failed file QA. The existing actual-screen-to-Worker listing test now uses Goxi's research, share, upload, file picker, image picker, save, audit and draft actions, and still verifies exact listing metadata, no writes from read-only QA and no automatic publication.

Root/mobile TypeScript checks and offline Android export pass. Native controls and external services remain controlled substitutes in automated tests. This is not a real phone layout, native picker, generated product-content or live Etsy publication certification. The seller must install the published preview update and inspect the character and instructions on their phone. No live listing, customer message or pin was published during QA.
