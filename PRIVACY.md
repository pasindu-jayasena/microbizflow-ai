# Privacy notes

The booking flow needs a customer's name and contact method to process a request. A customer record is grouped by normalized contact; the owner can search it, see appointment history, and store a private note. These records are available only through authenticated, business-scoped owner routes. The application should collect only fields needed for these purposes and avoid logging enquiry bodies or credentials. Retention and deletion controls are part of the roadmap and must be completed before using real customer data.

The enquiry assistant runs locally in deterministic mode by default. If a Cloudflare Workers AI binding is configured, a visitor must explicitly opt in before their message is sent to that service. Obvious email addresses and phone numbers are redacted before the model call, but this is not a guarantee that all personal information is removed. The interface asks visitors to avoid personal details. The public demo is planned to use fictional records and mock notifications only.

Assistant analysis records retain structured intent, processing mode, latency, review state, and an optional link to a booking. Raw enquiry text is not stored. A linked booking exposes customer contact only to authenticated owners. An owner can delete a customer record once all linked bookings are terminal. This erases the contact and notes, anonymizes linked booking names, contacts, and notes, removes linked assistant analyses, and invalidates the old private booking codes. Booking status, service, time, reference, workflow and audit records remain. The owner can also run a bounded 365-day retention cleanup for fully resolved customers. Scheduled cleanup is still required before real customer data is accepted.

No live application or data processing service is currently deployed by this repository.

Owners can download a CSV containing names, contacts, notes, and booking history. This endpoint requires the owner session and uses `Cache-Control: no-store`; downloaded files must be handled as private data. Export is limited to 1,000 matching appointments per request.
