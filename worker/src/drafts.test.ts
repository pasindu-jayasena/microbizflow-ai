import { describe, expect, it, vi } from 'vitest';
import { cloudflareDraftProvider, generateDraft, openAiDraftProvider } from './drafts';
import { FREE_AI_MODEL } from './ai';

const context = { reference:'MBF-1234ABCD',service_name:'Signature haircut',subject_status:'followup_due' };
const fallback = 'Thank you for visiting. Your booking MBF-1234ABCD is complete.';

describe('human-approved AI draft generation', () => {
  it('accepts a concise validated message from an OpenAI-compatible endpoint', async () => {
    const request = vi.fn(async (_url: unknown, options: RequestInit) => {
      expect(JSON.stringify(options.body)).not.toContain('customer_contact');
      return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({body:'Thanks for visiting us. Your reference is MBF-1234ABCD.'})}}]}),{status:200});
    });
    const provider = openAiDraftProvider('https://api.example.test/v1','test-key','test-model',request as typeof fetch);
    const result = await generateDraft(context,fallback,provider);
    expect(result.mode).toBe('llm');
    expect(result.body).toContain(context.reference);
    expect(request).toHaveBeenCalledOnce();
  });
  it('rejects invented URLs, missing references, and model failures', async () => {
    for (const body of ['Visit https://example.com for MBF-1234ABCD','Thanks for visiting our salon.']) {
      const result = await generateDraft(context,fallback,{generate:async()=>({body})});
      expect(result).toMatchObject({body:fallback,mode:'fallback'});
    }
    const failed = await generateDraft(context,fallback,{generate:async()=>{throw new Error('quota');}});
    expect(failed.mode).toBe('fallback');
  });
  it('supports a validated Workers AI response and deterministic no-provider mode', async () => {
    const run = vi.fn(async (...args:[string,unknown]) => { void args; return {response:{body:'Your haircut is complete. Reference MBF-1234ABCD.'}}; });
    expect((await generateDraft(context,fallback,cloudflareDraftProvider({run}))).mode).toBe('llm');
    expect(run.mock.calls[0]?.[0]).toBe(FREE_AI_MODEL);
    expect(run.mock.calls[0]?.[1]).toMatchObject({temperature:0,max_tokens:160});
    expect((await generateDraft(context,fallback)).mode).toBe('rules');
  });
});
