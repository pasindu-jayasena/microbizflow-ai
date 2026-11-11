import assert from 'node:assert/strict';
import { Temporal } from '@js-temporal/polyfill';

const base = 'http://127.0.0.1:8788';
const password = process.env.LOCAL_OWNER_PASSWORD;
if (!password) throw new Error('Set LOCAL_OWNER_PASSWORD to the local owner password for this test.');
const groups = crypto.randomUUID().replaceAll('-', '').match(/.{4}/g);
const headers = { 'Content-Type': 'application/json', 'CF-Connecting-IP': `2001:db8:${groups.slice(0, 6).join(':')}` };
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
const contact = `privacy-${crypto.randomUUID()}@example.invalid`;
const note = `Synthetic private note ${crypto.randomUUID()}`;
const key = crypto.randomUUID();
const analyzed = await fetch(`${base}/api/enquiries/analyze`, { method: 'POST', headers, body: JSON.stringify({ text: 'I need a haircut tomorrow', consentExternalAI: false }) });
assert.equal(analyzed.status, 200);
const { analysisId } = await analyzed.json();
const booked = await fetch(`${base}/api/bookings`, { method: 'POST', headers, body: JSON.stringify({
  serviceId: 'svc_cut', date, time, customerName: 'Fictional Privacy Test', customerContact: contact,
  note, idempotencyKey: key, analysisId,
}) });
assert.equal(booked.status, 201);
const { reference } = await booked.json();
const login = await fetch(`${base}/api/owner/login`, { method: 'POST', headers, body: JSON.stringify({ username: 'owner', password }) });
assert.equal(login.status, 200);
const cookie = login.headers.get('set-cookie')?.split(';')[0];
assert.ok(cookie?.startsWith('mbf_session='));
const owner = (path, init = {}) => fetch(`${base}${path}`, { ...init, headers: { Cookie: cookie, ...init.headers } });
const path = `/api/owner/customers/${encodeURIComponent(contact)}`;
assert.ok((await owner('/api/owner/enquiries').then(response => response.json())).enquiries.some(item => item.id === analysisId && item.reference === reference));
assert.equal((await fetch(`${base}${path}`, { method: 'DELETE' })).status, 401);
assert.equal((await owner(path, { method: 'DELETE' })).status, 409, 'Active bookings must block deletion');
assert.equal((await owner(path).then(response => response.json())).customer.contact, contact);
const cancel = await fetch(`${base}/api/bookings/cancel`, { method: 'POST', headers, body: JSON.stringify({ reference, cancellationCode: key }) });
assert.equal(cancel.status, 200);
const deleted = await owner(path, { method: 'DELETE' });
assert.equal(deleted.status, 200, await deleted.clone().text());
assert.equal((await deleted.json()).anonymizedBookings, 1);
assert.equal((await owner(path)).status, 404);
assert.ok(!(await owner('/api/owner/enquiries').then(response => response.json())).enquiries.some(item => item.id === analysisId));
assert.equal((await owner(`/api/owner/customers?q=${encodeURIComponent(contact)}`).then(response => response.json())).customers.length, 0);
assert.equal((await fetch(`${base}/api/bookings/status`, { method: 'POST', headers, body: JSON.stringify({ reference, cancellationCode: key }) })).status, 404);
const appointments = await owner(`/api/owner/appointments?q=${encodeURIComponent(reference)}`).then(response => response.json());
const retained = appointments.appointments.find(item => item.reference === reference);
assert.equal(retained?.status, 'cancelled');
assert.equal(retained?.customer_name, 'Deleted customer');
assert.ok(!JSON.stringify(appointments).includes(contact));
assert.ok(!JSON.stringify(appointments).includes(note));
assert.equal((await owner(path, { method: 'DELETE' })).status, 404);
console.log('Local privacy test passed: protected deletion, active-booking guard, anonymized history, and revoked private code.');
