import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const base = 'http://127.0.0.1:8788';
const contact = `lead-${crypto.randomUUID()}@example.invalid`;
const idempotencyKey = crypto.randomUUID();
const headers = { 'Content-Type': 'application/json', 'CF-Connecting-IP': `2001:db8:${crypto.randomUUID().slice(0,4)}::1` };
const body = { name: 'Fictional Lead', contact, enquiry: 'I need a haircut tomorrow at 5 PM.',
  consentToStore: true, consentExternalAI: false, idempotencyKey };
const post = payload => fetch(`${base}/api/leads`, { method: 'POST', headers, body: JSON.stringify(payload) });

assert.equal((await fetch(`${base}/api/owner/leads`)).status,401);
assert.equal((await post({ ...body, consentToStore: false })).status,400);
assert.equal((await post({ ...body, contact: 'real@example.com' })).status,400);
const first = await post(body);
assert.equal(first.status,201);
const created = await first.json();
assert.equal(created.qualification.serviceId,'svc_cut');
assert.equal(created.qualification.priority,'high');
assert.equal(created.mode,'rules');
const repeat = await post(body);
assert.equal(repeat.status,200);
const repeated = await repeat.json();
assert.equal(repeated.id,created.id);
assert.equal(repeated.duplicate,true);
assert.deepEqual(repeated.qualification,created.qualification);
assert.equal((await post({ ...body, enquiry: 'Different enquiry' })).status,409);

const query = `SELECT (SELECT COUNT(*) FROM leads WHERE id='${created.id}') AS leads,` +
  ` (SELECT COUNT(*) FROM customer_records WHERE business_id='biz_demo' AND contact_key='${contact}') AS customers`;
const raw = execFileSync(process.execPath, ['scripts/wrangler.mjs','d1','execute','microbizflow-local',
  '--config','wrangler.worker.toml','--local','--command',query,'--json'], { encoding: 'utf8' });
const rows = JSON.parse(raw.slice(raw.indexOf('[\n')));
assert.equal(rows[0].results[0].leads,1);
assert.equal(rows[0].results[0].customers,1);
console.log('Local lead workflow passed: consent, demo guard, qualification, idempotency, private access and customer creation.');
