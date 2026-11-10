import assert from 'node:assert/strict';
import { Temporal } from '@js-temporal/polyfill';

const base = 'http://127.0.0.1:8788';
const password = process.env.LOCAL_OWNER_PASSWORD;
if (!password) throw new Error('Set LOCAL_OWNER_PASSWORD to the local owner password for this test.');
const headers = { 'Content-Type': 'application/json' };
const login = await fetch(`${base}/api/owner/login`, { method: 'POST', headers, body: JSON.stringify({ username: 'owner', password }) });
assert.equal(login.status, 200);
const cookie = login.headers.get('set-cookie')?.split(';')[0];
assert.ok(cookie?.startsWith('mbf_session='));
const analytics = () => fetch(`${base}/api/owner/analytics`, { headers: { Cookie: cookie } }).then(response => response.json());
assert.equal((await fetch(`${base}/api/owner/analytics`)).status, 401);
const before = await analytics();
assert.equal(before.appointments.total, before.appointments.pending + before.appointments.confirmed + before.appointments.declined + before.appointments.cancelled + before.appointments.completed);
const catalogue = await fetch(`${base}/api/business`).then(response => response.json());
const today = Temporal.Now.zonedDateTimeISO(catalogue.business.timezone).toPlainDate();
let date = '';
let time = '';
for (let offset = 2; offset <= 9; offset++) {
  date = today.add({ days: offset }).toString();
  const available = await fetch(`${base}/api/availability?serviceId=svc_cut&date=${date}`).then(response => response.json());
  if (available.slots?.length) { time = available.slots[0]; break; }
}
assert.ok(time, 'A future slot is required');
const booked = await fetch(`${base}/api/bookings`, { method: 'POST', headers, body: JSON.stringify({
  serviceId: 'svc_cut', date, time, customerName: 'Fictional Analytics Test',
  customerContact: `analytics-${crypto.randomUUID()}@example.invalid`, note: '', idempotencyKey: crypto.randomUUID(),
}) });
assert.equal(booked.status, 201);
const after = await analytics();
assert.equal(after.appointments.total, before.appointments.total + 1);
assert.equal(after.appointments.pending, before.appointments.pending + 1);
assert.ok(after.popularServices.some(item => item.name === 'Signature haircut' && item.bookings > 0));
assert.ok(after.workflows.total >= before.workflows.total + 1);
console.log('Local analytics test passed: protected metrics track a new stored booking and workflow event.');
