# Progress

## 2026-11-11 — Foundation pushed; local MVP implementation in progress

- The workspace was empty and had no Git repository. A local `main` repository was initialized.
- GitHub CLI confirmed the `pasindu-jayasena` account and verified primary `pasindujayasena.biz@gmail.com` address. Local author and committer are `Pasindu Jayasena` with that email; `user.useConfigOnly=true`. No identity or token overrides were present. Git pushes use the authenticated GitHub CLI credential helper, not the global credential manager.
- Public repository: https://github.com/pasindu-jayasena/microbizflow-ai. Phase 1 commit `3b5535d4a65e0b71a9a147595a804202a9f02006` was pushed to `main`; GitHub confirmed its author and committer are `pasindu-jayasena`.
- The local customer and owner MVP, D1 migrations, tests, and CI configuration were pushed in commit `bdac60d7b772dd7aa0a6fc639e38c85f74b6e0bf` on `main`. GitHub verified the owner author/committer and matching remote SHA. The [Checks run](https://github.com/pasindu-jayasena/microbizflow-ai/actions/runs/42893299235) completed successfully.
- The optional enquiry assistant was pushed in commit `29aba32ea4e7b85450d7d55d0cf4443d331496c0`; the [Checks run](https://github.com/pasindu-jayasena/microbizflow-ai/actions/runs/42895222779) completed successfully. It includes English/Sinhala no-key extraction, a consent-gated Workers AI adapter, schema validation, timeout fallback, and evaluation fixtures. No live model inference has been exercised.
- Durable workflow events, approval-gated customer drafts, a mock outbox, retry handling, and owner activity views were pushed in commit `91ab07d8ee200f403aa32c9a68dfba0921020a8d`; the [Checks run](https://github.com/pasindu-jayasena/microbizflow-ai/actions/runs/42897864798) passed.
- Playwright browser tests cover a real customer booking and owner route protection. Commit `05ab274feb10061483ac42882adc81293b34c3ae` was pushed and its [Checks run](https://github.com/pasindu-jayasena/microbizflow-ai/actions/runs/42899024980) passed.
- Owner service and working-hours configuration was pushed in commit `b753e6ef7a67a3f2184726af44cb8d4d4140c6d7`; its [Checks run](https://github.com/pasindu-jayasena/microbizflow-ai/actions/runs/42900199166) passed.
- Customer records, protected search, appointment history, and private notes were pushed in commit `eefba7d661dd51a2dab130aada78a615443bea0c`; its [Checks run](https://github.com/pasindu-jayasena/microbizflow-ai/actions/runs/42901626076) passed.
- Owner booking and workflow analytics were pushed in commit `7d0f6e382cd89954b41095d6a737eb0b1169ee0a`; its [Checks run](https://github.com/pasindu-jayasena/microbizflow-ai/actions/runs/42902246825) passed.
- Customer status lookup and cancellation with private booking codes were pushed in commit `03080e4464ba788e6ba2aa020045c5fa9afa04ed`; its [Checks run](https://github.com/pasindu-jayasena/microbizflow-ai/actions/runs/42903245314) passed.
- Owner business-profile editing was pushed in commit `c58567e12a4728e9559a3cacf938b517164aedcd`; its [Checks run](https://github.com/pasindu-jayasena/microbizflow-ai/actions/runs/42932165914) passed.
- Signed inbound webhooks and owner follow-up tasks were pushed in commit `9c0c54229d6469b228510df515e703bd79565e04`; its [Checks run](https://github.com/pasindu-jayasena/microbizflow-ai/actions/runs/42932999661) passed.
- Owner appointment search, status filtering, and a protected CSV export were pushed in commit `f85b6a9dac98f7c67dc300f80163045512fdab40`; its [Checks run](https://github.com/pasindu-jayasena/microbizflow-ai/actions/runs/42933945198) passed.
- Structured assistant enquiry records and an owner review queue were pushed in commit `ca22e29853e5ce3bb7bd149b02929d746ca9e117`; its [Checks run](https://github.com/pasindu-jayasena/microbizflow-ai/actions/runs/42934841541) passed.
- Owner-controlled deletion of customer details with an active-booking guard was pushed in commit `5abcdf82e353fb2052020bd15615633dd364785a`; its [Checks run](https://github.com/pasindu-jayasena/microbizflow-ai/actions/runs/42935485841) passed.
- A bounded owner-run 365-day customer retention action was pushed in commit `4ed7d29a56316ce15f333ea5c6d61f325b1c1aae`; its [Checks run](https://github.com/pasindu-jayasena/microbizflow-ai/actions/runs/42936105927) passed.
- Expiry of unbooked assistant analyses was pushed in commit `c1018b177298c0f04adb28e70493cd64d6e85e0b`; its [Checks run](https://github.com/pasindu-jayasena/microbizflow-ai/actions/runs/42936582198) passed.
- Local session and cross-origin security checks are implemented and under test; their commit and push are pending.
- Wrangler confirms a Cloudflare account associated with `pasindujayasena.biz@gmail.com`. A read-only subscription lookup returned HTTP 403 because the OAuth token lacks Billing Read. The user confirmed Workers Free in the dashboard and reported canceling R2 Paid, with cancellation still pending billing verification. No Cloudflare resource has been provisioned or deployed; deployment requires a readiness report and explicit approval.
- No public demo, live URL, or real message delivery is claimed.

## Next work

Finish and publish session and cross-origin security checks separately. Then add scheduled recovery, reminders, and remaining automation capabilities, review free-tier and billing status, and prepare a deployment readiness report. Provisioning and deployment await explicit user approval.
