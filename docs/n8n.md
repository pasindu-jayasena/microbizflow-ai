# Local n8n Community Edition demonstration

The checked-in workflows under `n8n/workflows/` are importable n8n Community Edition examples. They call the same Cloudflare Worker API used by the hosted app; n8n is a local orchestration demonstration, not a dependency of the public Pages site. The Worker remains authoritative for validation, business scope, idempotency, booking capacity, and approvals.

## Run locally

1. Use Node.js 24 or newer. In one terminal run `npm run db:migrate:local`, `npm run db:seed:local`, `npm run build`, then `npm run dev:pages`.
2. In a second terminal run `npx n8n@2.47.4 start` and open `http://127.0.0.1:5678`. Keep n8n bound to localhost; do not expose its webhooks publicly.
3. Import `n8n/workflows/01-lead-qualification.json` through **Add workflow → Import from file**, then save it. The HTTP Request node targets `http://127.0.0.1:8788/api/leads`; change that URL if the Worker runs elsewhere. CLI import also works: `npx n8n@2.47.4 import:workflow --input=n8n/workflows/01-lead-qualification.json`.
4. Select **Listen for test event** in the webhook node. POST the example below to `http://127.0.0.1:5678/webhook-test/microbizflow/lead`. To run the published local workflow instead, publish it in n8n and POST to `http://127.0.0.1:5678/webhook/microbizflow/lead`. The response includes a lead ID, classification, and whether the idempotency key was seen before. The protected `GET /api/owner/leads` endpoint and D1 `leads` and `customer_records` tables show the resulting records.

```json
{
  "name": "Sample Visitor",
  "contact": "sample-lead@example.invalid",
  "enquiry": "I need a haircut tomorrow at 5 PM",
  "consentToStore": true,
  "consentExternalAI": false,
  "idempotencyKey": "19dd9a6b-80c5-49d4-a83a-afde12da5673"
}
```

Only use fictional contacts for the public demo. The lead webhook has no real customer data in the example. The Worker rate limits public requests to ten per hour per IP and requires explicit storage consent. Replaying the same key and payload returns the same lead; changing the payload returns HTTP 409. The n8n test webhook is intentionally local. Add authentication and network restrictions before using a production n8n webhook with real data.

On 2026-11-12, n8n Community Edition 2.47.4 imported this JSON, published it locally, and processed a fictional POST through `/webhook/microbizflow/lead`. The Worker returned HTTP 201 to n8n and the webhook returned HTTP 200 with a qualified `svc_cut` lead. n8n's local execution history recorded `success` (about 292 ms). No external model or messaging provider was called.

## Appointment request and owner confirmation

Import `n8n/workflows/02-appointment-request.json` in the same local instance. It receives a fictional booking request at `/webhook/microbizflow/appointment-request`, asks the Worker for current availability, rejects an unavailable time, and submits the request to `POST /api/bookings`. The Worker rechecks the slot and D1 enforces chair capacity under concurrent requests. The response is **pending** with a private cancellation code. Sign in to `/owner` to approve or decline it; n8n has no owner credential and cannot confirm bookings on its own.

With the local Worker and published n8n workflow running, `npm run test:n8n:booking:local` chooses a live slot, calls the n8n webhook, and checks the pending booking and owner access boundary. A Playwright owner approval test then signs in with a disposable local owner, confirms a separate booking, checks its public private-code status, and verifies that the confirmation draft still needs human approval. On 2026-11-12, n8n 2.47.4 imported and ran this workflow successfully; its local execution history recorded `success` in about 178 ms.

## Scheduled reminders and follow-ups

Import `n8n/workflows/03-reminders-followups.json`. Configure its two HTTP Request nodes with an n8n **Header Auth** credential named `Local MicroBizFlow automation`: header name `Authorization`, value `Bearer <your local automation token>`. Set the same 32+ character random token as `AUTOMATION_TICK_TOKEN` in ignored `.dev.vars` for the local Worker. The workflow JSON contains only a credential reference, never the token. On a fresh n8n instance, select the new credential in both nodes before publishing. Keep n8n bound to `127.0.0.1`.

The hourly Schedule Trigger and manual local webhook both call `POST /api/automation/tick`. The Worker authenticates the token, queues due reminder and completed-visit follow-up events, and processes at most two events per tick. Drafts remain in D1 as `needs_approval`; only the signed-in owner can approve them. The public Cloudflare deployment uses its own hourly private Worker Cron and does not depend on n8n. This follow-up change has not yet been deployed. The production `AUTOMATION_TICK_TOKEN` is unset, so the n8n-only endpoint is disabled there.

For a local check, run `npm run test:reminders:local` and `npm run test:followups:local` with a disposable `LOCAL_OWNER_PASSWORD`, then POST to `http://127.0.0.1:5678/webhook/microbizflow/automation-tick`. On 2026-11-13, n8n 2.47.4 imported this workflow and its manual path recorded a successful local execution in about 159 ms. The hourly n8n timer itself has not been observed; the deployed private Worker Cron is documented separately in [deployment.md](deployment.md).

Optional draft LLM generation requires `DRAFT_AI_ENABLED=true` plus the server-only `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL`, or an approved Workers AI binding. Only booking reference, service name, and event kind go to the model. The body must include the exact reference and pass length and unsafe-content checks; failure uses a deterministic draft. Generation mode and latency are stored with the draft. No generated message can be delivered before owner approval, and this demo uses a mock outbox.

## LLM configuration

The lead workflow uses an OpenAI-compatible chat-completions endpoint when `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL` are present **and** the visitor opts in to external AI. Set the base URL including its API prefix, for example `https://api.example.com/v1/`. Put the key in ignored `.dev.vars` for local development or an encrypted Cloudflare secret for a future approved deployment; never set it in Vite variables or a workflow JSON export. The alternative Cloudflare Workers AI adapter uses the approved Llama 3.1 model if an `AI` binding is configured. The public deployment currently has neither an AI binding nor external LLM secrets, so lead qualification uses deterministic rules.

Model output must match the service list, ISO date, 24-hour time, language, and priority schema. Invalid output, timeout, and provider failures fall back to rules. No model output creates or confirms an appointment. The Worker redacts obvious email and phone strings before sending an enquiry to a model. Its redaction is best-effort; visitors must avoid sensitive details, and real customer data needs a privacy review and provider agreement.

Reference: [n8n npm installation](https://docs.n8n.io/hosting/installation/npm/), [workflow import and export](https://docs.n8n.io/workflows/export-import/), [Cloudflare Workers AI Free allocation](https://developers.cloudflare.com/workers-ai/platform/pricing/).
