# Enquiry assistant evaluation

The no-key assistant extracts **suggestions**, never bookings. The API validates the result and the normal booking endpoint still checks working hours, resource capacity, dates, and authentication. It does not invent a missing service, date, or time.

The deterministic fixture suite fixes today's business-local date at `2026-11-11` and checks:

| Case | Expected behavior |
| --- | --- |
| English haircut tomorrow at 5 PM | Service, `2026-11-12`, `17:00`, English |
| Haircut with no date or time | Both fields marked missing |
| Tomorrow with no service or time | Both fields marked missing |
| Impossible date | Date remains missing |
| Unsupported car repair | Service remains missing |
| Sinhala haircut tomorrow at 5 PM | Service, date, time, Sinhala |
| Malformed or unknown model output | Rejected and deterministic fallback used |
| Provider failure or timeout | Deterministic fallback used |
| Capacity rejection vs. quota exhaustion | One retry only for capacity; no retry for quota |

Run `npm test -- shared/enquiry.test.ts worker/src/ai.test.ts` to reproduce the checks. These fixtures are a small regression set, not a measure of general language accuracy. The implementation does not yet handle all colloquial Sinhala phrasing, Tamil, vague times, or dates such as “next Tuesday.” The UI asks the customer to choose an actual available slot after a suggestion.

The proposed production release uses Cloudflare Workers AI model `@cf/meta/llama-3.3-70b-instruct-fp8-fast` with JSON schema mode, a 160-token output cap, explicit visitor consent, contact redaction, schema validation, and a seven-second fallback timeout. This model replaces the earlier deprecated Llama 3.1 default. No live model call has been measured or claimed for this repository yet. When enabled, the API returns observed latency and whether the result came from the model, rules, or fallback. [Cloudflare's Free allocation](https://developers.cloudflare.com/workers-ai/platform/pricing/) is 10,000 Neurons per day; actual consumption must be measured after an approved deployment.

The owner review queue stores only the validated structured fields, mode, observed latency, and review state. The raw enquiry text is not retained. When a customer submits a booking after using a suggestion, the analysis is linked to that booking; an unbooked analysis has no contact method for follow-up. The owner can mark a record reviewed, but cannot send a message from this queue.
