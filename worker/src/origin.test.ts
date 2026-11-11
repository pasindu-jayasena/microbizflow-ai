import { describe, expect, it } from 'vitest';
import { allowedRequestOrigin } from './origin';

const configured = 'https://microbizflow-ai.pages.dev';

describe('request origin guard', () => {
  it('accepts the request URL origin for local and production Pages', () => {
    expect(allowedRequestOrigin(new Request('http://127.0.0.1:8788/api/bookings', { headers: { origin: 'http://127.0.0.1:8788' } }), configured)).toBe(true);
    expect(allowedRequestOrigin(new Request('https://microbizflow-ai.pages.dev/api/bookings', { headers: { origin: configured } }), configured)).toBe(true);
  });

  it('accepts the explicitly configured separate UI origin', () => {
    expect(allowedRequestOrigin(new Request('http://127.0.0.1:8787/api/bookings', { headers: { origin: 'http://127.0.0.1:5173' } }), 'http://127.0.0.1:5173')).toBe(true);
  });

  it('rejects a browser request from another origin', () => {
    expect(allowedRequestOrigin(new Request('https://microbizflow-ai.pages.dev/api/bookings', { headers: { origin: 'https://attacker.example.invalid' } }), configured)).toBe(false);
  });
});
