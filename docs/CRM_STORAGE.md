# Durable customer records

The production Worker routes its dashboard, customer intake, customer list, approval list and approval decisions through the `CRM_STORE` Durable Object binding. The single-shop object name is `GXLMarketStudio:crm:v1`. Agent customer context reads the same store. Process-local arrays from the development Node server no longer supply production CRM responses.

`wrangler.jsonc` provisions the SQLite-backed `CrmStore` class with migration `crm-sqlite-v1`. Keep that migration and stable object name in future deployments. There is no TTL on these records. Tables store customers, approvals and actual inbound message text; approving a draft does not create an outbound-delivery record or enable automatic replies.

All mutation checks and writes execute in a synchronous transaction. The unique customer channel/handle and inbound customer/time/text keys prevent duplicate intake on retries. Matching pending drafts are reused. Concurrent approval/rejection can only decide a pending draft once. Storage failure rolls back the entire change and returns an unavailable response, never a saved response or a fabricated empty dashboard.

Blocked customers stay blocked on later intake. An inbound opt-out removes consent. The final rejected pending draft returns a contact-pending customer to qualified. Out-of-order intake does not replace the latest inbound timestamp with an older date. Signals are validated before persistence.

Only records submitted through authenticated customer intake are stored; this does not add a WhatsApp, Meta, Etsy-message or email synchronization connector. Historical records already lost from volatile process memory cannot be reconstructed. There is no automatic import from the separate development Node server. Customer identity comparison currently uses the supplied channel and exact handle.

Validation: 204 tests passed, including real SQLite close/reopen, 30 concurrent intake retries, 20 duplicate draft requests, conflicting decisions, opt-out and rollback checks. Root TypeScript and Wrangler dry-run passed. A local Workerd check also verified restart persistence and concurrent decisions. Its bundled binary supports compatibility dates through 2026-08-11, so that local check used 2026-08-11; production retains 2026-08-12. Neither local check proves authenticated production or phone behavior.

Cloudflare API references: https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/ and https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/.
