import assert from 'node:assert/strict';
import { Temporal } from '@js-temporal/polyfill';

const base = 'http://127.0.0.1:8788';
const groups = crypto.randomUUID().replaceAll('-', '').match(/.{4}/g);
const headers = { 'Content-Type': 'application/json', 'CF-Connecting-IP': `2001:db8:${groups.slice(0, 6).join(':')}` };
const catalogue = await fetch(`${base}/api/business`).then(response => response.json());
assert.equal(catalogue.demoMode, true);
const today = Temporal.Now.zonedDateTimeISO(catalogue.business.timezone).toPlainDate();
let date = '';
let time = '';
for (let offset = 2; offset <= 9; offset++) {
  date = today.add({ days: offset }).toString();
  const available = await fetch(`${base}/api/availability?serviceId=svc_cut&date=${date}`).then(response => response.json());
  if (available.slots?.length) { time = available.slots[0]; break; }
}
assert.ok(time, 'A future slot is required');
const submit = contact => fetch(`${base}/api/bookings`, { method: 'POST', headers, body: JSON.stringify({
  serviceId: 'svc_cut', date, time, customerName: 'Fictional Demo Test', customerContact: contact,
  note: '', idempotencyKey: crypto.randomUUID(),
}) });
assert.equal((await submit('visitor@example.com')).status, 400);
assert.equal((await submit('+94771234567')).status, 400);
const accepted = await submit(`demo-${crypto.randomUUID()}@example.invalid`);
assert.equal(accepted.status, 201);
console.log('Local demo guard passed: real-looking email and phone rejected; reserved fictional contact accepted.');
