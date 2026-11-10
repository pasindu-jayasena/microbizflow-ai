# Architecture

## Scope and system boundaries

The public web app presents business information and submits booking enquiries. The Worker API validates requests and owns all database access. Owner endpoints require an authenticated, business-scoped session. D1 stores business configuration and operational records. Optional AI and integration adapters sit behind API interfaces so the core booking workflow works without them.

The first business is a fictional two-chair barbershop in `Asia/Colombo`. Business time zone, services, working hours, and bookable resources are data, not shared-code constants. This permits another appointment-based business to use the booking engine.

## Booking correctness

Appointments reserve a specific resource for a time interval. Pending and confirmed bookings occupy capacity. The database will reject overlapping reservations on the same resource with an insert/update trigger; the API may try another eligible resource after a conflict. Availability shown to users is advisory, and submission rechecks it atomically. SQL constraints and explicit status transition rules protect correctness when requests race. UTC timestamps are stored for instants; display and working-hours calculations use the business's IANA time zone.

## Data model plan

Core tables: businesses, business_settings, services, resources, working_hours, customers, enquiries, appointments, and appointment_audit. Later tables cover sessions, workflow_events, approval_requests, notifications, and integration_settings. Every private row carries or derives a business scope. Business IDs are explicit in private queries. Foreign keys, unique request keys, state checks, and indexes support integrity and performance. Migrations are versioned SQL files.

## Security and AI

Public routes expose only publishable business and availability data. Owner routes use secure sessions and authorization checks. Zod schemas validate API input; SQL parameters prevent injection. CSRF defenses apply to cookie-authenticated mutations. Logs omit secrets and private enquiry content. AI returns schema-validated suggestions; it cannot create a valid slot or override authentication. AI-generated outbound text requires owner approval, and demo delivery uses a mock adapter.

## Decisions pending implementation

Session design, rate-limit storage, AI provider, and any external integration will be selected and tested in their respective milestones. Current Cloudflare free-tier limits and applicable package licenses must be verified before deployment.
