import { z } from 'zod';
import type { AiBinding } from './ai';

export interface DraftContext { reference: string; service_name: string; subject_status: string }
export interface DraftProvider { generate(context: DraftContext): Promise<unknown> }

const draftSchema = z.object({ body: z.string().trim().min(10).max(400) });

function validBody(value: unknown, reference: string): string | null {
  const parsed = draftSchema.safeParse(value);
  if (!parsed.success) return null;
  const body = parsed.data.body;
  if (!body.includes(reference) || /https?:\/\/|www\.|@|<|>/i.test(body)) return null;
  return body;
}

export async function generateDraft(context: DraftContext, fallbackBody: string, provider?: DraftProvider): Promise<{ body: string; mode: 'rules'|'llm'|'fallback'; latencyMs: number }> {
  const began = Date.now();
  if (!provider) return { body: fallbackBody,mode:'rules',latencyMs:Date.now()-began };
  try {
    const body = validBody(await provider.generate(context),context.reference);
    if (body) return { body,mode:'llm',latencyMs:Date.now()-began };
  } catch { /* A model failure must not stop a durable notification event. */ }
  return { body:fallbackBody,mode:'fallback',latencyMs:Date.now()-began };
}

function instructions(context: DraftContext): string {
  return `Write one concise, friendly salon customer message as JSON {"body":"..."}. Status: ${context.subject_status}. Service: ${context.service_name}. Reference: ${context.reference}. Include the exact reference. Do not add URLs, contact details, discounts, claims about delivery, or invented business policies. This is a draft for human approval.`;
}

export function openAiDraftProvider(baseUrl: string, apiKey: string, model: string, request: typeof fetch = fetch): DraftProvider {
  const url = new URL('chat/completions',baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  if (url.protocol !== 'https:' && !['localhost','127.0.0.1'].includes(url.hostname)) throw new Error('LLM endpoint must use HTTPS');
  if (url.username || url.password || !apiKey || !model) throw new Error('Invalid LLM configuration');
  return {
    async generate(context): Promise<unknown> {
      const response = await request(url,{ method:'POST',signal:AbortSignal.timeout(7000),
        headers:{'Content-Type':'application/json',Authorization:`Bearer ${apiKey}`},
        body:JSON.stringify({model,temperature:0,response_format:{type:'json_object'},messages:[{role:'system',content:instructions(context)}]}) });
      if (!response.ok) throw new Error(`LLM HTTP ${response.status}`);
      const data = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.length > 4096) throw new Error('Invalid LLM response');
      return JSON.parse(content);
    },
  };
}

export function cloudflareDraftProvider(binding: AiBinding, model = '@cf/meta/llama-3.1-8b-instruct'): DraftProvider {
  return {
    async generate(context): Promise<unknown> {
      const output = await binding.run(model,{ messages:[{role:'system',content:instructions(context)}],
        response_format:{type:'json_schema',json_schema:{type:'object',properties:{body:{type:'string'}},required:['body']}} });
      if (output && typeof output === 'object' && 'response' in output) {
        return typeof output.response === 'string' ? JSON.parse(output.response) : output.response;
      }
      if (output && typeof output === 'object' && 'choices' in output) {
        const content = (output as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message?.content;
        if (typeof content === 'string' && content.length <= 4096) return JSON.parse(content);
      }
      return null;
    },
  };
}
