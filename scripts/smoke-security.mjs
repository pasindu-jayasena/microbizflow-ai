import assert from 'node:assert/strict';

const base = 'http://127.0.0.1:8788';
const password = process.env.LOCAL_OWNER_PASSWORD;
if (!password) throw new Error('Set LOCAL_OWNER_PASSWORD to the local owner password for this test.');
const groups = crypto.randomUUID().replaceAll('-', '').match(/.{4}/g);
const ip = `2001:db8:${groups.slice(0, 6).join(':')}`;
const login = await fetch(`${base}/api/owner/login`, { method: 'POST', headers: {
  'Content-Type': 'application/json', 'CF-Connecting-IP': ip,
}, body: JSON.stringify({ username: 'owner', password }) });
assert.equal(login.status, 200);
const cookieHeader = login.headers.get('set-cookie') ?? '';
assert.match(cookieHeader, /^mbf_session=[0-9a-f]{64};/);
assert.match(cookieHeader, /HttpOnly/);
assert.match(cookieHeader, /SameSite=Strict/);
assert.match(cookieHeader, /Path=\/api/);
const cookie = cookieHeader.split(';')[0];
const owner = (path, init = {}) => fetch(`${base}${path}`, { ...init, headers: { Cookie: cookie, ...init.headers } });
assert.equal((await fetch(`${base}/api/owner/customers`)).status, 401);
assert.equal((await owner('/api/owner/customers')).status, 200);
assert.equal((await owner('/api/owner/customers', { headers: { Origin: 'https://attacker.example.invalid' } })).status, 403);
assert.equal((await owner('/api/owner/retention/run', { method: 'POST', headers: { Origin: 'https://attacker.example.invalid' } })).status, 403);
assert.equal((await owner('/api/owner/customers', { headers: { Origin: base } })).status, 200);
const preflight = await fetch(`${base}/api/owner/customers/example`, { method: 'OPTIONS', headers: {
  Origin: base, 'Access-Control-Request-Method': 'DELETE',
} });
assert.equal(preflight.status, 204);
assert.ok(preflight.headers.get('access-control-allow-methods')?.includes('DELETE'));
assert.equal((await owner('/api/owner/logout', { method: 'POST' })).status, 200);
assert.equal((await owner('/api/owner/customers')).status, 401);
console.log('Local security test passed: owner session, private route, cross-origin rejection, CORS preflight, and logout.');
