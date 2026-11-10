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
const owner = (path, init = {}) => fetch(`${base}${path}`, { ...init, headers: { ...headers, Cookie: cookie, ...init.headers } });

assert.equal((await fetch(`${base}/api/owner/customers`)).status, 401);
const catalogue = await fetch(`${base}/api/business`).then(response => response.json());
const today = Temporal.Now.zonedDateTimeISO(catalogue.business.timezone).toPlainDate();
let date = '';
let slot = '';
for (let offset = 2; offset <= 9; offset++) {
  date = today.add({ days: offset }).toString();
  const availability = await fetch(`${base}/api/availability?serviceId=svc_cut&date=${date}`).then(response => response.json());
  if (availability.slots?.length) { slot = availability.slots[0]; break; }
}
assert.ok(slot, 'A future slot is required');
const contact = `crm-${crypto.randomUUID()}@example.invalid`;
const booked = await fetch(`${base}/api/bookings`, { method: 'POST', headers, body: JSON.stringify({
  serviceId: 'svc_cut', date, time: slot, customerName: 'Fictional CRM Test', customerContact: contact,
  note: '', idempotencyKey: crypto.randomUUID(),
}) });
assert.equal(booked.status, 201);
const listingResponse = await owner(`/api/owner/customers?q=${encodeURIComponent(contact)}`);
assert.equal(listingResponse.status, 200, `Customer search returned ${listingResponse.status}: ${await listingResponse.clone().text()}`);
const listing = await listingResponse.json();
const record = listing.customers.find(item => item.contact_key === contact);
assert.ok(record, 'New bookings must create customer records');
assert.ok(record.booking_count >= 1);
const path = `/api/owner/customers/${encodeURIComponent(record.contact_key)}`;
const detail = await owner(path).then(response => response.json());
assert.ok(detail.appointments.length >= 1);
const original = detail.customer.notes;
const note = 'Synthetic owner-only CRM smoke test';
const updated = await owner(path, { method: 'PATCH', body: JSON.stringify({ notes: note }) });
assert.equal(updated.status, 200);
assert.equal((await owner(path).then(response => response.json())).customer.notes, note);
const restored = await owner(path, { method: 'PATCH', body: JSON.stringify({ notes: original }) });
assert.equal(restored.status, 200);
assert.equal((await fetch(`${base}${path}`)).status, 401);
console.log('Local CRM test passed: protected search, booking history, private note update, and restore.');
