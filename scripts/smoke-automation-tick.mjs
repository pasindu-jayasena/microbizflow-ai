import assert from 'node:assert/strict';

const token = process.env.LOCAL_AUTOMATION_TICK_TOKEN;
if (!token) throw new Error('Set LOCAL_AUTOMATION_TICK_TOKEN to the disposable local automation token.');
const endpoint = 'http://127.0.0.1:8788/api/automation/tick';
const post = authorization => fetch(endpoint,{method:'POST',headers:authorization ? {Authorization:authorization} : {}});
assert.equal((await post()).status,401);
assert.equal((await post(`Bearer ${'a'.repeat(43)}`)).status,401);
const accepted = await post(`Bearer ${token}`);
assert.equal(accepted.status,200);
const result = await accepted.json();
for (const field of ['reminders','followups','processed','failed']) assert.ok(Number.isInteger(result[field]) && result[field]>=0);
console.log('Local automation tick passed: denied missing and invalid tokens, accepted scoped token, bounded queue summary.');
