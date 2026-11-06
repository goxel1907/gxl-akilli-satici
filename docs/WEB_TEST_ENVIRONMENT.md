# GXL shared-code web test environment

Private test Site: https://gxl-satici-web-test.major-lynx-2547.chatgpt.site

This is the existing React Native application rendered with React Native Web, not a separate screen mockup. The same `App.tsx`, navigation, Goxi, forms, prompts and product workflows run alongside the real Worker router, research/planning logic, file parsing and upload/draft logic. The Worker runs in the browser against a browser-local store. External Etsy responses are synthetic fixtures explicitly marked TEST SAMPLE. There are no production credentials, real connected shops, real assistant inference or outbound publishing in this build.

## Build and hosting

Run `npm ci` in the repository and `npm ci` in `apps/mobile`, then `npm run web:test:build`. Output is `dist/web-test`. The build pins one shared React instance and replaces only native browser boundaries: SecureStore returns a public test sentinel; OTA updates are disabled; constants identify the test build; alerts/sharing use visible browser dialogs; the original Ionicons font/glyph map is retained. Real Expo web document/image pickers and image manipulation are used. Additional React DOM/Web packages are root development dependencies, not new Android native modules.

Source and static output are synchronized to the dedicated owner-private Sites repository. Its manifest retains `project_id=appgprj_6aedd1bd9d7c819186b0f79d15cb6639`, with `static.directory=dist`. Preserve that identity and audience. The Site source helper owns source commits, pushes and deployment archives. Keep runtime production credentials out of both repositories and bundles.

The managed local preview command failed because its preview relay was unavailable. The private hosted deployment succeeded. The cloud browser reached the private Site's sign-in gate and then OpenAI's login page; it had no authenticated ChatGPT session. End-to-end visual/browser interaction tests remain blocked until secure sign-in completes. Successful hosting, compilation and controlled automated tests do not establish that all screens have passed in a real browser or on Android.

## Test tools

- Normal test service responses; application 401; offline network; Etsy disconnect; Etsy 429; staged upload 503.
- Downloadable sample US Letter/A4 PDFs prominently marked WEB TEST ONLY, not saleable product content.
- Method/path/status-only request log with a synthetic-only marker. No headers, credentials, file contents or customer data are exported.
- Local synthetic draft metadata viewer: compare the actual title, tags, description, price and file/image progress produced by the workflow.
- Dedicated local IndexedDB for text/binary test assets and synthetic Etsy drafts. Product records and drafts survive browser reload. Reset clears only this Site's local test storage.
- Explicit browser share dialog for inspecting/copying/downloading the complete outgoing assistant text. It marks output as synthetic and does not claim delivery to ChatGPT/Claude.

The fetch adapter has no external network fallback. Browser CSP also restricts connection destinations to the current origin and local blob/data resources. Unknown external service paths fail closed. Publishing, message approval, tracking, account connection and shop-setting writes are blocked. Synthetic draft/file/image requests use the production code against local fixtures; no actual Etsy listing is created. Commerce/account links show the web-test boundary rather than opening real seller accounts.

## Shared fixes

Android multipart transport accepts URI descriptors, while browser FormData requires actual File/Blob bytes. `appendLocalFile` now chooses the correct representation and rejects empty/unreadable browser files; digital staged uploads and photo uploads both use it. Android behavior stays on the existing URI path. Diagnostics retain an explicit `synthetic-web` environment marker and downgrade simulated successful observations to warnings, so test responses cannot be mistaken for independent live-phone verification.

## Verification

289 automated tests pass, including eight sandbox/transport scenarios. Root/mobile TypeScript checks, the browser bundle and the Android Expo export pass. These results do not include authenticated browser or Android-device execution.

Automated coverage includes actual protected Worker routes, marked synthetic research, independent failure scenarios, blocked write paths, real PDF storage/audit and local Etsy draft creation, synthetic draft restart persistence, diagnostics provenance, and browser multipart bytes/error handling. Existing actual-component navigation/workflow tests continue to cover the shared UI with controlled native boundaries. Root/mobile type checks, the browser bundle and Android export are checked separately. Real Android layout/pickers, real private Etsy permissions and drafts, actual assistant receipt/output, product answers/design/printing and sales performance remain separate unverified tasks.
