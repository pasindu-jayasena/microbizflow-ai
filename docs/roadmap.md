# Roadmap

Each completed logical feature requires tests, lint and type checks, a reviewed diff, and a separate commit and push through the verified `Pasindu-jayasena` account. External authentication or provisioning may block those actions while local work continues.

| Phase | Milestone | Exit condition |
| --- | --- | --- |
| 0 | Repository and identity | Owner, commit email, credentials, remote, branch, and working tree verified |
| 1 | Foundation | Requirements, architecture, project rules, license, and initial documentation |
| 2 | Development environment | React/Vite app, Worker, D1 configuration, lint, test, and local scripts |
| 3 | Database | Migrations, business and service schema, fictional seed data |
| 4 | Customer experience | Real service browsing, availability, validated booking form and confirmation |
| 5 | Booking engine | Capacity, collisions, transitions, cancellation, audit and race tests |
| 6 | Authentication | Owner login, secure sessions, scoped authorization and tests |
| 7 | Owner dashboard | Appointments, enquiries, customers, services, hours and settings |
| 8 | AI integration | Validated English/Sinhala extraction, fallback and evaluation |
| 9 | Automation | Durable events, approval, retries, webhook verification and mock notifications |
| 10 | Analytics | Metrics computed from real application records |
| 11 | Integrations | Mock adapters and documented optional configured providers |
| 12 | Security and reliability | Abuse controls, privacy, audits and permission review |
| 13 | Quality and open source | End-to-end tests, CI, screenshots and complete setup documentation |
| 14 | Live demo | Verified HTTPS app, D1, safe demo data and tested booking flow |

Acceptance criteria are the 22 items in the project brief. A phase is not complete merely because files exist; its behavior must be verified and its Git history published under the specified account.
