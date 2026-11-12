import { describe, expect, it, vi } from 'vitest';
import { cloudflareLeadProvider, leadInput, openAiLeadProvider, qualifyLead } from './leads';
import { FREE_AI_MODEL } from './ai';

const services = [{ id: 'svc_cut', name: 'Signature haircut' }];
const raw = { name: 'Sample Visitor', contact: 'sample@example.invalid', enquiry: 'Haircut tomorrow at 5 PM. Reach sample@example.invalid',
  consentToStore: true, consentExternalAI: true, idempotencyKey: '894c1436-9432-4b3e-8a44-c4e3e54c7728' };
const input = leadInput.parse(raw);

describe('lead qualification', () => {
  it('requires consent and a well formed contact', () => {
    expect(leadInput.safeParse({ ...raw, consentToStore: false }).success).toBe(false);
    expect(leadInput.safeParse({ ...raw, contact: 'not-an-email' }).success).toBe(false);
  });
  it('uses validated model output and redacts contact details', async () => {
    const request = vi.fn(async (_url: unknown, options: RequestInit) => {
      expect(JSON.stringify(options.body)).not.toContain('sample@example.invalid');
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
        serviceId: 'svc_cut', date: '2026-11-13', time: '17:00', language: 'en', priority: 'high',
      }) } }] }), { status: 200 });
    });
    const provider = openAiLeadProvider('https://api.example.test/v1','test-key','test-model',request as typeof fetch);
    const result = await qualifyLead(input,services,'Asia/Colombo','2026-11-12',provider);
    expect(result.mode).toBe('llm');
    expect(result.qualification.priority).toBe('high');
    expect(request).toHaveBeenCalledOnce();
    expect(String(request.mock.calls[0]?.[0])).toBe('https://api.example.test/v1/chat/completions');
  });
  it('falls back when the model invents a service or fails', async () => {
    const wrong = await qualifyLead(input,services,'Asia/Colombo','2026-11-12', { classify: async () => ({
      serviceId: 'invented',date: '2026-11-13',time:'17:00',language:'en',priority:'high',
    }) });
    expect(wrong.mode).toBe('fallback');
    expect(wrong.qualification.serviceId).toBe('svc_cut');
    const failed = await qualifyLead(input,services,'Asia/Colombo','2026-11-12', { classify: async () => { throw new Error('offline'); } });
    expect(failed.mode).toBe('fallback');
  });
  it('accepts a validated Workers AI response', async () => {
    const run = vi.fn(async (...args:[string,unknown]) => { void args; return { response: { serviceId:'svc_cut',date:'2026-11-13',time:'17:00',language:'en',priority:'high' } }; });
    const result = await qualifyLead(input,services,'Asia/Colombo','2026-11-12',cloudflareLeadProvider({ run }));
    expect(result.mode).toBe('llm');
    expect(JSON.stringify(run.mock.calls)).not.toContain('sample@example.invalid');
    expect(run.mock.calls[0]?.[0]).toBe(FREE_AI_MODEL);
    expect(run.mock.calls[0]?.[1]).toMatchObject({temperature:0,max_tokens:160});
  });
  it('rejects insecure remote model endpoints', () => {
    expect(() => openAiLeadProvider('http://api.example.test/v1','key','model')).toThrow('HTTPS');
  });
});
