# Workflow and notification behavior

The appointment database triggers enqueue a durable workflow event when a booking is created or its status changes. The API tries to process the new event immediately. If that step fails, the event remains available for owner-triggered retry in the dashboard. Event keys are unique, processing claims have a 60-second lease, and each event has at most three attempts. Notification event keys are also unique, so replaying an event does not create duplicate drafts.

```mermaid
flowchart LR
  Booking[Booking change] --> Event[(Workflow event)]
  Event --> Process[Claim and process]
  Process --> Notice[Internal notice]
  Process --> Draft[Customer draft]
  Draft --> Approval[Owner approval]
  Approval --> Mock[Mock outbox]
  Process -->|failure| Retry[Retry queue]
  Retry --> Process
```

New booking requests create an internal notice. Confirmed, declined, and cancelled bookings create customer-facing drafts that **cannot** enter the mock outbox until the owner approves them. The mock adapter records delivery locally and sends no external email, SMS, or message. A failed mock delivery can be retried after approval. State changes are audited in `notification_audit`; appointment changes are audited separately.

The owner dashboard shows the latest 50 workflow events and notifications, approval actions, failures, and a “Process pending events” control. The event processor also runs after successful booking and status API calls. The queue is stored in D1 and does not require n8n or another continuously running service.

The private standalone Worker has a deployed hourly UTC Cron Trigger. Its scheduled handler queues reminders and retries bounded batches of workflow, webhook, and CRM events; existing attempt limits, leases, and unique keys still apply. The Pages Function wrapper does not run this scheduled handler. The first live Cron outcome and CPU time still need observation; see [deployment.md](deployment.md).

Confirmed appointments between one and 24 hours away can produce one idempotent reminder draft. The hourly handler queues these automatically when deployed; the owner can also prepare them manually. The current workflow table stores reminder events with the `reminder_due` subject marker. Reminder drafts require owner approval and use only the mock outbox. If a booking is cancelled or its start time passes, approval and retry are blocked. No real reminder is sent.

An optional inbound webhook accepts `POST /api/webhooks/inbound` only when the server-only `WEBHOOK_SECRET` is configured with at least 32 characters. The sender supplies `X-MicroBizFlow-Timestamp` as Unix seconds and `X-MicroBizFlow-Signature` as `sha256=` plus lowercase HMAC-SHA256 hex for `<timestamp>.<raw JSON body>`. The timestamp must be within five minutes. The JSON body is `{ "id": "<UUID>", "type": "booking.followup_requested", "reference": "MBF-1234ABCD" }`. A valid event creates a business-scoped owner follow-up task for an existing booking. Duplicate IDs return the prior state without another task; failed processing stays in D1 for owner-triggered retry, up to three attempts. The owner can mark a task done. The secret is never exposed to the browser or repository.

The webhook is disabled by default. The local `npm run test:webhook:local` script uses a synthetic secret and fictional booking. It verifies HMAC signing, freshness, deduplication, private activity, and task completion. This is an inbound mock integration; it does not call HubSpot, Google, or any messaging provider.

The current implementation does not include a real messaging provider or customer notification retrieval. Enabling any real outbound channel needs credentials, consent, and an explicit provider implementation with delivery idempotency. No real messages should be sent from the public demo.

The lead qualification workflow accepts a consented, fictional email enquiry at `POST /api/leads`. A configured LLM can classify service, timing, language, and priority; validated output or deterministic fallback is stored with latency and mode in D1. A customer record is created transactionally with the lead, and the protected owner lead history is at `GET /api/owner/leads`. Repeated idempotency keys cannot create duplicate records. The [local n8n workflow](n8n.md) calls this same Worker endpoint; the hosted app does not require n8n.

The second n8n workflow checks live availability and sends a booking request to the Worker. It does not carry an owner password or auto-confirm requests. The protected owner dashboard applies the status transition; a D1 audit trigger records it, and the workflow event creates a customer confirmation draft that still requires approval. The Worker and D1 remain the source of truth if n8n is stopped or retries a request.

Booking creation and status changes also enqueue durable mock CRM sync events. The adapter interface is documented in [integrations.md](integrations.md). The mock adapter makes no external request; retries use stable event keys and skip deleted customers. The owner can inspect and retry these events, and the scheduled Worker processes a bounded batch when deployed.
