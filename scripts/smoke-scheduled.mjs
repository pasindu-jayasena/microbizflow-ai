import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { Temporal } from '@js-temporal/polyfill';

const base = 'http://127.0.0.1:8787';
const password = process.env.LOCAL_OWNER_PASSWORD;
const secret = process.env.LOCAL_WEBHOOK_SECRET;
if (!password || !secret) throw new Error('Set LOCAL_OWNER_PASSWORD and LOCAL_WEBHOOK_SECRET for this test.');
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
const booked = await fetch(`${base}/api/bookings`, { method: 'POST', headers, body: JSON.stringify({
  serviceId: 'svc_cut', date, time, customerName: 'Fictional Scheduled Recovery Test',
  customerContact: `scheduled-${crypto.randomUUID()}@example.invalid`, note: '', idempotencyKey: crypto.randomUUID(),
}) });
assert.equal(booked.status, 201);
const { reference } = await booked.json();
const login = await fetch(`${base}/api/owner/login`, { method: 'POST', headers, body: JSON.stringify({ username: 'owner', password }) });
assert.equal(login.status, 200);
const cookie = login.headers.get('set-cookie')?.split(';')[0];
assert.ok(cookie?.startsWith('mbf_session='));
const owner = path => fetch(`${base}${path}`, { headers: { Cookie: cookie } }).then(response => response.json());
const readEvent = async () => (await owner('/api/owner/workflows')).workflows.find(item => item.reference === reference && item.kind === 'booking_requested');
const event = await readEvent();
assert.ok(event?.event_key);
assert.match(event.event_key, /^[0-9a-f-]{36}:created$/);
execFileSync('node', ['scripts/wrangler.mjs', 'd1', 'execute', 'microbizflow-local', '--config', 'wrangler.worker.toml', '--local',
  '--command', `UPDATE workflow_events SET state='failed',attempts=0 WHERE event_key='${event.event_key}'`], { stdio: 'pipe' });
assert.equal((await readEvent()).state, 'failed');
for (let attempt = 0; attempt < 5 && (await readEvent()).state !== 'done'; attempt++) {
  const scheduled = await fetch(`${base}/cdn-cgi/local/scheduled?format=json`);
  assert.equal(scheduled.status, 200, await scheduled.text());
}
assert.equal((await readEvent()).state, 'done');
const notices = (await owner('/api/owner/notifications')).notifications.filter(item => item.reference === reference && item.kind === 'owner_notice');
assert.equal(notices.length, 1, 'Retry must not duplicate the notification');
const webhookId = crypto.randomUUID();
const body = JSON.stringify({ id: webhookId, type: 'booking.followup_requested', reference });
const stamp = String(Math.floor(Date.now() / 1000));
const signature = createHmac('sha256', secret).update(`${stamp}.${body}`).digest('hex');
const accepted = await fetch(`${base}/api/webhooks/inbound`, { method: 'POST', body, headers: {
  ...headers, 'X-MicroBizFlow-Timestamp': stamp, 'X-MicroBizFlow-Signature': `sha256=${signature}`,
} });
assert.equal(accepted.status, 201);
execFileSync('node', ['scripts/wrangler.mjs', 'd1', 'execute', 'microbizflow-local', '--config', 'wrangler.worker.toml', '--local',
  '--command', `UPDATE inbound_webhooks SET state='failed',attempts=0 WHERE external_id='${webhookId}'`], { stdio: 'pipe' });
const readWebhook = async () => (await owner('/api/owner/webhooks')).events.find(item => item.external_id === webhookId);
assert.equal((await readWebhook()).state, 'failed');
for (let attempt = 0; attempt < 5 && (await readWebhook()).state !== 'done'; attempt++) {
  const scheduled = await fetch(`${base}/cdn-cgi/local/scheduled?format=json`);
  assert.equal(scheduled.status, 200, await scheduled.text());
}
assert.equal((await readWebhook()).state, 'done');
assert.equal((await owner('/api/owner/webhooks')).tasks.filter(item => item.reference === reference).length, 1);
console.log('Local scheduled recovery passed: failed workflow and webhook retried without duplicate notice or task.');
