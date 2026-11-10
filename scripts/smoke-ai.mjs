import assert from 'node:assert/strict';
import { Temporal } from '@js-temporal/polyfill';

const base = 'http://127.0.0.1:8788';
const business = await fetch(`${base}/api/business`).then(response => response.json());
const tomorrow = Temporal.Now.zonedDateTimeISO(business.business.timezone).toPlainDate().add({ days: 1 }).toString();
for (const [text, language] of [
  ['I need a haircut tomorrow around 5 PM.', 'en'],
  ['හෙට පස්වරු 5ට කොණ්ඩය කපන්න', 'si'],
]) {
  const response = await fetch(`${base}/api/enquiries/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, consentExternalAI: false }) });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.mode, 'demo');
  assert.equal(result.intent.serviceId, 'svc_cut');
  assert.equal(result.intent.date, tomorrow);
  assert.equal(result.intent.time, '17:00');
  assert.equal(result.intent.language, language);
}
console.log('Local no-key AI smoke test passed for English and Sinhala.');
