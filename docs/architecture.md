# Architecture

## Scope and system boundaries

The public web app presents business information and submits booking requests. The Worker API validates requests and owns all database access. The same handler runs in a Pages Function, so the browser and API share an origin. Owner endpoints require an authenticated, business-scoped session. D1 stores business configuration and operational records. Optional LLM adapters classify enquiries, generate drafts, and interpret owner requests; deterministic fallbacks keep the workflows operable without inference. The HubSpot contact adapter is implemented for synthetic development use but awaits a live credential test.

The first business is a fictional two-chair barbershop in `Asia/Colombo`. Business time zone, services, working hours, and bookable resources are data, not shared-code constants. This permits another appointment-based business to use the booking engine.

Owners can edit public name, description, address, and phone through a protected route. Time zone and currency remain fixed for the initial business because changing either while appointments exist needs an explicit migration plan.

## Booking correctness

Appointments reserve a specific resource for a time interval. Pending and confirmed bookings occupy capacity. The database rejects overlapping reservations on the same resource with insert/update triggers. A single `INSERT ... SELECT` chooses the first free active resource; a racing request can use the other chair or receive a conflict. Availability shown to users is advisory, and submission rechecks it atomically. SQL constraints and explicit status transition rules protect correctness when requests race. UTC ISO timestamps are stored for instants; display and working-hours calculations use the business's IANA time zone.

## Data model plan

Implemented tables include businesses, services, resources, working_hours, appointments, appointment_audit, owner_sessions, login_attempts, public_request_limits, workflow_events, notifications, notification_audit, customer_records, enquiry_analyses, inbound_webhooks, owner_tasks, crm_sync_events, leads, assistant_runs, and assistant_proposals. Every private row carries or derives a business scope. Business IDs are explicit in private queries. Foreign keys, unique idempotency keys, state checks, and indexes support integrity and performance. Migrations are versioned SQL files; 0010–0013 are currently applied locally and await production deployment review.

## Security and AI

Public routes expose only publishable business and availability data. The local owner setup supports PBKDF2; the deployed Free-tier demo uses a generated 256-bit password with a salted SHA-256 verifier to fit the Workers CPU budget. Both paths issue hashed, expiring D1 sessions in HTTP-only, SameSite=Strict cookies. The API checks request origins, and production HTTPS adds the Secure cookie flag. Zod schemas validate API input; SQL parameters prevent injection. Request bodies are bounded, and database-backed per-client limits protect booking, assistant, and login endpoints. Logs omit secrets and private enquiry content. The assistant uses deterministic extraction by default; an optional Cloudflare AI binding requires visitor consent and validated structured output. AI cannot submit a booking. Customer-facing notification drafts require owner approval and use a mock delivery adapter; no external message is sent.

The public `/owner-preview` route holds four hard-coded fictional appointments and an interactive AI and automation walkthrough in browser memory. Its filters, status buttons, and sample workflow do not call owner APIs or persist data. The authenticated `/owner` route remains the only interface for real owner records and actions.

The server defaults to demo mode. Public booking requests must use a reserved `@example.invalid` contact, and the server replaces submitted names and notes with a fixed fictional name and an empty note. These rules are configured through `DEMO_MODE` rather than shared booking logic. A production business would need a separate real-data privacy and deployment review before setting `DEMO_MODE=false`.

The scheduled Worker releases at most two demo reservations more than 24 hours after creation on each hourly run. A transactional D1 batch cancels and anonymizes each booking, invalidates its private code, removes linked assistant analyses, and deletes the customer record only if no other booking uses that contact. The audit trigger records the cancellation actor as `system`. This restores shared inventory for new demo visitors; the reset is disabled when `DEMO_MODE=false`. The same private Cron processes small bounded batches of reminder, follow-up, webhook, and CRM events without requiring n8n to remain running.

## Decisions pending implementation

Customer lookup and cancellation use the booking reference plus a private random UUID shown at submission, sent in POST bodies and matched within the business. This is a bearer code: anyone who obtains both values can act on the booking. Stronger verified customer accounts and recovery remain future work. Cancellation is allowed for pending or confirmed bookings until 30 minutes before the visit; the database records the status change and audit event.

Owners can delete a customer record after all its bookings reach terminal states. A D1 batch removes the record and linked assistant analyses, anonymizes booking personal fields, and changes private booking codes while preserving status and audit history. An owner-run retention action processes up to 10 customers whose every booking is resolved and ended at least 365 days earlier, plus up to 100 unbooked assistant analyses older than 365 days. The standalone hourly Worker also processes at most one such customer and 10 unbooked analyses per invocation. It prepares approval-gated reminder drafts and recovers bounded event batches; its Cron Trigger is deployed, while live CPU usage and the first scheduled outcome still need observation. The public demo's CRM adapter records outcomes without external calls; an optional HubSpot adapter remains disabled pending a scoped credential and privacy review. The owner assistant uses allowlisted queries and a proposal table; its service-price update is gated by a fresh authenticated decision and a stale-price check. Other remaining work includes stronger customer identity and broader language evaluation. The current owner model is a single local account per deployment; multi-tenant owner management is future work.
