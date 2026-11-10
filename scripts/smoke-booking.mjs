// Run only against local Pages Functions with a migrated and seeded local D1 database.
import assert from 'node:assert/strict';
import { Temporal } from '@js-temporal/polyfill';

const base = 'http://127.0.0.1:8788';
const serviceId = 'svc_cut';
const business = await fetch(`${base}/api/business`).then(response => response.json());
assert.equal(business.business.slug, 'harbour-cut');
const today = Temporal.Now.zonedDateTimeISO(business.business.timezone).toPlainDate();
let date = '';
let slots = [];
for (let offset = 2; offset <= 9; offset++) {
  date = today.add({ days: offset }).toString();
  const result = await fetch(`${base}/api/availability?serviceId=${serviceId}&date=${date}`).then(response => response.json());
  slots = result.slots ?? [];
  if (slots.length > 0) break;
}
assert.ok(slots.length > 0, 'A future slot is needed for the smoke test');
const time = slots[0];
const payloads = Array.from({ length: 3 }, (_, index) => ({
  serviceId, date, time, customerName: `Fictional Test ${index + 1}`,
  customerContact: `test-${crypto.randomUUID()}@example.invalid`, note: 'Local integration test', idempotencyKey: crypto.randomUUID(),
}));
const results = await Promise.all(payloads.map(async payload => {
  const response = await fetch(`${base}/api/bookings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  return { status: response.status, body: await response.json() };
}));
assert.deepEqual(results.map(result => result.status).sort(), [201, 201, 409]);
const success = results.find(result => result.status === 201);
const successIndex = results.findIndex(result => result === success);
const replay = await fetch(`${base}/api/bookings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payloads[successIndex]) });
assert.equal(replay.status, 200);
assert.equal((await replay.json()).reference, success.body.reference);
console.log(`Local booking smoke test passed: two chair reservations, one conflict, one idempotent replay (${date} ${time}).`);
