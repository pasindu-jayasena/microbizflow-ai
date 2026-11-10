import assert from 'node:assert/strict';
import { Temporal } from '@js-temporal/polyfill';

const base = 'http://127.0.0.1:8788';
const password = process.env.LOCAL_OWNER_PASSWORD;
if (!password) throw new Error('Set LOCAL_OWNER_PASSWORD to the local owner password for this test.');
const business = await fetch(`${base}/api/business`).then(response => response.json());
const today = Temporal.Now.zonedDateTimeISO(business.business.timezone).toPlainDate();
let date = '';
let time = '';
for (let offset = 2; offset <= 9; offset++) {
  date = today.add({ days: offset }).toString();
  const data = await fetch(`${base}/api/availability?serviceId=svc_cut&date=${date}`).then(response => response.json());
  if (data.slots?.length) { time = data.slots[0]; break; }
}
assert.ok(time, 'A future slot is required');
const booked = await fetch(`${base}/api/bookings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
  serviceId: 'svc_cut', date, time, customerName: 'Fictional Workflow Test',
  customerContact: `workflow-${crypto.randomUUID()}@example.invalid`, note: '', idempotencyKey: crypto.randomUUID(),
}) });
assert.equal(booked.status, 201);
const { reference } = await booked.json();
const login = await fetch(`${base}/api/owner/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'owner', password }) });
assert.equal(login.status, 200);
const cookie = login.headers.get('set-cookie')?.split(';')[0];
assert.ok(cookie?.startsWith('mbf_session='));
const owner = (path, init = {}) => fetch(`${base}${path}`, { ...init, headers: { Cookie: cookie, 'Content-Type': 'application/json', ...init.headers } });
const list = await owner('/api/owner/appointments').then(response => response.json());
const appointment = list.appointments.find(item => item.reference === reference);
assert.ok(appointment);
const notices = await owner('/api/owner/notifications').then(response => response.json());
assert.ok(notices.notifications.some(item => item.reference === reference && item.kind === 'owner_notice' && item.state === 'mock_delivered'));
const changed = await owner(`/api/owner/appointments/${appointment.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'confirmed' }) });
assert.equal(changed.status, 200);
const after = await owner('/api/owner/notifications').then(response => response.json());
const draft = after.notifications.find(item => item.reference === reference && item.kind === 'customer_draft');
assert.equal(draft?.state, 'needs_approval');
const approved = await owner(`/api/owner/notifications/${draft.id}/approve`, { method: 'POST' });
assert.equal(approved.status, 200);
assert.equal((await approved.json()).mockDelivered, true);
const delivered = await owner('/api/owner/notifications').then(response => response.json());
assert.equal(delivered.notifications.find(item => item.id === draft.id)?.state, 'mock_delivered');
assert.equal((await fetch(`${base}/api/owner/notifications`)).status, 401);
console.log(`Local workflow test passed: booking notice, approval gate, mock delivery, and private access (${reference}).`);
