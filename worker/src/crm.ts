import { z } from 'zod';

export interface CrmCustomerProjection {
  businessId: string;
  customerName: string;
  customerContact: string;
  bookingReference: string;
  bookingStatus: string;
}

export interface CrmAdapter {
  kind?: 'mock' | 'hubspot';
  upsertCustomer(projection: CrmCustomerProjection, idempotencyKey: string): Promise<{ externalId?: string } | void>;
}

// The public demo has no external CRM credentials or network calls.
export const mockCrm: CrmAdapter = {
  kind: 'mock',
  async upsertCustomer(): Promise<void> { /* Records success only in D1. */ },
};

const hubspotResponse = z.object({ status:z.literal('COMPLETE'),results:z.array(z.object({id:z.string().min(1)})).min(1),numErrors:z.number().optional() });

export function hubspotCrm(serviceKey: string, request: typeof fetch = fetch): CrmAdapter {
  if (serviceKey.length < 20) throw new Error('HubSpot service key is not configured');
  return {
    kind:'hubspot',
    async upsertCustomer(projection,idempotencyKey) {
      const email = projection.customerContact.trim().toLowerCase();
      if (!z.email().safeParse(email).success) throw new Error('HubSpot sync requires an email');
      const parts = projection.customerName.trim().split(/\s+/u);
      const firstname = parts.shift() ?? '';
      const lastname = parts.join(' ');
      const response = await request('https://api.hubapi.com/crm/objects/2026-09/contacts/batch/upsert',{
        method:'POST',signal:AbortSignal.timeout(10_000),
        headers:{Authorization:`Bearer ${serviceKey}`,'Content-Type':'application/json'},
        body:JSON.stringify({inputs:[{id:email,idProperty:'email',objectWriteTraceId:idempotencyKey,
          properties:{email,firstname,lastname}}]}),
      });
      if (!response.ok) throw new Error(`HubSpot HTTP ${response.status}`);
      const parsed = hubspotResponse.safeParse(await response.json());
      if (!parsed.success || (parsed.data.numErrors ?? 0)>0) throw new Error('Incomplete HubSpot upsert');
      return {externalId:parsed.data.results[0]!.id};
    },
  };
}

export async function processCrmEvent(db: D1Database, businessId: string, eventKey: string, adapter: CrmAdapter = mockCrm, now = Date.now()): Promise<boolean> {
  const began = Date.now();
  const claimed = await db.prepare(`UPDATE crm_sync_events SET state='processing',attempts=attempts+1,lease_until=?,updated_at=CURRENT_TIMESTAMP
    WHERE business_id=? AND event_key=? AND attempts<3 AND
      ((state IN ('pending','failed') AND next_attempt_at<=?) OR (state='processing' AND lease_until<?))`)
    .bind(now + 60_000,businessId,eventKey,now,now).run();
  if (claimed.meta.changes < 1) return false;
  try {
    const row = await db.prepare(`SELECT c.appointment_id,c.attempts,a.customer_name,a.customer_contact,a.reference,a.status
      FROM crm_sync_events c JOIN appointments a ON a.id=c.appointment_id
      WHERE c.business_id=? AND c.event_key=? AND a.business_id=?`)
      .bind(businessId,eventKey,businessId).first<{ appointment_id: string; attempts: number; customer_name: string; customer_contact: string; reference: string; status: string }>();
    if (!row) throw new Error('Missing CRM source');
    if (row.customer_contact.startsWith('deleted:')) {
      await db.prepare("UPDATE crm_sync_events SET state='skipped',lease_until=0,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE business_id=? AND event_key=?")
        .bind(businessId,eventKey).run();
      return true;
    }
    if (adapter.kind === 'hubspot' && !z.email().safeParse(row.customer_contact).success) {
      await db.prepare("UPDATE crm_sync_events SET state='skipped',lease_until=0,last_error='Email required',updated_at=CURRENT_TIMESTAMP WHERE business_id=? AND event_key=?")
        .bind(businessId,eventKey).run();
      return true;
    }
    const delivered = await adapter.upsertCustomer({ businessId, customerName: row.customer_name, customerContact: row.customer_contact,
      bookingReference: row.reference, bookingStatus: row.status }, eventKey);
    await db.prepare(`UPDATE crm_sync_events SET state=?,provider=?,external_id=?,latency_ms=?,synced_at=CURRENT_TIMESTAMP,
      lease_until=0,next_attempt_at=0,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE business_id=? AND event_key=?`)
      .bind(adapter.kind==='hubspot'?'external_synced':'mock_synced',adapter.kind??'mock',delivered?.externalId??null,
        Date.now()-began,businessId,eventKey).run();
    return true;
  } catch {
    const current = await db.prepare('SELECT attempts FROM crm_sync_events WHERE business_id=? AND event_key=?')
      .bind(businessId,eventKey).first<{attempts:number}>();
    const attempts = current?.attempts ?? 3;
    const delay = Math.min(60_000 * 2 ** Math.max(0,attempts-1),3_600_000);
    await db.prepare("UPDATE crm_sync_events SET state=?,lease_until=0,next_attempt_at=?,last_error='CRM sync failed',latency_ms=?,updated_at=CURRENT_TIMESTAMP WHERE business_id=? AND event_key=?")
      .bind(attempts>=3?'dead':'failed',now+delay,Date.now()-began,businessId,eventKey).run();
    return false;
  }
}

export async function processPendingCrmEvents(db: D1Database, businessId: string, limit = 10, adapter: CrmAdapter = mockCrm): Promise<{ processed: number; failed: number }> {
  const now = Date.now();
  const due = await db.prepare(`SELECT event_key FROM crm_sync_events WHERE business_id=? AND attempts<3
    AND ((state IN ('pending','failed') AND next_attempt_at<=?) OR (state='processing' AND lease_until<?))
    ORDER BY created_at,event_key LIMIT ?`)
    .bind(businessId,now,now,limit).all<{ event_key: string }>();
  let processed = 0;
  let failed = 0;
  for (const event of due.results) {
    if (await processCrmEvent(db,businessId,event.event_key,adapter)) processed++;
    else failed++;
  }
  return { processed, failed };
}
