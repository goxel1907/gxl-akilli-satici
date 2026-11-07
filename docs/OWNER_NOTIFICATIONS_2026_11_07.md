# WhatsApp and email notifications for the shop owner

The owner selected both notification channels. The application now provides a persistent settings and delivery panel under the buyer-message helper (simple mode: Müşteri; expert mode: Ajan). These are notifications to the owner, not a new Etsy customer-message transport.

## Current behavior

The owner enters their notification email and country-code WhatsApp number, selects both channels, confirms ownership/opt-in and enables notifications. No address or phone number was assumed from screenshots. No actual notification has been sent during development.

When the existing message helper produces a complete translation and reply, the server queues the original English message, Turkish translation, American English reply draft and its Turkish meaning. Every record explicitly says the customer reply is a draft and has not been sent. A missing/failed AI result is not treated as a complete notification. Manually pasted Etsy messages remain the current input source; this release does not connect Etsy's inbox, Gmail, reviews or an inbound email feed.

Email carries full bilingual text. WhatsApp uses an approved six-variable template and bounded excerpts, with the full content retained in email and the application. No unsolicited customer contact or Etsy publication is performed.

SQLite storage uses additional tables in the existing CRM Durable Object and does not replace CRM records. Settings and the outbox survive process/database restarts. Payload hashes deduplicate repeated enqueue requests; per-channel transaction claims prevent two workers sending the same queued delivery concurrently. Each channel stores pending, sending, accepted, blocked, failed or uncertain. Provider acceptance is not delivery confirmation. A channel already accepted is never resent by a retry of the other channel. A changed recipient blocks older queued content rather than silently redirecting it.

Network failures, malformed provider acknowledgments, upstream 5xx and expired send leases are uncertain and are not retried blindly. A failed attempt known to be rejected can be retried explicitly. Pending work is processed after a real Worker request using waitUntil and by the existing thirty-minute cron; this is not an instant-delivery guarantee. Failed local status persistence after provider acceptance is not represented as successful delivery. There is no universal exactly-once or delivery guarantee.

The legacy development Meta connector no longer returns a fabricated meta-demo accepted ID when it makes no external request.

## Required server connections

All values below are Worker secrets/configuration; never place tokens in the APK or chat.

- `OWNER_ALERT_RESEND_API_KEY`: Resend send-capable API key.
- `OWNER_ALERT_EMAIL_FROM`: authorized sender using a verified sending domain. A recipient's Gmail address does not itself authorize sending from gmail.com.
- `OWNER_ALERT_WHATSAPP_TOKEN`: WhatsApp Business Platform send-capable access token.
- `OWNER_ALERT_WHATSAPP_PHONE_NUMBER_ID`: sending Business Platform number ID.
- `OWNER_ALERT_GRAPH_VERSION`: a supported Graph API version in `vNN.N` format, set explicitly.
- `OWNER_ALERT_WHATSAPP_TEMPLATE`: approved/enabled template name with exactly six body text variables, in this order: product, original message, Turkish translation, English reply draft, Turkish reply meaning, draft status.
- `OWNER_ALERT_WHATSAPP_LANGUAGE`: template language code (default `tr`).

Suggested Turkish template body (submit for approval in WhatsApp Manager; this document does not imply approval):

GXL müşteri bildirimi\nÜrün: {{1}}\nMesaj (EN): {{2}}\nTürkçesi: {{3}}\nCevap (EN): {{4}}\nCevabın Türkçesi: {{5}}\nDurum: {{6}}\nUzun metnin tamamını GXL uygulamasından veya e-postanızdan okuyabilirsiniz.

The panel reports missing pieces and disables the test-send control until selected channel configuration is complete and saved. Configuration presence does not prove credentials are valid, a template is approved, or a notification was delivered; a provider-side live test is still needed after connection.

## API and safeguards

All public routes require the existing application bearer token. Settings, test sends and retries additionally require confirm=true.

- GET `/api/owner-notifications`: settings, connection gaps and most recent delivery records; no provider tokens or internal claim leases.
- POST `/api/owner-notifications/settings`: validated, owner-specific recipient choices and opt-in.
- POST `/api/owner-notifications/test`: owner-requested synthetic test notification, only to saved opted-in recipients.
- POST `/api/owner-notifications/process`: explicit retry for one record; accepted/uncertain channels are not resent.

Provider endpoints are fixed to Resend and Meta. Message text cannot select recipients, endpoints or delivery state. No email HTML is rendered, no message links are opened and provider error bodies/tokens are not exposed in the UI.

## Validation

Automated tests cover route authorization, explicit consent, recipient/header validation, both-channel content, concurrent retries, one-channel failures, missing credentials, unknown transport outcomes, recipient changes, SQLite restart, storage failures, stale leases and the real settings UI. The isolated web sandbox stores only local test settings and cannot reach notification providers. Actual recipient details, provider credentials, sender-domain ownership and WhatsApp template approval were not supplied. Live sending, real delivery and automatic Etsy inbox ingestion remain unverified/unconnected.

Primary implementation references:
- https://resend.com/docs/api-reference/emails/send-email
- https://resend.com/changelog/idempotency-keys (provider idempotency lasts 24 hours; durable accepted/uncertain state prevents blind later resend)
- https://www.postman.com/meta/whatsapp-business-platform/request/o65u5m5/send-message-template-text
- https://github.com/etsy/open-api/discussions/1645 (no conversation API scopes/endpoints)

Final validation: 377 automated tests passed, zero failures; root/mobile TypeScript, Android Expo export and the web build passed. Hosted browser inspection on app code daf3c7f verified both channels selected, blank editable owner-recipient fields, ownership/notification opt-in controls, explicit missing-provider status and disabled test sends before setup. No real recipient was entered and no external message was sent. A Worker-to-provider-mock integration also verifies that a completed helper response queues both owner channels while the buyer reply stays a draft.
