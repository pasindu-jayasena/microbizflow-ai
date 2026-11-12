import { describe,expect,it,vi } from 'vitest';
import { openAiOperationProvider, planOperation, rulesPlan, validatePlan, type OperationService } from './operations';

const services:OperationService[]=[{id:'svc_cut',name:'Signature haircut',price_minor:250000}];

describe('owner operations assistant',()=>{
  it('classifies bounded read-only questions without generating SQL',()=>{
    expect(rulesPlan('How many pending appointments?',services).intent).toBe('pending_count');
    expect(rulesPlan('How many upcoming visits?',services).intent).toBe('upcoming_count');
    expect(rulesPlan('Show failed CRM sync events',services).intent).toBe('failure_count');
    expect(rulesPlan('List the service prices',services).intent).toBe('service_catalogue');
    expect(rulesPlan('DROP TABLE appointments',services).intent).toBe('unknown');
  });
  it('requires an explicit named price and rejects model-invented changes',()=>{
    const question='Set Signature haircut price to LKR 3000';
    expect(rulesPlan(question,services)).toEqual({intent:'propose_price',serviceId:'svc_cut',priceMinor:300000});
    expect(validatePlan({intent:'propose_price',serviceId:'svc_cut',price:3000},question,services)?.priceMinor).toBe(300000);
    expect(validatePlan({intent:'propose_price',serviceId:'svc_cut',price:5000},question,services)).toBeNull();
    expect(validatePlan({intent:'propose_price',serviceId:'svc_cut',price:3000},'List service prices',services)).toBeNull();
    expect(validatePlan({intent:'propose_price',serviceId:'other',price:3000},question,services)).toBeNull();
  });
  it('falls back when model output is invalid',async()=>{
    const result=await planOperation('How many pending appointments?',services,{classify:async()=>({intent:'propose_price',serviceId:'svc_cut',price:9000})});
    expect(result.mode).toBe('fallback');
    expect(result.plan.intent).toBe('pending_count');
  });
  it('uses configurable chat completions without accepting model SQL',async()=>{
    const request=vi.fn(async(_url:unknown,init:RequestInit)=>{
      const body=JSON.parse(String(init.body));
      expect(body.messages[1].content).toBe('How many pending appointments?');
      return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({intent:'pending_count',serviceId:null,price:null})}}]}));
    });
    const provider=openAiOperationProvider('https://llm.example/v1/','local-test-key','test-model',request as typeof fetch);
    expect((await planOperation('How many pending appointments?',services,provider)).mode).toBe('llm');
  });
});
