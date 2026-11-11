# Deployment readiness — 2026-11-11

**Decision: approved provisioning is underway; production deployment awaits final configuration checks.** The owner requested deployment and a live link on 2026-11-11, after reviewing the [Free-only plan](deployment-plan.md). D1 `microbizflow-demo` and Pages Direct Upload project `microbizflow-ai` have been created; no Pages or Worker deployment has occurred yet. The owner reported Workers Free active, R2 Paid canceled, no other active paid developer subscriptions, a $0.00 balance, and no unpaid invoices or unexpected usage. The Wrangler token lacks Billing Read, so this is owner-reported dashboard evidence, not independent API verification. No live application URL is claimed yet.

## Verified

- GitHub CLI authenticated as `pasindu-jayasena`. The public repository is `pasindu-jayasena/microbizflow-ai`. The release branch is `deploymentBranch`, with [draft PR #2](https://github.com/pasindu-jayasena/microbizflow-ai/pull/2). GitHub confirmed its reviewed commits use Pasindu Jayasena and his verified email for both author and committer; [PR CI before production configuration](https://github.com/pasindu-jayasena/microbizflow-ai/actions/runs/43065149540) passed.
- Wrangler `whoami` authenticated the Cloudflare account associated with `pasindujayasena.biz@gmail.com`. Read-only lists confirmed the newly created D1 database UUID `8999f517-eabe-4923-a647-5fcaa6d85017` and Pages Direct Upload project with `microbizflow-ai.pages.dev` reserved. No first Pages deployment or scheduled Worker exists yet.
- The local Pages Function and standalone scheduled Worker share the tested TypeScript API. D1 migrations `0001`–`0009` applied locally. Fictional seed data is labeled. The Worker dry run built a 1,076.63 KiB upload without deployment.
- Current production-config checks passed locally: TypeScript, ESLint, 32 Vitest tests (including origin rules), four deployment and credential tests, nine Python schema tests, production Vite build, config preflight, Worker dry run, three Playwright browser flows, booking concurrency smoke, and a same-origin/attacker-origin HTTP check. The local owner settings browser flow was skipped without its disposable test password; branch CI must run it before release. Earlier local HTTP smoke tests covered owner authorization, privacy, signed webhooks, mock workflows and CRM, and bounded scheduled retention and 24-hour demo reset.
- [GitHub CI for the reviewed source commit](https://github.com/pasindu-jayasena/microbizflow-ai/actions/runs/43060148625) passed all steps, including local D1 migration, seed, and all four browser tests on Ubuntu 24.04.
- Demo mode is enabled by default and in both Wrangler configs. It accepts only reserved `@example.invalid` booking contacts, stores a fixed fictional name, discards booking notes, and sends no real messages. The scheduled Worker has `workers_dev = false` and `preview_urls = false`.
- The public owner workspace preview uses four fictional browser-only records and makes no owner API requests. Its desktop and mobile layouts were reviewed locally. A tracked-file scan found no local environment files, Wrangler state, token patterns, or private-key markers; this is a targeted check rather than a complete security audit.

## Required services and free limits

| Service | Intended use | Free-plan boundary checked 2026-11-11 |
| --- | --- | --- |
| Pages with Functions | Public customer and owner app on a free `pages.dev` URL | [Pages Free limits](https://developers.cloudflare.com/pages/platform/limits/): 500 builds/month; Function requests count toward Workers quota |
| Workers Free | Pages API execution and one hourly private Cron Worker | [Workers limits](https://developers.cloudflare.com/workers/platform/limits/): 100,000 requests/day, 10 ms CPU per HTTP or Cron invocation, five Cron Triggers/account |
| D1 Free | One business database bound to Pages and Cron Worker | [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/): 10 databases, 5 million rows read/day, 100,000 rows written/day, 5 GB total storage |

No R2, KV, Queues, paid LLM, messaging provider, custom domain, or CRM subscription is required. The checked-in configuration does not bind Workers AI. The deterministic assistant, mock CRM, and mock notifications remain usable without billable providers. Free-tier limits may interrupt service if reached; production CPU and usage have not been measured.

## Remaining gates

1. **Configuration CI:** The Pages and private Worker production configs must pass `npm run check:deployment-config`, the full local suite, and new branch/PR CI before deployment. Local Worker settings retain a placeholder D1 ID and are never used for remote operations.
2. **Remote data and secrets:** Apply migrations and fictional seed only to verified D1 `microbizflow-demo`. Set only the generated owner username and hash as protected Pages secrets. Never copy ignored `.dev.vars` or its synthetic test secrets. Leave `WEBHOOK_SECRET` and the AI binding unset.
3. **Live verification:** After deployment, test HTTPS, public booking and cancellation, owner sign-in and authorization, the scheduled reset, D1 migrations, real CPU and row usage, and absence of outbound messages. Local tests and a dry run cannot verify these production behaviors.

## Approved deployment sequence

1. Run the full checks on `deploymentBranch` and require green CI. Keep the Pages Direct Upload choice; [Cloudflare says it cannot later switch to Git integration](https://developers.cloudflare.com/pages/get-started/direct-upload/).
2. Apply D1 migrations and fictional seed to the verified remote UUID. Set protected owner secrets. Do not configure R2, paid AI, real messaging, or a real CRM.
3. Fast-forward the reviewed branch to `main` with verified Git identity. Build and deploy Pages through Wrangler so `functions/` is included. Deploy only `wrangler.worker.production.toml` for the private scheduler and verify one hourly Cron Trigger.
4. Run the live checks above, inspect Workers/D1 usage and CPU, and record the verified `pages.dev` URL and commands in `docs/deployment.md`. If a Free limit is exceeded or billing is required, stop and report it before any upgrade.

**Potential cost:** The intended low-traffic configuration is $0 on Workers Free, Pages Free, and D1 Free within their limits. The owner reported a $0.00 balance and no active paid subscriptions on 2026-11-11; the OAuth API could not independently confirm it. No paid resource may be activated without separate explicit approval. Production CPU and D1 usage remain unmeasured until live verification.
