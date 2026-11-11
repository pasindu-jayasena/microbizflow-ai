import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { Temporal } from '@js-temporal/polyfill';

const base = 'http://127.0.0.1:8788';
const secret = process.env.LOCAL_WEBHOOK_SECRET;
const password = process.env.LOCAL_OWNER_PASSWORD;
if (!secret || !password) throw new Error('Set LOCAL_WEBHOOK_SECRET and LOCAL_OWNER_PASSWORD for the local webhook test.');
const headers = { 'Content-Type': 'application/json' };
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
  serviceId: 'svc_cut', date, time, customerName: 'Fictional Webhook Test',
  customerContact: `webhook-${crypto.randomUUID()}@example.invalid`, note: '', idempotencyKey: crypto.randomUUID(),
}) });
assert.equal(booked.status, 201);
const { reference } = await booked.json();
const id = crypto.randomUUID();
const body = JSON.stringify({ id, type: 'booking.followup_requested', reference });
function signed(content, timestamp = Math.floor(Date.now() / 1000)) {
  const stamp = String(timestamp);
  const signature = createHmac('sha256', secret).update(`${stamp}.${content}`).digest('hex');
  return { method: 'POST', headers: { ...headers, 'X-MicroBizFlow-Timestamp': stamp, 'X-MicroBizFlow-Signature': `sha256=${signature}` }, body: content };
}
assert.equal((await fetch(`${base}/api/webhooks/inbound`, { method: 'POST', headers, body })).status, 401);
assert.equal((await fetch(`${base}/api/webhooks/inbound`, signed(body, Math.floor(Date.now() / 1000) - 600))).status, 401);
assert.equal((await fetch(`${base}/api/webhooks/inbound`, { ...signed(body), body: `${body} ` })).status, 401);
const accepted = await fetch(`${base}/api/webhooks/inbound`, signed(body));
assert.equal(accepted.status, 201);
assert.equal((await accepted.json()).state, 'done');
const replay = await fetch(`${base}/api/webhooks/inbound`, signed(body));
assert.equal(replay.status, 200);
assert.equal((await replay.json()).duplicate, true);
assert.equal((await fetch(`${base}/api/owner/webhooks`)).status, 401);
const login = await fetch(`${base}/api/owner/login`, { method: 'POST', headers, body: JSON.stringify({ username: 'owner', password }) });
assert.equal(login.status, 200);
const cookie = login.headers.get('set-cookie')?.split(';')[0];
assert.ok(cookie?.startsWith('mbf_session='));
const owner = (path, init = {}) => fetch(`${base}${path}`, { ...init, headers: { Cookie: cookie, ...init.headers } });
const activity = await owner('/api/owner/webhooks').then(response => response.json());
assert.ok(activity.configured);
assert.equal(activity.events.filter(event => event.external_id === id).length, 1);
const task = activity.tasks.find(item => item.reference === reference);
assert.equal(task?.state, 'open');
assert.equal((await owner(`/api/owner/tasks/${task.id}/complete`, { method: 'POST' })).status, 200);
assert.equal((await owner(`/api/owner/tasks/${task.id}/complete`, { method: 'POST' })).status, 409);
assert.equal((await owner('/api/owner/webhooks/run', { method: 'POST' }).then(response => response.json())).processed, 0);
console.log('Local webhook test passed: signed delivery, freshness, deduplication, protected activity, and owner task completion.');
