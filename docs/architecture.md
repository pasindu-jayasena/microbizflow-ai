# Architecture

## Scope and system boundaries

The public web app presents business information and submits booking requests. The Worker API validates requests and owns all database access. The same handler runs in a Pages Function, so the browser and API share an origin. Owner endpoints require an authenticated, business-scoped session. D1 stores business configuration and operational records. Optional AI and integration adapters remain planned; the core booking workflow already works without them.

The first business is a fictional two-chair barbershop in `Asia/Colombo`. Business time zone, services, working hours, and bookable resources are data, not shared-code constants. This permits another appointment-based business to use the booking engine.

## Booking correctness

Appointments reserve a specific resource for a time interval. Pending and confirmed bookings occupy capacity. The database rejects overlapping reservations on the same resource with insert/update triggers. A single `INSERT ... SELECT` chooses the first free active resource; a racing request can use the other chair or receive a conflict. Availability shown to users is advisory, and submission rechecks it atomically. SQL constraints and explicit status transition rules protect correctness when requests race. UTC ISO timestamps are stored for instants; display and working-hours calculations use the business's IANA time zone.

## Data model plan

Implemented tables: businesses, services, resources, working_hours, appointments, appointment_audit, owner_sessions, login_attempts, and public_request_limits. Customer, enquiry, workflow, notification, and integration tables remain planned. Every private row carries or derives a business scope. Business IDs are explicit in private queries. Foreign keys, unique idempotency keys, state checks, and indexes support integrity and performance. Migrations are versioned SQL files.

## Security and AI

Public routes expose only publishable business and availability data. Owner routes use PBKDF2 password verification and hashed, expiring D1 sessions in HTTP-only, SameSite=Strict cookies. The API checks request origins, and production HTTPS adds the Secure cookie flag. Zod schemas validate API input; SQL parameters prevent injection. Request bodies are bounded, and database-backed per-client limits protect booking and login endpoints. Logs omit secrets and private enquiry content. AI and external messaging are not yet implemented.

## Decisions pending implementation

Remaining design work includes customer identity and cancellation, retention/deletion controls, AI provider and fallback, durable workflow events, notification approval, and external integration adapters. The current owner model is a single local account per deployment; multi-tenant owner management is future work. Cloudflare free-tier limits and applicable package licenses must be rechecked before deployment.
