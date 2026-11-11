# MicroBizFlow AI

**Intelligent Customer Management and Business Automation for Small Businesses.**

MicroBizFlow AI is an open-source booking and customer workflow application for small service businesses. Its first example is **Harbour Cut Studio**, a fictional two-chair barbershop in Sri Lanka. Business hours, time zone, services, and resources are stored as data so the booking logic can support other appointment-based businesses.

## Current status

A working **local MVP** includes service browsing, real slot availability, pending booking requests, database-enforced chair capacity, idempotent submissions, reference-and-code status lookup and cancellation, owner sign-in, appointment decisions, searchable and exportable owner appointments, business-profile, service, and working-hours management, searchable customer records with private notes, owner analytics from stored records, a no-key English/Sinhala enquiry assistant with a structured owner review queue, approval-gated mock notifications, and optional signed inbound webhooks that create owner follow-up tasks. The public repository exists, but **no public demo has been deployed**. Remote AI inference and inbound webhooks are optional and unconfigured in the checked-in deployment settings. Real messaging and external CRM integrations are still on the [roadmap](docs/roadmap.md). Do not use the current build for real customer data.

![Customer page at desktop width](docs/screenshots/customer-desktop.png)

[Narrow viewport preview](docs/screenshots/customer-mobile.png) · Screenshots show fictional demonstration data.

[Owner sign-in preview](docs/screenshots/owner-login.png)

## Local setup

Requires Node.js 24+, npm, and Python 3.12+ for the SQL tests. Wrangler is installed through npm. No Cloudflare account or paid API is needed for local development.

```sh
npm ci
npm run db:migrate:local
npm run db:seed:local
npm run owner:setup:local
npm run build
npm run dev:pages
```

The owner setup command prompts for a password and writes a PBKDF2 hash to ignored `.dev.vars`. It never prints or stores the plaintext password. Choose a local password you can remember. Open `http://127.0.0.1:8788/` for booking and `/owner` for the protected owner view. The local username is `owner`. The seed business and all intended test records are fictional. Use synthetic contact details ending in `.invalid` when trying bookings.

For frontend hot reload, run `npm run dev:api` and `npm run dev:web` in separate terminals instead of `dev:pages`. The Vite page is at `http://127.0.0.1:5173/` and proxies `/api` to the local Worker at port 8787. `npm run build` refreshes the static Pages output. Wrangler's local D1 data lives under ignored `.wrangler/`.

## Checks

```sh
npm run typecheck
npm run lint
npm test
python -m unittest discover -s tests
npm run build
# With npm run dev:pages running in another terminal:
npm run test:e2e
npm run test:integration:local
npm run test:ai:local
# Set LOCAL_OWNER_PASSWORD first for the protected workflow test:
npm run test:workflow:local
npm run test:config:local
npm run test:customers:local
npm run test:analytics:local
npm run test:cancellation:local
npm run test:webhook:local
npm run test:enquiries:local
```

The Playwright suite creates a fictional browser booking and verifies owner routes require sign-in. It starts Pages if needed, uses installed Chrome on Windows, and runs in CI after local D1 migration and seed. On Linux, install Chromium with `npx playwright install chromium`. The integration smoke test creates fictional bookings in the local D1 database. It checks that simultaneous requests fill two chairs, a third conflicts, and an idempotent replay returns the same reference. [Testing notes](docs/testing.md) record the current results and limits.

The assistant smoke test checks English and Sinhala suggestions without a model key. The [AI evaluation](docs/ai-evaluation.md) describes supported cases and limits. A configured Cloudflare Workers AI binding can use JSON mode only after the visitor explicitly opts in; malformed output, timeouts, and quota errors fall back to deterministic extraction. The UI requires a customer to pick a real available slot before submitting.

The protected workflow smoke test needs `LOCAL_OWNER_PASSWORD` set in that terminal; it never prints it. It creates a fictional booking, confirms it through the owner API, approves the resulting customer draft, and verifies mock delivery without sending a real message. See [automation behavior](docs/automation.md).

## Architecture

React, TypeScript, Vite, and Tailwind CSS power the web UI. A TypeScript Cloudflare Worker handles REST routes with Zod validation. The same handler runs as a Cloudflare Pages Function, keeping the web app and session cookie on one origin. Cloudflare D1 stores the configuration, appointments, owner sessions, and audit records. The database rejects overlapping reservations on a resource. Optional AI can suggest fields, while booking rules remain deterministic. External integrations are planned.

```mermaid
flowchart LR
  Customer[Customer browser] --> Pages[React on Cloudflare Pages]
  Owner[Owner browser] --> Pages
  Pages --> API[Pages Function / Worker API]
  API --> D1[(D1 SQLite)]
  API -. optional .-> AI[Cloudflare AI adapter]
  API --> Events[Durable workflow events]
  Events --> Approval[Owner approval & mock outbox]
```

See [architecture decisions](docs/architecture.md), [deployment prerequisites](docs/deployment.md), and [privacy notes](PRIVACY.md).

## API snapshot

- `GET /api/business` — public business information, services, and hours
- `GET /api/availability?serviceId=...&date=YYYY-MM-DD` — available 15-minute starts
- `POST /api/bookings` — pending booking request with an idempotency UUID
- `POST /api/bookings/status` and `/api/bookings/cancel` — private-code lookup and cancellation
- `POST /api/enquiries/analyze` — structured suggestion, no-key by default
- `GET /api/owner/enquiries` — private structured analysis review queue; no raw message text stored
- `/api/owner/*` — login, session, logout, private appointments, filters, CSV export, summary, and state changes
- `/api/owner/customers*` — protected customer search, appointment history, and private notes
- `GET /api/owner/analytics` — protected booking and workflow metrics calculated from stored records
- `POST /api/webhooks/inbound` — optional HMAC-signed follow-up events; disabled without a server secret

Owner sessions use HTTP-only cookies. Public booking requests and login attempts have database-backed limits. The interface shows pending requests accurately; it does not send customer messages.

## Project documents

- [Roadmap and progress](docs/roadmap.md) · [Progress log](docs/progress.md)
- [Architecture](docs/architecture.md) · [Automation](docs/automation.md) · [Testing](docs/testing.md) · [Deployment](docs/deployment.md)
- [Security](SECURITY.md) · [Privacy](PRIVACY.md) · [Contributing](CONTRIBUTING.md) · [Code of Conduct](CODE_OF_CONDUCT.md)

## License

Original project code is released under the [MIT License](LICENSE). Third-party packages retain their own licenses.
