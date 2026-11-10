# Privacy notes

The planned booking flow needs a customer's name and contact method to process a booking request. The application should collect only fields needed for that purpose, restrict owner access to the relevant business, and avoid logging enquiry bodies or credentials. Retention and deletion controls are part of the roadmap and must be completed before using real customer data.

Optional AI processing may send a customer's enquiry text to a configured third-party provider. The interface must disclose this before real-data use, minimize information sent, and provide a no-key deterministic mode. The public demo is planned to use fictional records and mock notifications only.

No live application or data processing service is currently deployed by this repository.
