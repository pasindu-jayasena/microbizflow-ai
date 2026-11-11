export interface CrmCustomerProjection {
  businessId: string;
  customerName: string;
  customerContact: string;
  bookingReference: string;
  bookingStatus: string;
}

export interface CrmAdapter {
  upsertCustomer(projection: CrmCustomerProjection, idempotencyKey: string): Promise<void>;
}

// The public demo has no external CRM credentials or network calls.
export const mockCrm: CrmAdapter = {
  async upsertCustomer(): Promise<void> { /* Records success only in D1. */ },
};

export async function processCrmEvent(db: D1Database, businessId: string, eventKey: string, adapter: CrmAdapter = mockCrm): Promise<boolean> {
  const now = Date.now();
  const claimed = await db.prepare(`UPDATE crm_sync_events SET state='processing',attempts=attempts+1,lease_until=?,updated_at=CURRENT_TIMESTAMP
    WHERE business_id=? AND event_key=? AND attempts<3 AND (state IN ('pending','failed') OR (state='processing' AND lease_until<?))`)
    .bind(now + 60_000,businessId,eventKey,now).run();
  if (claimed.meta.changes < 1) return false;
  try {
    const row = await db.prepare(`SELECT c.appointment_id,a.customer_name,a.customer_contact,a.reference,a.status
      FROM crm_sync_events c JOIN appointments a ON a.id=c.appointment_id
      WHERE c.business_id=? AND c.event_key=? AND a.business_id=?`)
      .bind(businessId,eventKey,businessId).first<{ appointment_id: string; customer_name: string; customer_contact: string; reference: string; status: string }>();
    if (!row) throw new Error('Missing CRM source');
    if (row.customer_contact.startsWith('deleted:')) {
      await db.prepare("UPDATE crm_sync_events SET state='skipped',lease_until=0,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE business_id=? AND event_key=?")
        .bind(businessId,eventKey).run();
      return true;
    }
    await adapter.upsertCustomer({ businessId, customerName: row.customer_name, customerContact: row.customer_contact,
      bookingReference: row.reference, bookingStatus: row.status }, eventKey);
    await db.prepare("UPDATE crm_sync_events SET state='mock_synced',lease_until=0,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE business_id=? AND event_key=?")
      .bind(businessId,eventKey).run();
    return true;
  } catch {
    await db.prepare("UPDATE crm_sync_events SET state='failed',lease_until=0,last_error='Mock sync failed',updated_at=CURRENT_TIMESTAMP WHERE business_id=? AND event_key=?")
      .bind(businessId,eventKey).run();
    return false;
  }
}

export async function processPendingCrmEvents(db: D1Database, businessId: string, limit = 10, adapter: CrmAdapter = mockCrm): Promise<{ processed: number; failed: number }> {
  const due = await db.prepare(`SELECT event_key FROM crm_sync_events WHERE business_id=? AND attempts<3
    AND (state IN ('pending','failed') OR (state='processing' AND lease_until<?)) ORDER BY created_at,event_key LIMIT ?`)
    .bind(businessId,Date.now(),limit).all<{ event_key: string }>();
  let processed = 0;
  let failed = 0;
  for (const event of due.results) {
    if (await processCrmEvent(db,businessId,event.event_key,adapter)) processed++;
    else failed++;
  }
  return { processed, failed };
}
