import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const base = 'http://127.0.0.1:8788';
const password = process.env.LOCAL_OWNER_PASSWORD;
if (!password) throw new Error('Set LOCAL_OWNER_PASSWORD to the local owner password for this test.');
const sql = command => execFileSync('node', ['scripts/wrangler.mjs', 'd1', 'execute', 'microbizflow-local',
  '--config', 'wrangler.worker.toml', '--local', '--command', command], { stdio: 'pipe' });
const start = new Date(Date.now() + 20 * 60 * 60_000).toISOString();
const end = new Date(Date.parse(start) + 45 * 60_000).toISOString();
const appointments = [];
for (let index = 0; index < 2; index++) {
  const id = crypto.randomUUID();
  const resource = `reminder_${id}`;
  const reference = `MBF-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  sql(`INSERT INTO resources(id,business_id,name,active) VALUES('${resource}','biz_demo','Fictional reminder test ${index} ${id.slice(0,8)}',0)`);
  sql(`INSERT INTO appointments(id,reference,business_id,service_id,resource_id,customer_name,customer_contact,customer_note,start_at,end_at,status,idempotency_key)
    VALUES('${id}','${reference}','biz_demo','svc_cut','${resource}','Fictional Reminder Test','reminder-${id}@example.invalid','','${start}','${end}','confirmed','${crypto.randomUUID()}')`);
  appointments.push({ id, reference });
}
const login = await fetch(`${base}/api/owner/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'owner', password }) });
assert.equal(login.status, 200);
const cookie = login.headers.get('set-cookie')?.split(';')[0];
assert.ok(cookie?.startsWith('mbf_session='));
const owner = (path, init = {}) => fetch(`${base}${path}`, { ...init, headers: {
  Cookie: cookie, 'Content-Type': 'application/json', ...init.headers,
} });
assert.equal((await fetch(`${base}/api/owner/reminders/run`, { method: 'POST' })).status, 401);
const queued = await owner('/api/owner/reminders/run', { method: 'POST' });
assert.equal(queued.status, 200);
assert.ok((await queued.json()).queued >= 2);
const findNotices = async () => (await owner('/api/owner/notifications').then(response => response.json())).notifications;
for (let attempt = 0; attempt < 5; attempt++) {
  const notices = await findNotices();
  if (appointments.every(item => notices.some(notice => notice.event_key === `${item.id}:reminder`))) break;
  await owner('/api/owner/workflows/run', { method: 'POST' });
}
const notices = await findNotices();
const first = notices.find(item => item.event_key === `${appointments[0].id}:reminder`);
const second = notices.find(item => item.event_key === `${appointments[1].id}:reminder`);
assert.equal(first?.state, 'needs_approval');
assert.equal(second?.state, 'needs_approval');
assert.equal((await owner('/api/owner/reminders/run', { method: 'POST' }).then(response => response.json())).queued, 0);
const cancelled = await owner(`/api/owner/appointments/${appointments[0].id}`, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) });
assert.equal(cancelled.status, 200);
assert.equal((await owner(`/api/owner/notifications/${first.id}/approve`, { method: 'POST' })).status, 409);
const approved = await owner(`/api/owner/notifications/${second.id}/approve`, { method: 'POST' });
assert.equal(approved.status, 200);
assert.equal((await approved.json()).mockDelivered, true);
assert.equal((await findNotices()).filter(item => item.event_key === `${appointments[1].id}:reminder`).length, 1);
console.log('Local reminder test passed: idempotent drafts, human approval, mock delivery, and cancellation guard.');
