# GXL shared-code web test environment

Private test Site: https://gxl-satici-web-test.major-lynx-2547.chatgpt.site

This is the existing React Native application rendered with React Native Web, not a separate screen mockup. The same `App.tsx`, navigation, Goxi, forms, prompts and product workflows run alongside the real Worker router, research/planning logic, file parsing and upload/draft logic. The Worker runs in the browser against a browser-local store. External Etsy responses are synthetic fixtures explicitly marked TEST SAMPLE. There are no production credentials, real connected shops, real assistant inference or outbound publishing in this build.

## Build and hosting

Run `npm ci` in the repository and `npm ci` in `apps/mobile`, then `npm run web:test:build`. Output is `dist/web-test`. The build pins one shared React instance and replaces only native browser boundaries: SecureStore returns a public test sentinel; OTA updates are disabled; constants identify the test build; alerts/sharing use visible browser dialogs; the original Ionicons font/glyph map is retained. Real Expo web document/image pickers and image manipulation are used. Additional React DOM/Web packages are root development dependencies, not new Android native modules.

Source and static output are synchronized to the dedicated owner-private Sites repository. Its manifest retains `project_id=appgprj_6aedd1bd9d7c819186b0f79d15cb6639`, with `static.directory=dist`. Preserve that identity and audience. The Site source helper owns source commits, pushes and deployment archives. Keep runtime production credentials out of both repositories and bundles.

The managed local preview relay was unavailable, so verification used the owner-private hosted deployment. Secure sign-in subsequently completed. Actual browser checks now cover navigation, Trend → Studio handoff, prompt preview, file selection/upload, failure recovery, structural QA and synthetic Etsy drafts. See [the dated browser QA report](WEB_BROWSER_QA_2026_11_06.md) for the tested boundaries and remaining production checks.

## Test tools

- Normal test service responses; application 401; offline network; Etsy disconnect; Etsy 429; staged upload 503.
- Separate downloadable sample US Letter/A4 PDFs and a preview PNG prominently marked WEB TEST ONLY, not saleable product content.
- Method/path/status-only request log with a synthetic-only marker. No headers, credentials, file contents or customer data are exported.
- Local synthetic draft metadata viewer: compare the actual title, tags, description, price and file/image progress produced by the workflow.
- Dedicated local IndexedDB for text/binary test assets and synthetic Etsy drafts. Product records and drafts survive browser reload. Reset clears only this Site's local test storage.
- Explicit browser share dialog for inspecting/copying/downloading the complete outgoing assistant text. It marks output as synthetic and does not claim delivery to ChatGPT/Claude.

The fetch adapter has no external network fallback. Browser CSP also restricts connection destinations to the current origin and local blob/data resources. Unknown external service paths fail closed. Publishing, message approval, tracking, account connection and shop-setting writes are blocked. Synthetic draft/file/image requests use the production code against local fixtures; no actual Etsy listing is created. Commerce/account links show the web-test boundary rather than opening real seller accounts.

## Shared fixes

Android multipart transport accepts URI descriptors, while browser FormData requires actual File/Blob bytes. `appendLocalFile` now chooses the correct representation and rejects empty/unreadable browser files; digital staged uploads and photo uploads both use it. Android behavior stays on the existing URI path. Diagnostics retain an explicit `synthetic-web` environment marker and downgrade simulated successful observations to warnings, so test responses cannot be mistaken for independent live-phone verification.

## Verification

295 automated tests pass, including nine sandbox scenarios and five browser regression tests. Root/mobile TypeScript checks, the browser bundle and the Android Expo export pass. Authenticated browser checks are recorded separately; these results do not establish Android-device execution.

Automated coverage includes actual protected Worker routes, marked synthetic research, independent failure scenarios, blocked write paths, real PDF storage/audit and local Etsy draft creation, synthetic draft restart persistence, diagnostics provenance, and browser multipart bytes/error handling. Existing actual-component navigation/workflow tests continue to cover the shared UI with controlled native boundaries. Root/mobile type checks, the browser bundle and Android export are checked separately. Real Android layout/pickers, real private Etsy permissions and drafts, actual assistant receipt/output, product answers/design/printing and sales performance remain separate unverified tasks.

Browser-discovered corrections include the XML dependency's missing Buffer global, split-chunk font/image paths, Enter-key Trend searches, accessible search controls, duplicate title phrases, unsupported sales/market claims, and unfinished upload state loss. Closing an upload now pauses the same form instead of discarding metadata, files or the Studio handoff; a different product seed resets it, and a successful save starts a fresh form on the next open. Unsaved selections are kept only while the form remains mounted, not across full reload or phone process termination.
