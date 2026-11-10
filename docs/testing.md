# Testing

Run `npm run typecheck`, `npm run lint`, `npm test`, `python -m unittest discover -s tests`, and `npm run build` from the repository root. With `npm run dev:pages` running against migrated and seeded local D1, run `npm run test:integration:local` and `npm run test:ai:local`.

The current unit suite covers working hours, time-zone conversion, two-resource availability, adjacency, status transitions, and owner password verification. Python tests apply all migrations to SQLite and check overlap triggers, idempotency constraints, and audit records. The local HTTP smoke test sends three simultaneous requests for the same slot, expects two reservations and one conflict, and checks idempotent replay. Manual local checks covered owner login, private list access, valid and invalid transitions, logout, and the Pages Function route.

Latest measured local results on 2026-11-11: TypeScript check passed; ESLint passed; Vitest 17 tests passed; Python unittest 2 tests passed; Vite build passed; local booking and no-key AI smoke tests passed; Pages owner route returned a protected list after login. `npm install` reported zero audit findings after the patched development dependency override.

Automated browser end-to-end coverage, CSRF tests, owner route integration automation, workflow retries, and outbound approval gates remain to be added. The AI suite covers invalid model output, provider failures, timeouts, and limited retry behavior. The deployed demo also needs an end-to-end booking check against its public HTTPS URL. The first GitHub CI run passed for commit `bdac60d7b772dd7aa0a6fc639e38c85f74b6e0bf`.
