# Testing

Run `npm run typecheck`, `npm run lint`, `npm test`, `python -m unittest discover -s tests`, and `npm run build` from the repository root. With `npm run dev:pages` running against migrated and seeded local D1, run `npm run test:integration:local`, `npm run test:ai:local`, and `npm run test:e2e`. Set `LOCAL_OWNER_PASSWORD` before `npm run test:workflow:local`. Playwright uses installed Chrome on Windows; on Linux install Chromium with `npx playwright install chromium` first. If port 8788 is free, Playwright starts Pages automatically.

The current unit suite covers working hours, time-zone conversion, two-resource availability, adjacency, status transitions, and owner password verification. Python tests apply all migrations to SQLite and check overlap triggers, idempotency constraints, and audit records. The local HTTP smoke test sends three simultaneous requests for the same slot, expects two reservations and one conflict, and checks idempotent replay. Manual local checks covered owner login, private list access, valid and invalid transitions, logout, and the Pages Function route.

Set `LOCAL_OWNER_PASSWORD` and run `npm run test:config:local` against local Pages to check owner-only profile, service, and hours APIs. It creates a uniquely named fictional service, verifies its public visibility, then disables it. It verifies invalid values are rejected, writes an existing working-hours row back unchanged, and temporarily changes the public business name before restoring it. It leaves the disabled synthetic service in local D1.

With the same variable set, `npm run test:e2e` also signs in and saves the business profile, a service, and a day through the owner UI. CI creates a disposable local owner with a generated password for this check; it does not use deployment credentials.

`npm run test:customers:local` creates a fictional booking, searches its generated customer record, verifies private appointment history and note updates, then restores the original note. The Playwright booking flow also checks the owner customer view when `LOCAL_OWNER_PASSWORD` is set.

`npm run test:analytics:local` records the current protected metrics, submits a fictional booking, and verifies that booking and workflow counts increase. The dashboard labels synthetic bookings and never presents estimated revenue or business impact as measured results.

`npm run test:cancellation:local` checks that a wrong private code cannot find a booking, the right code can read its status and cancel it, and a repeated cancellation is rejected. The browser test also checks the customer-facing status and cancellation controls.

Latest measured local results on 2026-11-11: TypeScript check passed; ESLint passed; Vitest 20 tests passed; Python unittest 4 tests passed; Vite build passed; local booking, no-key AI, and approval workflow smoke tests passed; Pages owner route returned a protected list after login. `npm install` reported zero audit findings after the patched development dependency override.

Automated browser end-to-end coverage, CSRF tests, and scheduled workflow recovery remain to be added. Workflow tests cover database event creation, customer draft approval, mock delivery failure and retry. The AI suite covers invalid model output, provider failures, timeouts, and limited retry behavior. The deployed demo also needs an end-to-end booking check against its public HTTPS URL. GitHub CI passed for commits `bdac60d7b772dd7aa0a6fc639e38c85f74b6e0bf` and `29aba32ea4e7b85450d7d55d0cf4443d331496c0`.
