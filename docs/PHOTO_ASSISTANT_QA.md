# Photo assistant and physical listing audit

## Findings and changes

- The screenshot's photo analysis button calls a server API; a ChatGPT or Claude chat subscription is not that API connection. The exact cause of the photographed production failure cannot be established from the screenshot alone. No live API credentials or production logs were inspected.
- Added a chat-based alternative to physical Photo Studio in expert and simple modes. It shares an American English analysis prompt through the native share sheet. The seller chooses ChatGPT or Claude, attaches the photos separately in that chat, then pastes the JSON response back into the app. This route makes no server AI request. It does not sign into, control or bill the seller's chat accounts.
- The imported JSON must match a per-request ID and the current photo/product identity. Incompatible fields, unknown risk flags, wrong types and malformed JSON are rejected. The import does not verify or fill a precious-metal/material claim, maker, ownership or Etsy eligibility. Existing fields are retained; risk flags are merged rather than removed. Seller review remains necessary.
- The simple wizard no longer silently starts server analysis when proceeding from photos. Manual entry and the external chat route remain available without API credentials.
- Tesbih/other product selection and the Shopier-to-Etsy planner no longer assume seller design or manufacture. The seller must choose provenance. Product changes reset the Shopier planner's previous confirmations.
- Product-specific Turkish/English placeholders replace the sweater examples in tesbih/vintage forms.
- Photo and Shopier listing results are bound to current product, photo, price, shipping and other inputs. Editing inputs removes the stale result from the draft workflow. A late automatic photo analysis cannot overwrite a changed form.
- Gemini requests now use the documented `responseMimeType` and `responseJsonSchema` fields. Rejected requests, denied access, quota limits, invalid responses and timeouts have distinct messages, shared by other server AI features. There is no automatic switch to another paid provider. Provider error payloads are no longer written to logs.
- Every Etsy-accepted digital asset is checkpointed before starting another upload; see `NESTED_TABS_QA.md` for persistence limits.

## Validation

239 tests pass. New tests exercise request identity, import validation, the native share boundary, no-API wizard progression, late responses, both physical listing forms, structured output configuration and API error categories. Existing Trend/Studio/Digital screen scenarios and partial-draft retry tests also pass. Root/mobile TypeScript, local Worker bundling and offline Android export pass.

These are controlled tests, with native hosts and provider/Etsy responses substituted. No live photo inference, phone layout approval, assistant-account access, customer message, pin or Etsy listing publication was performed. A subscription-based chat round trip still requires selecting the target app, attaching photos, copying the response and reviewing it. An unsaved physical form/request is not guaranteed to survive an OS process restart.

## Release status

Changes passed local verification. The seller explicitly authorized transfer and deployment to Cloudflare and Expo on November 6, 2026, after an earlier automatic approval review blocked a Wrangler check. GitHub checks and Expo update status must be verified for the release commit. Successful publication does not prove installation on a phone.

## Primary references

- https://help.openai.com/en/articles/9039756-managing-billing-for-chatgpt-and-the-api-platform
- https://support.claude.com/en/articles/9876003-why-is-claude-api-usage-billed-separately-from-my-paid-claude-plan
- https://ai.google.dev/gemini-api/docs/generate-content/structured-output
