export interface AuthEnv {
  DB: D1Database;
  OWNER_USERNAME?: string;
  OWNER_PASSWORD_HASH?: string;
}

const encoder = new TextEncoder();

export async function sha256(input: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(input)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function cookieValue(request: Request, name: string): string | null {
  const pair = request.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`));
  return pair?.slice(name.length + 1) ?? null;
}

export async function ownerBusiness(request: Request, env: AuthEnv): Promise<string | null> {
  const token = cookieValue(request, 'mbf_session');
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const hash = await sha256(token);
  const row = await env.DB.prepare('SELECT business_id FROM owner_sessions WHERE token_hash = ? AND expires_at > ?').bind(hash, Date.now()).first<{ business_id: string }>();
  return row?.business_id ?? null;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, expectedHex] = stored.split(':');
  if (!saltHex || !expectedHex || !/^[0-9a-f]{32}$/.test(saltHex) || !/^[0-9a-f]{64}$/.test(expectedHex)) return false;
  const salt = Uint8Array.from(saltHex.match(/../g)!.map(value => parseInt(value, 16)));
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 210_000 }, key, 256));
  const expected = Uint8Array.from(expectedHex.match(/../g)!.map(value => parseInt(value, 16)));
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= (bits[i] ?? 0) ^ (expected[i] ?? 0);
  return difference === 0;
}

function sessionCookie(token: string, request: Request, maxAge: number): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `mbf_session=${token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${maxAge}${secure}`;
}

export async function login(request: Request, env: AuthEnv, businessId: string, username: string, password: string): Promise<Response> {
  if (!env.OWNER_PASSWORD_HASH) return Response.json({ error: 'Owner login is not configured' }, { status: 503 });
  const client = request.headers.get('CF-Connecting-IP') ?? 'local';
  const clientHash = await sha256(client);
  const now = Date.now();
  const prior = await env.DB.prepare('SELECT attempts,window_start FROM login_attempts WHERE client_hash = ?').bind(clientHash).first<{ attempts: number; window_start: number }>();
  if (prior && now - prior.window_start < 15 * 60_000 && prior.attempts >= 5) return Response.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
  const valid = username === (env.OWNER_USERNAME || 'owner') && await verifyPassword(password, env.OWNER_PASSWORD_HASH);
  if (!valid) {
    await env.DB.prepare(`INSERT INTO login_attempts (client_hash,attempts,window_start) VALUES (?,1,?)
      ON CONFLICT(client_hash) DO UPDATE SET attempts = CASE WHEN ? - window_start >= 900000 THEN 1 ELSE attempts + 1 END,
      window_start = CASE WHEN ? - window_start >= 900000 THEN ? ELSE window_start END`).bind(clientHash, now, now, now, now).run();
    return Response.json({ error: 'Invalid credentials' }, { status: 401 });
  }
  await env.DB.prepare('DELETE FROM login_attempts WHERE client_hash = ?').bind(clientHash).run();
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
  // A 64-character hexadecimal token is accepted by the cookie parser below.
  const hash = await sha256(token);
  await env.DB.prepare('INSERT INTO owner_sessions (token_hash,business_id,expires_at) VALUES (?,?,?)').bind(hash, businessId, now + 8 * 60 * 60_000).run();
  return Response.json({ authenticated: true }, { headers: { 'Set-Cookie': sessionCookie(token, request, 8 * 60 * 60) } });
}

export async function logout(request: Request, env: AuthEnv): Promise<Response> {
  const token = cookieValue(request, 'mbf_session');
  if (token) await env.DB.prepare('DELETE FROM owner_sessions WHERE token_hash = ?').bind(await sha256(token)).run();
  return Response.json({ authenticated: false }, { headers: { 'Set-Cookie': sessionCookie('', request, 0) } });
}

export async function allowPublicBooking(request: Request, db: D1Database): Promise<boolean> {
  const clientHash = await sha256(request.headers.get('CF-Connecting-IP') ?? 'local');
  const now = Date.now();
  await db.prepare(`INSERT INTO public_request_limits (client_hash,requests,window_start) VALUES (?,1,?)
    ON CONFLICT(client_hash) DO UPDATE SET requests = CASE WHEN ? - window_start >= 3600000 THEN 1 ELSE requests + 1 END,
    window_start = CASE WHEN ? - window_start >= 3600000 THEN ? ELSE window_start END`).bind(clientHash, now, now, now, now).run();
  const row = await db.prepare('SELECT requests FROM public_request_limits WHERE client_hash = ?').bind(clientHash).first<{ requests: number }>();
  return (row?.requests ?? 999) <= 30;
}
