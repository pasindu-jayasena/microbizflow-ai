# Testing

Run `npm run typecheck`, `npm run lint`, `npm test`, `python -m unittest discover -s tests`, and `npm run build` from the repository root. With `npm run dev:pages` running against migrated and seeded local D1, run `npm run test:integration:local`, `npm run test:ai:local`, and `npm run test:e2e`. Set `LOCAL_OWNER_PASSWORD` before `npm run test:workflow:local`. Playwright uses installed Chrome on Windows; on Linux install Chromium with `npx playwright install chromium` first. If port 8788 is free, Playwright starts Pages automatically.

The current unit suite covers working hours, time-zone conversion, two-resource availability, adjacency, status transitions, and owner password verification. Python tests apply all migrations to SQLite and check overlap triggers, idempotency constraints, and audit records. The local HTTP smoke test sends three simultaneous requests for the same slot, expects two reservations and one conflict, and checks idempotent replay. Manual local checks covered owner login, private list access, valid and invalid transitions, logout, and the Pages Function route.

Set `LOCAL_OWNER_PASSWORD` and run `npm run test:config:local` against local Pages to check owner-only profile, service, and hours APIs. It creates a uniquely named fictional service, verifies its public visibility, then disables it. It verifies invalid values are rejected, writes an existing working-hours row back unchanged, and temporarily changes the public business name before restoring it. It leaves the disabled synthetic service in local D1.

With the same variable set, `npm run test:e2e` also signs in and saves the business profile, a service, and a day through the owner UI. CI creates a disposable local owner with a generated password for this check; it does not use deployment credentials.

`npm run test:customers:local` creates a fictional booking, searches its generated customer record, verifies private appointment history and note updates, then restores the original note. The Playwright booking flow also checks the owner customer view when `LOCAL_OWNER_PASSWORD` is set.

`npm run test:analytics:local` records the current protected metrics, submits a fictional booking, and verifies that booking and workflow counts increase. The dashboard labels synthetic bookings and never presents estimated revenue or business impact as measured results.

`npm run test:cancellation:local` checks that a wrong private code cannot find a booking, the right code can read its status and cancel it, and a repeated cancellation is rejected. The browser test also checks the customer-facing status and cancellation controls.

`npm run test:webhook:local` requires `LOCAL_OWNER_PASSWORD` and `LOCAL_WEBHOOK_SECRET` matching a synthetic `WEBHOOK_SECRET` in ignored `.dev.vars`. It creates a fictional booking, signs a follow-up event, rejects missing or stale signatures, checks duplicate delivery, and completes the owner task. The unit suite tests signature validation without a running server.

The owner browser flow searches appointments and downloads a filtered CSV. Unit tests cover filter validation and formula-safe CSV quoting. The export is protected by the owner session and limited to the latest 1,000 matching rows.

`npm run test:enquiries:local` analyzes a fictional message with a contact string, confirms the raw string is absent from the owner queue, links the structured analysis to a new booking, and verifies one-time owner review. The browser flow checks the linked review card when the assistant is available; local rate limits can suppress that optional part on repeat runs.

`npm run test:privacy:local` creates a fictional customer and linked assistant analysis, confirms anonymous deletion is forbidden and an active booking blocks deletion, then cancels the booking and deletes the customer details. It verifies the owner record and linked analysis disappear, appointment history is anonymized, and the former private booking code no longer works. The browser flow exercises the same owner button and confirmation.

`npm run test:retention:local` creates a fictional booking, checks that active and recent cancelled bookings remain, then moves only that synthetic local appointment into the past with Wrangler and verifies the owner-run 365-day cleanup anonymizes it. It also ages a fictional unbooked assistant analysis and checks that cleanup removes it. Each run processes at most 10 customer records and 100 unbooked analyses. The browser flow checks the owner control.

`npm run test:security:local` checks an owner session cookie is HTTP-only and SameSite=Strict, private routes reject anonymous requests, an authenticated cross-origin request is rejected, the allowed origin can read owner data, DELETE preflight includes the expected method, and logout revokes the session. These are local browser-protocol checks; they do not replace a full external security review.

With `node scripts/wrangler.mjs dev --config wrangler.worker.toml --local --port 8787 --test-scheduled` running, set `LOCAL_OWNER_PASSWORD` and `LOCAL_WEBHOOK_SECRET` to the matching synthetic local values and run `npm run test:scheduled:local`. The script creates a fictional booking and signed follow-up webhook, sets their already-processed local events to a retryable failed state, invokes Wrangler's local scheduled endpoint, and checks both recover without duplicate notice or task records.

`npm run test:reminders:local` uses local D1 to create two fictional confirmed bookings 20 hours ahead. It verifies the owner can queue each reminder only once, a cancelled booking's draft cannot be approved, and the other draft reaches only the mock outbox after owner approval. The browser suite exercises the owner reminder control.

Latest measured local results on 2026-11-11: TypeScript and ESLint passed; Vitest 27 tests passed; Python unittest 7 tests passed; the Vite production build passed; Playwright passed all 3 browser tests. Local enquiry, privacy, retention, session security, scheduled recovery, and reminder smoke tests passed against migrated D1. GitHub CI passed for the published scheduled recovery commit `0411bf9e563a7943d575335542237cd1f2088fd6`; CI for reminders is pending its push.

Scheduled workflow recovery is implemented and locally tested but has not been deployed. Workflow tests cover database event creation, customer draft approval, mock delivery failure and retry. The AI suite covers invalid model output, provider failures, timeouts, and limited retry behavior. The deployed demo also needs an end-to-end booking check against its public HTTPS URL.
