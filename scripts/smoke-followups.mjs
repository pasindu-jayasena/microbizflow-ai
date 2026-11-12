import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const base = 'http://127.0.0.1:8788';
const password = process.env.LOCAL_OWNER_PASSWORD;
if (!password) throw new Error('Set LOCAL_OWNER_PASSWORD to a disposable local owner password.');
const sql = command => execFileSync(process.execPath,['scripts/wrangler.mjs','d1','execute','microbizflow-local',
  '--config','wrangler.worker.toml','--local','--command',command,'--json'],{encoding:'utf8'});
const id = crypto.randomUUID();
const reference = `MBF-${crypto.randomUUID().slice(0,8).toUpperCase()}`;
const resource = `followup_${id}`;
const start = new Date(Date.now()-49*60*60_000).toISOString();
const end = new Date(Date.now()-48*60*60_000).toISOString();
sql(`INSERT INTO resources(id,business_id,name,active) VALUES('${resource}','biz_demo','Fictional follow-up ${id.slice(0,8)}',0)`);
sql(`INSERT INTO appointments(id,reference,business_id,service_id,resource_id,customer_name,customer_contact,customer_note,start_at,end_at,status,idempotency_key)
  VALUES('${id}','${reference}','biz_demo','svc_cut','${resource}','Fictional Follow-up','followup-${id}@example.invalid','','${start}','${end}','completed','${crypto.randomUUID()}')`);
const headers = { 'Content-Type':'application/json' };
assert.equal((await fetch(`${base}/api/owner/followups/run`,{method:'POST'})).status,401);
const login = await fetch(`${base}/api/owner/login`,{method:'POST',headers,
  body:JSON.stringify({username:'owner',password})});
assert.equal(login.status,200);
const cookie = login.headers.get('set-cookie')?.split(';')[0];
const owner = (path,init={}) => fetch(`${base}${path}`,{...init,headers:{Cookie:cookie,...headers,...init.headers}});
const first = await owner('/api/owner/followups/run',{method:'POST'});
assert.equal(first.status,200);
assert.ok((await first.json()).queued >= 1);
let draft;
for (let attempt=0; attempt<12; attempt++) {
  const notices = await owner('/api/owner/notifications').then(response=>response.json());
  draft = notices.notifications.find(item=>item.event_key===`${id}:followup`);
  if (draft) break;
  await owner('/api/owner/workflows/run',{method:'POST'});
}
assert.equal(draft?.state,'needs_approval');
assert.equal(draft.generation_mode,'rules');
assert.match(draft.body,new RegExp(reference));
const approved = await owner(`/api/owner/notifications/${draft.id}/approve`,{method:'POST'});
assert.equal(approved.status,200);
assert.equal((await approved.json()).mockDelivered,true);
const repeated = await owner('/api/owner/followups/run',{method:'POST'});
assert.equal(repeated.status,200);
const raw = sql(`SELECT COUNT(*) AS events FROM workflow_events WHERE event_key='${id}:followup'`);
const results = JSON.parse(raw.slice(raw.indexOf('[\n')));
assert.equal(results[0].results[0].events,1);
console.log('Local follow-up passed: scheduled eligibility, one event, approval-gated draft, mock delivery and private access.');
