import { describe, expect, it, vi } from 'vitest';
import { hubspotCrm, processCrmEvent, type CrmCustomerProjection } from './crm';

const projection: CrmCustomerProjection = { businessId:'biz_demo',customerName:'Fictional Visitor',
  customerContact:'fictional@example.invalid',bookingReference:'MBF-1234ABCD',bookingStatus:'confirmed' };

function fakeDb() {
  const event = { state:'pending',attempts:0,nextAttemptAt:0,provider:'mock',externalId:null as string|null };
  const db = {
    prepare(sql:string) {
      return { bind(...args:unknown[]) { return {
        async run() {
          if (sql.includes("SET state='processing'")) {
            const now = Number(args[3]);
            if (!['pending','failed'].includes(event.state) || event.attempts>=3 || now<event.nextAttemptAt) return {meta:{changes:0}};
            event.state='processing';event.attempts++;
          } else if (sql.includes("SET state='skipped'")) event.state='skipped';
          else if (sql.includes('SET state=?,provider=?')) {
            event.state=String(args[0]);event.provider=String(args[1]);event.externalId=args[2] as string|null;
          } else if (sql.includes('SET state=?,lease_until=0')) {
            event.state=String(args[0]);event.nextAttemptAt=Number(args[1]);
          }
          return {meta:{changes:1}};
        },
        async first() {
          if (sql.includes('SELECT attempts FROM crm_sync_events')) return {attempts:event.attempts};
          return {appointment_id:'booking-1',attempts:event.attempts,customer_name:projection.customerName,
            customer_contact:projection.customerContact,reference:projection.bookingReference,status:projection.bookingStatus};
        },
      }; } };
    },
  } as unknown as D1Database;
  return {db,event};
}

describe('CRM adapter workflow', () => {
  it('retries with a stable event key after backoff and records a mock sync', async () => {
    const {db,event}=fakeDb();
    const received: string[]=[];
    const adapter={async upsertCustomer(_projection:CrmCustomerProjection,key:string) {
      received.push(key);
      if(received.length===1) throw new Error('Temporary failure');
    }};
    expect(await processCrmEvent(db,'biz_demo','booking-1:created',adapter,1000)).toBe(false);
    expect(event.state).toBe('failed');
    expect(event.nextAttemptAt).toBe(61000);
    expect(await processCrmEvent(db,'biz_demo','booking-1:created',adapter,2000)).toBe(false);
    expect(await processCrmEvent(db,'biz_demo','booking-1:created',adapter,61000)).toBe(true);
    expect(event.state).toBe('mock_synced');
    expect(event.attempts).toBe(2);
    expect(received).toEqual(['booking-1:created','booking-1:created']);
  });
  it('moves an exhausted event to the dead-letter state', async () => {
    const {db,event}=fakeDb();
    const adapter={async upsertCustomer(){throw new Error('Provider unavailable');}};
    expect(await processCrmEvent(db,'biz_demo','booking-1:created',adapter,1000)).toBe(false);
    expect(await processCrmEvent(db,'biz_demo','booking-1:created',adapter,61000)).toBe(false);
    expect(await processCrmEvent(db,'biz_demo','booking-1:created',adapter,181000)).toBe(false);
    expect(event.state).toBe('dead');
    expect(event.attempts).toBe(3);
    expect(await processCrmEvent(db,'biz_demo','booking-1:created',adapter,500000)).toBe(false);
  });
  it('upserts HubSpot contacts by email with a stable trace ID', async () => {
    const request=vi.fn(async (_url:unknown,options:RequestInit) => {
      const payload=JSON.parse(String(options.body));
      expect(payload.inputs[0]).toMatchObject({id:projection.customerContact,idProperty:'email',
        objectWriteTraceId:'booking-1:created',properties:{email:projection.customerContact,firstname:'Fictional',lastname:'Visitor'}});
      return new Response(JSON.stringify({status:'COMPLETE',results:[{id:'hubspot-123'}],numErrors:0}),{status:200});
    });
    const adapter=hubspotCrm('test-service-key-with-at-least-20-chars',request as typeof fetch);
    expect(await adapter.upsertCustomer(projection,'booking-1:created')).toEqual({externalId:'hubspot-123'});
    expect(String(request.mock.calls[0]?.[0])).toBe('https://api.hubapi.com/crm/objects/2026-09/contacts/batch/upsert');
  });
  it('rejects partial HubSpot success for retry', async () => {
    const adapter=hubspotCrm('test-service-key-with-at-least-20-chars',vi.fn(async()=>
      new Response(JSON.stringify({status:'COMPLETE',results:[{id:'hubspot-123'}],numErrors:1}),{status:207})) as typeof fetch);
    await expect(adapter.upsertCustomer(projection,'booking-1:created')).rejects.toThrow('Incomplete');
  });
});
