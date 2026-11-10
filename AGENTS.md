# MicroBizFlow AI project rules

Read this file before changing the repository. Follow the user's full project brief when it is available; this file preserves its key operating rules.

## Identity and GitHub

- The GitHub owner is `Pasindu-jayasena`; the intended public repository is `Pasindu-jayasena/microbizflow-ai`.
- All commits must have author and committer name `Pasindu Jayasena` and a GitHub-verified email. Set these in the local repository only. Set `user.useConfigOnly=true`. Do not alter global Git configuration.
- Before **each** commit or push, inspect the branch, working tree, local author and committer settings, `GIT_AUTHOR_*` and `GIT_COMMITTER_*` overrides, `GH_TOKEN` and `GITHUB_TOKEN` presence, GitHub CLI authentication, `gh api user --jq .login`, remote owner, and push credential identity. Confirm the account is exactly `Pasindu-jayasena` and the email belongs to it. Never expose credentials.
- If any identity check cannot be completed, stop commits and pushes; continue local implementation and record the blocker. Never use a bot or alternate identity. Do not force-push, rewrite shared history, or discard unrelated changes.
- Complete each logical feature with meaningful tests, lint and type checks, diff review, a descriptive commit, a verified push, and a report of SHA, branch, checks, identity, and next feature. Do not commit failing features.

## Product and engineering

- Build a real React/TypeScript customer app, TypeScript Cloudflare Worker API, and Cloudflare D1 database. Keep booking decisions deterministic and safe under concurrent requests. Use `Asia/Colombo` as the initial business time zone without hardcoding it into shared logic.
- Keep owner data behind authentication and business-scoped authorization. Never expose customer records to visitors. Validate inputs, use parameterized SQL, protect sessions, and do not log or commit secrets or private customer content.
- AI must be optional, validated, and unable to bypass booking or authorization rules. External messaging needs explicit configuration; AI-generated customer replies need human approval. Demo mode must never send real messages.
- Target a $0 low-traffic public demo. Do not provision paid services or enable billing without the user's explicit approval. Check current provider limits before provisioning. Use fictional seed data and label it.
- Implement and verify incrementally. Do not claim features, test results, deployments, or external integrations that have not been verified. Maintain `docs/progress.md` and the other project documents.

## Working procedure

1. Read the relevant requirements and existing code.
2. Implement one coherent feature with meaningful tests.
3. Run its tests, lint, and type checks; inspect the diff.
4. Perform all identity and remote checks above before committing or pushing.
5. Commit and push only through the verified owner account; verify remote SHA and commit metadata.
6. Update the progress record and report facts, blockers, and the next feature.
