# Deployment readiness — 2026-11-11

**Decision: hold Cloudflare provisioning and deployment.** The application is locally tested and published as source code, but Cloudflare billing status remains unverified and deployment has not been approved. No live application URL is claimed.

## Verified

- GitHub CLI authenticated as `pasindu-jayasena`. The public repository is `pasindu-jayasena/microbizflow-ai`. The reviewed application source commit is `f393357376f0bd4afc7150807e0c599b22eb3e50`, with Pasindu Jayasena and his GitHub-verified email as both author and committer. The working tree was clean after that push.
- Wrangler `whoami` authenticated the Cloudflare account associated with `pasindujayasena.biz@gmail.com`. Read-only `d1 list` and `pages project list` returned no resources. A read-only deployment lookup returned “This Worker does not exist on your account” for `microbizflow-api`.
- The local Pages Function and standalone scheduled Worker share the tested TypeScript API. D1 migrations `0001`–`0009` applied locally. Fictional seed data is labeled. The Worker dry run built a 1,076.63 KiB upload without deployment.
- Local checks passed: TypeScript, ESLint, 28 Vitest tests, 9 Python schema tests, production Vite build, and all 3 Playwright browser flows with a synthetic owner. Local HTTP smoke tests covered booking concurrency, owner authorization, privacy, signed webhooks, mock workflows and CRM, and bounded scheduled retention and 24-hour demo reset.
- [GitHub CI for the reviewed source commit](https://github.com/pasindu-jayasena/microbizflow-ai/actions/runs/43058314575) passed all steps, including local D1 migration, seed, and all three browser tests on Ubuntu 24.04.
- Demo mode is enabled by default and in both Wrangler configs. It accepts only reserved `@example.invalid` booking contacts, stores a fixed fictional name, discards booking notes, and sends no real messages. The scheduled Worker has `workers_dev = false` and `preview_urls = false`.

## Required services and free limits

| Service | Intended use | Free-plan boundary checked 2026-11-11 |
| --- | --- | --- |
| Pages with Functions | Public customer and owner app on a free `pages.dev` URL | [Pages Free limits](https://developers.cloudflare.com/pages/platform/limits/): 500 builds/month; Function requests count toward Workers quota |
| Workers Free | Pages API execution and one hourly private Cron Worker | [Workers limits](https://developers.cloudflare.com/workers/platform/limits/): 100,000 requests/day, 10 ms CPU per HTTP or Cron invocation, five Cron Triggers/account |
| D1 Free | One business database bound to Pages and Cron Worker | [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/): 10 databases, 5 million rows read/day, 100,000 rows written/day, 5 GB total storage |

No R2, KV, Queues, paid LLM, messaging provider, custom domain, or CRM subscription is required. The checked-in configuration does not bind Workers AI. The deterministic assistant, mock CRM, and mock notifications remain usable without billable providers. Free-tier limits may interrupt service if reached; production CPU and usage have not been measured.

## Remaining gates

1. **Billing:** The user confirmed Workers Free in the Cloudflare dashboard and reported canceling R2 Paid. The Wrangler OAuth token lacks Billing Read; the read-only subscription request returned HTTP 403. R2 cancellation status, other paid developer subscriptions, billable usage, and outstanding charges must be confirmed from the billing dashboard before provisioning.
2. **Production settings:** Both Wrangler files contain a placeholder D1 ID and localhost `ALLOWED_ORIGIN` values. After explicit approval, create one Free D1 database, bind it as `DB` to both runtimes, set the exact Pages HTTPS origin, keep `DEMO_MODE=true`, and seed only fictional data. Set `OWNER_USERNAME` and `OWNER_PASSWORD_HASH` as protected Pages secrets using a new production password. Never copy ignored local `.dev.vars` or its synthetic test secrets. Leave `WEBHOOK_SECRET` and the AI binding unset.
3. **Live verification:** After an approved deployment, test HTTPS, public booking and cancellation, owner sign-in and authorization, the scheduled reset, D1 migrations, real CPU and row usage, and absence of outbound messages. Local tests and a dry run cannot verify these production behaviors.

## Proposed deployment sequence after approval

1. Reconfirm the account, Workers Free plan, billing dashboard, current service limits, and clean source/green CI. Confirm that creating a Pages **Direct Upload** project is acceptable; [Cloudflare says it cannot later switch to Git integration](https://developers.cloudflare.com/pages/get-started/direct-upload/). Direct Upload keeps releases manual.
2. Create one Free D1 database. Replace the placeholder IDs in both Wrangler configs with its verified ID, set the Pages HTTPS origin, and review the diff. Create the Pages project and its `DB` binding.
3. Store a new owner username and password hash as protected Pages secrets. Apply all migrations and the fictional seed to that exact D1 database. Do not configure R2, paid AI, real messaging, or a real CRM.
4. Build and deploy Pages through Wrangler so the `functions/` directory is included. Deploy the scheduled Worker with the same D1 binding and no public route. Verify that one hourly Cron Trigger exists.
5. Run the live checks above, inspect Workers/D1 usage and CPU, and record the verified `pages.dev` URL and deployment commands in `docs/deployment.md`. If a Free limit is exceeded or billing is required, stop and report it before any upgrade.

**Potential cost:** The intended low-traffic configuration is $0 on Workers Free, Pages Free, and D1 Free within their limits. Existing account charges and R2 subscription status are unknown; no claim of a $0 account bill is made. No paid resource may be activated without separate explicit approval.
