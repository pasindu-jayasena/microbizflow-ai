# Deployment readiness — 2026-11-12

**Decision: deployed and live on Cloudflare Free.** The owner approved the [resource plan](deployment-plan.md) and requested a public link. The verified app is **https://microbizflow-ai.pages.dev/**. The detailed [deployment record](deployment.md) has the source SHA, resources, commands, checks, and rollback approach.

## Verified

- GitHub CLI authenticated as `pasindu-jayasena`; the public repository is `pasindu-jayasena/microbizflow-ai`. `deploymentBranch` passed branch and PR CI, then was fast-forwarded to `main` through [PR #2](https://github.com/pasindu-jayasena/microbizflow-ai/pull/2). The remote source SHA is `958242ff3e5ecdc78620519b57209e7dfbcff994`. GitHub confirmed Pasindu Jayasena and his verified email for both author and committer. [Main CI](https://github.com/pasindu-jayasena/microbizflow-ai/actions/runs/43101951390) passed, including four browser tests.
- Wrangler `whoami` authenticated the Cloudflare account associated with `pasindujayasena.biz@gmail.com`. It lists one production Pages deployment for `microbizflow-ai` on `main`, D1 `microbizflow-demo` with the intended UUID, and private Worker `microbizflow-api` with one hourly Cron Trigger. The Pages production environment lists only encrypted `OWNER_USERNAME` and `OWNER_PASSWORD_HASH` secrets.
- Nine D1 migrations applied remotely; a later list reported no pending migrations. Only fictional seed data was applied. D1 info showed 18 tables, 245,760 bytes, 148 rows read and 144 rows written over the preceding 24 hours after live testing.
- On clean production source, `npm run check:deployment-config`, TypeScript production build, ESLint, and 32 Vitest tests passed. Before release, four deployment and credential tests, nine Python schema tests, Worker dry run, and local booking concurrency and security smoke tests passed. CI passed four Playwright browser flows with a disposable owner credential.
- Live HTTPS root and `/api/business` returned 200. A synthetic `@example.invalid` booking was created, looked up with its private code, and canceled. Owner login, private-route enforcement, cross-origin rejection, Secure/HttpOnly/SameSite cookie, and logout passed. A real-looking booking contact was rejected. The test did not send real messages.
- Demo mode is enabled in Pages and Worker config. The public demo stores a fixed fictional booking name and discards booking notes. No AI binding, R2, webhook secret, external CRM, messaging provider, or custom domain is configured. The Worker has `workers_dev=false` and `preview_urls=false`.

## Free-tier boundaries and costs

| Service | Use | Free limit checked 2026-11-11 |
| --- | --- | --- |
| [Pages Free](https://developers.cloudflare.com/pages/platform/limits/) | Public React app and Pages Function | 500 builds/month; Functions share Workers quotas |
| [Workers Free](https://developers.cloudflare.com/workers/platform/limits/) | Pages API and one hourly private Cron Worker | 100,000 requests/day; 10 ms CPU per invocation; five Cron Triggers/account |
| [D1 Free](https://developers.cloudflare.com/d1/platform/pricing/) | One demo database shared by Pages and Cron Worker | 10 databases; 5 million rows read/day; 100,000 rows written/day; 5 GB total storage |

The owner reported checking Cloudflare Billing on 2026-11-11: Workers Free active, R2 Paid canceled, no other paid developer subscriptions, $0.00 balance, and no unpaid invoices or unexpected billable usage. Wrangler's OAuth token lacks Billing Read and received HTTP 403, so billing remains owner-reported. The low-traffic configuration is intended to cost $0 within the Free limits; limit exhaustion can interrupt service. No paid resource or upgrade was authorized or used.

## Follow-up monitoring

- The hourly Cron Trigger is deployed, but its first live invocation, scheduled reset behavior, and CPU time have not yet been observed. Local scheduled-path tests passed. Monitor the first production run and Cloudflare CPU usage before claiming that the live reset executed within the 10 ms Free limit.
- Cloudflare request and D1 row usage should be reviewed as traffic accumulates. The D1 snapshot above is a point-in-time observation, not a forecast.
- The ignored `.production-owner-credentials` file contains the generated 256-bit owner password. The owner must save it in a password manager before deleting the file. Live login passed; only the hash was uploaded as a protected secret. No secret is tracked in Git.
- The Pages project uses [Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/); Cloudflare does not support switching that project to Git integration later. Updates must be deployed through Wrangler or a new project.
