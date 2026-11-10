import assert from 'node:assert/strict';
import { Temporal } from '@js-temporal/polyfill';

const base = 'http://127.0.0.1:8788';
const headers = { 'Content-Type': 'application/json' };
const catalogue = await fetch(`${base}/api/business`).then(response => response.json());
const today = Temporal.Now.zonedDateTimeISO(catalogue.business.timezone).toPlainDate();
let date = '';
let time = '';
for (let offset = 2; offset <= 9; offset++) {
  date = today.add({ days: offset }).toString();
  const availability = await fetch(`${base}/api/availability?serviceId=svc_cut&date=${date}`).then(response => response.json());
  if (availability.slots?.length) { time = availability.slots[0]; break; }
}
assert.ok(time, 'A future slot is required');
const idempotencyKey = crypto.randomUUID();
const bookingBody = JSON.stringify({
  serviceId: 'svc_cut', date, time, customerName: 'Fictional Cancellation Test',
  customerContact: `cancel-${crypto.randomUUID()}@example.invalid`, note: '', idempotencyKey,
});
const booked = await fetch(`${base}/api/bookings`, { method: 'POST', headers, body: bookingBody });
assert.equal(booked.status, 201);
const created = await booked.json();
assert.equal(created.cancellationCode, idempotencyKey);
const replay = await fetch(`${base}/api/bookings`, { method: 'POST', headers, body: bookingBody });
assert.equal(replay.status, 200);
assert.equal((await replay.json()).cancellationCode, idempotencyKey);
const action = (route, code) => fetch(`${base}/api/bookings/${route}`, { method: 'POST', headers, body: JSON.stringify({ reference: created.reference, cancellationCode: code }) });
assert.equal((await action('status', crypto.randomUUID())).status, 404);
assert.equal((await action('status', idempotencyKey).then(response => response.json())).status, 'pending');
const cancelled = await action('cancel', idempotencyKey);
assert.equal(cancelled.status, 200);
assert.equal((await cancelled.json()).status, 'cancelled');
assert.equal((await action('status', idempotencyKey).then(response => response.json())).status, 'cancelled');
assert.equal((await action('cancel', idempotencyKey)).status, 409);
console.log('Local cancellation test passed: private code ownership, status lookup, cancellation, and repeat protection.');
