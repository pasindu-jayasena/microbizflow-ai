import { describe, expect, it } from 'vitest';
import { verifyWebhook } from './webhooks';

const secret = 'synthetic-webhook-secret-for-unit-testing-only';
const body = JSON.stringify({ id: '66a9a9c4-4308-4f23-9ff5-4ac3e1fe4931', type: 'booking.followup_requested', reference: 'MBF-1234ABCD' });
const now = 1_795_000_000_000;

async function signed(timestamp: number, content = body) {
  const stamp = String(Math.floor(timestamp / 1000));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${stamp}.${content}`)));
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return new Request('https://example.invalid/api/webhooks/inbound', { method: 'POST', headers: { 'X-MicroBizFlow-Timestamp': stamp, 'X-MicroBizFlow-Signature': `sha256=${hex}` }, body: content });
}

describe('inbound webhook authentication', () => {
  it('accepts a correctly signed recent body', async () => {
    expect(await verifyWebhook(await signed(now), body, secret, now)).toBe(true);
  });
  it('rejects changed content, stale timestamps, and missing configuration', async () => {
    expect(await verifyWebhook(await signed(now), `${body} `, secret, now)).toBe(false);
    expect(await verifyWebhook(await signed(now - 300_001), body, secret, now)).toBe(false);
    expect(await verifyWebhook(await signed(now), body, undefined, now)).toBe(false);
  });
});
