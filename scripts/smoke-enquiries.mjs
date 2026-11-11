import assert from 'node:assert/strict';
import { Temporal } from '@js-temporal/polyfill';

const base = 'http://127.0.0.1:8788';
const password = process.env.LOCAL_OWNER_PASSWORD;
if (!password) throw new Error('Set LOCAL_OWNER_PASSWORD to the local owner password for this test.');
const ip = `2001:db8:${crypto.randomUUID().replaceAll('-', '').match(/.{4}/g).slice(0, 6).join(':')}`;
const headers = { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip };
const catalogue = await fetch(`${base}/api/business`).then(response => response.json());
const message = 'I need a haircut tomorrow at 5 PM. Contact synthetic-private@example.invalid';
const analyzed = await fetch(`${base}/api/enquiries/analyze`, { method: 'POST', headers, body: JSON.stringify({ text: message, consentExternalAI: false }) });
assert.equal(analyzed.status, 200);
const analysis = await analyzed.json();
assert.ok(analysis.analysisId);
assert.equal(analysis.intent.serviceId, 'svc_cut');
assert.equal((await fetch(`${base}/api/owner/enquiries`)).status, 401);
const login = await fetch(`${base}/api/owner/login`, { method: 'POST', headers, body: JSON.stringify({ username: 'owner', password }) });
assert.equal(login.status, 200);
const cookie = login.headers.get('set-cookie')?.split(';')[0];
assert.ok(cookie?.startsWith('mbf_session='));
const owner = (path, init = {}) => fetch(`${base}${path}`, { ...init, headers: { Cookie: cookie, ...init.headers } });
const list = await owner('/api/owner/enquiries').then(response => response.json());
assert.ok(!JSON.stringify(list).includes('synthetic-private@example.invalid'));
assert.ok(list.enquiries.some(item => item.id === analysis.analysisId && !item.reference));
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
  serviceId: 'svc_cut', date, time, customerName: 'Fictional Enquiry Test',
  customerContact: `enquiry-${crypto.randomUUID()}@example.invalid`, note: '',
  idempotencyKey: crypto.randomUUID(), analysisId: analysis.analysisId,
}) });
assert.equal(booked.status, 201);
const { reference } = await booked.json();
const linked = await owner('/api/owner/enquiries').then(response => response.json());
assert.equal(linked.enquiries.find(item => item.id === analysis.analysisId)?.reference, reference);
assert.equal((await owner(`/api/owner/enquiries/${analysis.analysisId}/review`, { method: 'POST' })).status, 200);
assert.equal((await owner(`/api/owner/enquiries/${analysis.analysisId}/review`, { method: 'POST' })).status, 409);
console.log('Local enquiry review passed: structured storage, private access, booking link, and one-time review.');
