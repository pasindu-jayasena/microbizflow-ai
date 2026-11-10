import { describe, expect, it, vi } from 'vitest';
import { analyzeEnquiry, cloudflareProvider } from './ai';

const services = [{ id: 'cut', name: 'Signature haircut' }];
const text = 'I need a haircut tomorrow at 5 PM. Email me at fake@example.com';
const date = '2026-11-11';

describe('AI provider and fallback', () => {
  it('uses validated structured model output and redacts obvious contact data', async () => {
    const run = vi.fn(async () => ({ response: { serviceId: 'cut', date: '2026-11-12', time: '17:00', language: 'en' } }));
    const result = await analyzeEnquiry(text, services, 'Asia/Colombo', date, cloudflareProvider({ run }));
    expect(result.mode).toBe('cloudflare');
    expect(result.intent.missing).toEqual([]);
    expect(JSON.stringify(run.mock.calls)).not.toContain('fake@example.com');
  });
  it('falls back on invalid output and errors', async () => {
    const invalid = await analyzeEnquiry(text, services, 'Asia/Colombo', date, { extract: async () => ({ serviceId: 'fake' }) });
    const failed = await analyzeEnquiry(text, services, 'Asia/Colombo', date, { extract: async () => { throw new Error('quota'); } });
    expect(invalid.mode).toBe('fallback');
    expect(failed.mode).toBe('fallback');
    expect(failed.intent.serviceId).toBe('cut');
  });
  it('returns from a stalled provider within its timeout', async () => {
    const result = await analyzeEnquiry(text, services, 'Asia/Colombo', date, { extract: () => new Promise(() => {}) }, 10);
    expect(result.mode).toBe('fallback');
  });
  it('retries one capacity rejection but never retries a quota failure', async () => {
    const recovered = vi.fn().mockRejectedValueOnce(new Error('3040 out of capacity')).mockResolvedValueOnce({ response: { serviceId: 'cut', date: '2026-11-12', time: '17:00', language: 'en' } });
    expect((await analyzeEnquiry(text, services, 'Asia/Colombo', date, cloudflareProvider({ run: recovered }))).mode).toBe('cloudflare');
    expect(recovered).toHaveBeenCalledTimes(2);
    const quota = vi.fn().mockRejectedValue(new Error('3036 daily limit'));
    expect((await analyzeEnquiry(text, services, 'Asia/Colombo', date, cloudflareProvider({ run: quota }))).mode).toBe('fallback');
    expect(quota).toHaveBeenCalledTimes(1);
  });
});
