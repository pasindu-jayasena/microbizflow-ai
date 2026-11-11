# Cloudflare Free deployment

## Live release

The fictional Harbour Cut Studio demo is live at **https://microbizflow-ai.pages.dev/**. The current Pages Direct Upload production deployment is `0bcc3fd9-471a-45dc-b457-724bdb458d12`, built from verified Git commit `381eefb81c54583c2e57afdf8ef8cca7953c109f` on `main`. [Its GitHub CI run](https://github.com/pasindu-jayasena/microbizflow-ai/actions/runs/43108803088) passed all checks, including four browser flows. The previous production deployment `1a467f0e-88ca-4fe2-9485-b8c6b933ca60` remains in Pages history as a rollback option.

On 2026-11-12 (Asia/Colombo), the current HTTPS release returned HTTP 200 for `/` and `/api/business`. Browser checks passed the salon image, correctly rendered opening hours, no-key assistant label, AI and automation walkthrough, public owner workflow preview without owner API requests, and absence of page errors. A live smoke test also passed owner login, private customer-route authorization, cross-origin rejection, secure session cookie, logout, fictional booking, reference-and-code lookup, cancellation, and rejection of a real-looking contact. No real message was sent.

The deployment uses the Cloudflare account associated with `pasindujayasena.biz@gmail.com`. Resources:

| Resource | Production configuration |
| --- | --- |
| Pages Direct Upload `microbizflow-ai` | React assets and same-origin `/api` Pages Function; production branch `main`; free `pages.dev` domain |
| D1 `microbizflow-demo` | APAC database `8999f517-eabe-4923-a647-5fcaa6d85017`; nine migrations and fictional seed; bound as `DB` to Pages and the scheduler |
| Private Worker `microbizflow-api` | Version `47a479bd-0131-4736-8638-ac12604c015b`; one hourly UTC `0 * * * *` Cron Trigger; `workers_dev=false` and `preview_urls=false` |

The Pages production environment lists exactly two encrypted secrets, `OWNER_USERNAME` and `OWNER_PASSWORD_HASH`. The 256-bit owner password is in ignored local `.production-owner-credentials`; **save it in the owner's password manager before deleting that file**. It was not committed, printed, or uploaded as a plaintext secret. The owner username is `owner`. The live owner login passed. The file remains locally until the owner has saved the password.

## Release and verification

After the owner approved the [Free-only plan](deployment-plan.md), the initial release from `deploymentBranch` passed [PR #2](https://github.com/pasindu-jayasena/microbizflow-ai/pull/2). The salon and automation update passed [PR #4](https://github.com/pasindu-jayasena/microbizflow-ai/pull/4) and was fast-forwarded to `main`. GitHub confirmed matching remote SHAs and both author and committer as `Pasindu Jayasena <pasindujayasena.biz@gmail.com>`, associated with `pasindu-jayasena`. The updated source passed deployment configuration checks, TypeScript build, ESLint, 32 Vitest tests, four deployment and credential tests, nine Python schema tests, and local browser tests. Branch, PR, and main CI passed all four browser flows with a disposable owner credential.

Initial production commands used from clean `main` after remote D1 migrations, fictional seed, and protected secret setup:

```sh
npm run check:deployment-config
npm run build
node scripts/wrangler.mjs pages deploy dist/web --project-name microbizflow-ai --branch main --commit-hash 958242ff3e5ecdc78620519b57209e7dfbcff994
node scripts/wrangler.mjs deploy --config wrangler.worker.production.toml
node scripts/wrangler.mjs d1 migrations list microbizflow-demo --config wrangler.worker.production.toml --remote
node scripts/wrangler.mjs d1 info microbizflow-demo --json
node scripts/wrangler.mjs pages deployment list --project-name microbizflow-ai
node scripts/wrangler.mjs deployments list --name microbizflow-api
```

The salon UI update reused the same Free resources and protected secrets. From clean `main` after green CI, it ran `npm run check:deployment-config`, `npm run build`, and:

```sh
node scripts/wrangler.mjs pages deploy dist/web --project-name microbizflow-ai --branch main --commit-hash 381eefb81c54583c2e57afdf8ef8cca7953c109f
```

The D1 schema and scheduled Worker code did not change, so neither was redeployed.

The migration list reported no pending migrations. After the smoke test, D1 reported 18 tables, 245,760 bytes of storage, and in the preceding 24 hours 148 rows read and 144 rows written. These are a point-in-time sample, not a capacity forecast. The hourly trigger was accepted and is listed in the Worker deployment output. **A live scheduled invocation and its CPU time have not yet been observed.** The scheduled logic passed local D1 and audit tests; monitor the first production trigger before claiming the live reset has run.

## Free plan boundary

The owner reported checking the Billing dashboard on 2026-11-11: Workers Free active, R2 Paid canceled, no other paid developer subscriptions, $0.00 outstanding, and no unpaid invoices or unexpected billable usage. Wrangler authenticated the account, but its OAuth token lacks Billing Read (HTTP 403), so billing remains owner-reported. No R2, KV, Queues, Workers AI binding, paid model, messaging provider, external CRM, or custom domain was provisioned. The inbound webhook has no production secret and is disabled; mock CRM and notification flows do not contact external providers. Both Wrangler configs set `DEMO_MODE="true"`, restricting booking contacts to `@example.invalid`, storing a fictional name, and discarding notes.

Limits checked on 2026-11-11: [Pages Free](https://developers.cloudflare.com/pages/platform/limits/) lists 500 builds/month; Function requests share [Workers Free](https://developers.cloudflare.com/workers/platform/limits/) limits of 100,000 requests/day, 10 ms CPU per invocation, and five Cron Triggers/account; [D1 Free](https://developers.cloudflare.com/d1/platform/pricing/) lists 10 databases, 5 million rows read/day, 100,000 rows written/day, and 5 GB total storage. The intended low-traffic demo is $0 within those limits, but Free limits can interrupt service. Cloudflare's usage and CPU dashboards should be checked after traffic and the first Cron run. Do not upgrade or enable billing without explicit owner approval.

The Pages project uses Direct Upload. [Cloudflare says a Direct Upload project cannot later switch to Git integration](https://developers.cloudflare.com/pages/get-started/direct-upload/); deployments are made through Wrangler so the `functions/` folder is bundled. A new Pages project would be needed for Git integration.

## Maintenance and rollback

For an update, develop and review on `deploymentBranch`, run the full checks and CI, verify GitHub identity before each commit and push, fast-forward the reviewed commit to `main`, build, and deploy Pages with the verified `main` SHA. Deploy `wrangler.worker.production.toml` only if its code or configuration changed. Keep `wrangler.worker.toml` for local development; it contains a placeholder D1 ID. Do not add real customer data to this public demo.

If a Pages release fails, use the Cloudflare Pages deployment history to roll back to a previously verified deployment, then repeat the live smoke checks. If the scheduler exceeds Free limits or fails, investigate its trigger and CPU usage and disable the Cron Trigger if necessary; verify the resulting state before claiming recovery. Database schema changes need their own rollback assessment because switching Pages versions does not reverse D1 migrations. Preserve the ignored owner credential file until the owner has saved it privately.
