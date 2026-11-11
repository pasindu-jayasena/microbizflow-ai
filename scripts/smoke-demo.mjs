import assert from 'node:assert/strict';
import { Temporal } from '@js-temporal/polyfill';

const base = 'http://127.0.0.1:8788';
const password = process.env.LOCAL_OWNER_PASSWORD;
if (!password) throw new Error('Set LOCAL_OWNER_PASSWORD to the synthetic local owner password.');
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
  serviceId: 'svc_cut', date, time, customerName: 'Discard this synthetic name', customerContact: contact,
  note: 'Discard this synthetic note', idempotencyKey: crypto.randomUUID(),
}) });
assert.equal((await submit('visitor@example.com')).status, 400);
assert.equal((await submit('+94771234567')).status, 400);
const accepted = await submit(`demo-${crypto.randomUUID()}@example.invalid`);
assert.equal(accepted.status, 201);
const { reference } = await accepted.json();
const login = await fetch(`${base}/api/owner/login`, { method: 'POST', headers,
  body: JSON.stringify({ username: 'owner', password }) });
assert.equal(login.status, 200);
const cookie = login.headers.get('set-cookie')?.split(';')[0];
assert.ok(cookie?.startsWith('mbf_session='));
const owner = await fetch(`${base}/api/owner/appointments?q=${encodeURIComponent(reference)}`, { headers: { Cookie: cookie } }).then(response => response.json());
const stored = owner.appointments.find(item => item.reference === reference);
assert.equal(stored.customer_name, 'Demo visitor');
assert.equal(stored.customer_note, '');
console.log('Local demo guard passed: real contacts rejected, fictional contact accepted, name and note discarded.');
