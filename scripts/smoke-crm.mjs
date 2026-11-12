import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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
const contact = `crm-adapter-${crypto.randomUUID()}@example.invalid`;
const booked = await fetch(`${base}/api/bookings`, { method: 'POST', headers, body: JSON.stringify({
  serviceId: 'svc_cut', date, time, customerName: 'Fictional CRM Adapter Test', customerContact: contact,
  note: '', idempotencyKey: crypto.randomUUID(),
}) });
assert.equal(booked.status, 201);
const { reference } = await booked.json();
const login = await fetch(`${base}/api/owner/login`, { method: 'POST', headers, body: JSON.stringify({ username: 'owner', password }) });
assert.equal(login.status, 200);
const cookie = login.headers.get('set-cookie')?.split(';')[0];
assert.ok(cookie?.startsWith('mbf_session='));
const owner = (path, init = {}) => fetch(`${base}${path}`, { ...init, headers: {
  Cookie: cookie, 'Content-Type': 'application/json', ...init.headers,
} });
assert.equal((await fetch(`${base}/api/owner/integrations`)).status, 401);
assert.equal((await fetch(`${base}/api/owner/integrations/run`, { method: 'POST' })).status, 401);
const readActivity = async () => owner('/api/owner/integrations').then(response => response.json());
const activity = await readActivity();
assert.equal(activity.provider, 'mock');
assert.equal(activity.externalConfigured, false);
assert.ok(!JSON.stringify(activity).includes(contact), 'Activity must not persist customer contact');
const created = activity.events.find(event => event.reference === reference && event.event_key.endsWith(':created'));
assert.equal(created?.state, 'mock_synced');
const appointments = await owner(`/api/owner/appointments?q=${encodeURIComponent(reference)}`).then(response => response.json());
const appointment = appointments.appointments.find(item => item.reference === reference);
assert.ok(appointment?.id);
assert.equal((await owner(`/api/owner/appointments/${appointment.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'confirmed' }) })).status, 200);
assert.equal((await readActivity()).events.find(event => event.event_key === `${appointment.id}:status:confirmed`)?.state, 'mock_synced');
assert.equal((await owner(`/api/owner/appointments/${appointment.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) })).status, 200);
assert.equal((await owner(`/api/owner/customers/${encodeURIComponent(contact)}`, { method: 'DELETE' })).status, 200);
execFileSync('node', ['scripts/wrangler.mjs', 'd1', 'execute', 'microbizflow-local', '--config', 'wrangler.worker.toml', '--local',
  '--command', `UPDATE crm_sync_events SET state='failed',attempts=0,next_attempt_at=0 WHERE event_key='${appointment.id}:created'`], { stdio: 'pipe' });
const retried = await owner('/api/owner/integrations/run', { method: 'POST' });
assert.equal(retried.status, 200);
assert.equal((await readActivity()).events.find(event => event.event_key === `${appointment.id}:created`)?.state, 'skipped');
console.log('Local CRM mock passed: private durable events, status sync, no stored contact, and deleted-customer skip.');
