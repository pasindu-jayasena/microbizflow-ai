# Architecture

## Scope and system boundaries

The public web app presents business information and submits booking requests. The Worker API validates requests and owns all database access. The same handler runs in a Pages Function, so the browser and API share an origin. Owner endpoints require an authenticated, business-scoped session. D1 stores business configuration and operational records. The assistant can use a no-key extractor or an optional Cloudflare AI adapter; the core booking workflow works without inference. External integration adapters remain planned.

The first business is a fictional two-chair barbershop in `Asia/Colombo`. Business time zone, services, working hours, and bookable resources are data, not shared-code constants. This permits another appointment-based business to use the booking engine.

Owners can edit public name, description, address, and phone through a protected route. Time zone and currency remain fixed for the initial business because changing either while appointments exist needs an explicit migration plan.

## Booking correctness

Appointments reserve a specific resource for a time interval. Pending and confirmed bookings occupy capacity. The database rejects overlapping reservations on the same resource with insert/update triggers. A single `INSERT ... SELECT` chooses the first free active resource; a racing request can use the other chair or receive a conflict. Availability shown to users is advisory, and submission rechecks it atomically. SQL constraints and explicit status transition rules protect correctness when requests race. UTC ISO timestamps are stored for instants; display and working-hours calculations use the business's IANA time zone.

## Data model plan

Implemented tables: businesses, services, resources, working_hours, appointments, appointment_audit, owner_sessions, login_attempts, public_request_limits, workflow_events, notifications, notification_audit, customer_records, enquiry_analyses, inbound_webhooks, owner_tasks, and crm_sync_events. External provider configuration remains planned. Every private row carries or derives a business scope. Business IDs are explicit in private queries. Foreign keys, unique idempotency keys, state checks, and indexes support integrity and performance. Migrations are versioned SQL files.

## Security and AI

Public routes expose only publishable business and availability data. Owner routes use PBKDF2 password verification and hashed, expiring D1 sessions in HTTP-only, SameSite=Strict cookies. The API checks request origins, and production HTTPS adds the Secure cookie flag. Zod schemas validate API input; SQL parameters prevent injection. Request bodies are bounded, and database-backed per-client limits protect booking, assistant, and login endpoints. Logs omit secrets and private enquiry content. The assistant uses deterministic extraction by default; an optional Cloudflare AI binding requires visitor consent and validated structured output. AI cannot submit a booking. Customer-facing notification drafts require owner approval and use a mock delivery adapter; no external message is sent.

## Decisions pending implementation

Customer lookup and cancellation use the booking reference plus a private random UUID shown at submission, sent in POST bodies and matched within the business. This is a bearer code: anyone who obtains both values can act on the booking. Stronger verified customer accounts and recovery remain future work. Cancellation is allowed for pending or confirmed bookings until 30 minutes before the visit; the database records the status change and audit event.

Owners can delete a customer record after all its bookings reach terminal states. A D1 batch removes the record and linked assistant analyses, anonymizes booking personal fields, and changes private booking codes while preserving status and audit history. An owner-run retention action processes up to 10 customers whose every booking is resolved and ended at least 365 days earlier, plus up to 100 unbooked assistant analyses older than 365 days. Scheduled cleanup remains planned. A standalone hourly Worker handler prepares approval-gated reminder drafts and recovers bounded event batches; its Cron Trigger is checked in but not deployed. A mock CRM adapter records durable sync outcomes without external calls; real provider adapters remain future work. Other remaining work includes stronger customer identity and broader language evaluation. The current owner model is a single local account per deployment; multi-tenant owner management is future work. Cloudflare free-tier limits and applicable package licenses must be rechecked before deployment.
