export interface MockDeliveryAdapter {
  deliver(body: string): Promise<void>;
}

export const mockDelivery: MockDeliveryAdapter = {
  async deliver(): Promise<void> { /* Records success locally. No external message is sent. */ },
};

interface EventRow {
  event_key: string;
  business_id: string;
  appointment_id: string;
  kind: 'booking_requested' | 'status_changed';
  subject_status: string;
  reference: string;
  service_name: string;
  appointment_status: string;
  start_at: string;
}

export function draftForEvent(event: Pick<EventRow, 'kind' | 'subject_status' | 'reference' | 'service_name'>): { kind: 'owner_notice' | 'customer_draft'; body: string; state: 'mock_delivered' | 'needs_approval' } {
  const reference = event.reference;
  if (event.subject_status === 'reminder_due') return { kind: 'customer_draft', body: `Reminder: your booking ${reference} is coming up. Please contact the business if your plans changed.`, state: 'needs_approval' };
  if (event.kind === 'booking_requested') return { kind: 'owner_notice', body: `Booking ${reference} (${event.service_name}) is waiting for review.`, state: 'mock_delivered' };
  if (event.subject_status === 'confirmed') return { kind: 'customer_draft', body: `Your booking ${reference} has been confirmed.`, state: 'needs_approval' };
  if (event.subject_status === 'declined') return { kind: 'customer_draft', body: `Your booking request ${reference} was declined.`, state: 'needs_approval' };
  if (event.subject_status === 'cancelled') return { kind: 'customer_draft', body: `Your booking ${reference} has been cancelled.`, state: 'needs_approval' };
  return { kind: 'owner_notice', body: `Booking ${reference} is now ${event.subject_status}.`, state: 'mock_delivered' };
}

export async function processEvent(db: D1Database, businessId: string, eventKey: string): Promise<boolean> {
  const now = Date.now();
  const claimed = await db.prepare(`UPDATE workflow_events SET state='processing', attempts=attempts+1, lease_until=?, updated_at=CURRENT_TIMESTAMP
    WHERE business_id=? AND event_key=? AND attempts<3 AND (state IN ('pending','failed') OR (state='processing' AND lease_until<?))`).bind(now + 60_000, businessId, eventKey, now).run();
  if (claimed.meta.changes < 1) return false;
  try {
    const event = await db.prepare(`SELECT e.event_key,e.business_id,e.appointment_id,e.kind,e.subject_status,a.reference,a.status AS appointment_status,a.start_at,s.name AS service_name
      FROM workflow_events e JOIN appointments a ON a.id=e.appointment_id JOIN services s ON s.id=a.service_id
      WHERE e.business_id=? AND e.event_key=?`).bind(businessId, eventKey).first<EventRow>();
    if (!event) throw new Error('Missing workflow event');
    if (event.subject_status === 'reminder_due' && (event.appointment_status !== 'confirmed' || event.start_at <= new Date(now).toISOString())) {
      await db.prepare("UPDATE workflow_events SET state='done',lease_until=0,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE business_id=? AND event_key=?")
        .bind(businessId,eventKey).run();
      return true;
    }
    const draft = draftForEvent(event);
    await db.prepare(`INSERT OR IGNORE INTO notifications (business_id,appointment_id,event_key,kind,body,state,delivered_at)
      VALUES (?,?,?,?,?,?,CASE WHEN ?='mock_delivered' THEN CURRENT_TIMESTAMP ELSE NULL END)`).bind(businessId, event.appointment_id, event.event_key, draft.kind, draft.body, draft.state, draft.state).run();
    await db.prepare("UPDATE workflow_events SET state='done', lease_until=0, last_error=NULL, updated_at=CURRENT_TIMESTAMP WHERE business_id=? AND event_key=?").bind(businessId, eventKey).run();
    return true;
  } catch {
    await db.prepare("UPDATE workflow_events SET state='failed', lease_until=0, last_error='Processing failed', updated_at=CURRENT_TIMESTAMP WHERE business_id=? AND event_key=?").bind(businessId, eventKey).run();
    return false;
  }
}

export async function queueUpcomingReminders(db: D1Database, businessId: string, now = Date.now()): Promise<number> {
  const from = new Date(now + 60 * 60_000).toISOString();
  const until = new Date(now + 24 * 60 * 60_000).toISOString();
  const result = await db.prepare(`INSERT OR IGNORE INTO workflow_events(business_id,appointment_id,event_key,kind,subject_status)
    SELECT a.business_id,a.id,a.id || ':reminder','status_changed','reminder_due' FROM appointments a
    WHERE a.business_id=? AND a.status='confirmed' AND a.start_at>? AND a.start_at<=?
      AND NOT EXISTS (SELECT 1 FROM workflow_events e WHERE e.event_key=a.id || ':reminder')
    ORDER BY a.start_at LIMIT 10`)
    .bind(businessId,from,until).run();
  return result.meta.changes;
}

export async function processPendingEvents(db: D1Database, businessId: string, limit = 10): Promise<{ processed: number; failed: number }> {
  const due = await db.prepare(`SELECT event_key FROM workflow_events WHERE business_id=? AND attempts<3
    AND (state IN ('pending','failed') OR (state='processing' AND lease_until<?)) ORDER BY id LIMIT ?`).bind(businessId, Date.now(), limit).all<{ event_key: string }>();
  let processed = 0;
  let failed = 0;
  for (const event of due.results) {
    if (await processEvent(db, businessId, event.event_key)) processed++;
    else failed++;
  }
  return { processed, failed };
}

export async function approveNotification(db: D1Database, businessId: string, id: number): Promise<boolean> {
  const result = await db.prepare(`UPDATE notifications SET state='approved', approved_at=CURRENT_TIMESTAMP
    WHERE id=? AND business_id=? AND state='needs_approval' AND (event_key NOT LIKE '%:reminder' OR EXISTS
      (SELECT 1 FROM appointments a WHERE a.id=notifications.appointment_id AND a.business_id=? AND a.status='confirmed' AND a.start_at>?))`)
    .bind(id,businessId,businessId,new Date().toISOString()).run();
  return result.meta.changes >= 1;
}

export async function deliverApproved(db: D1Database, businessId: string, id: number, adapter: MockDeliveryAdapter = mockDelivery): Promise<boolean> {
  const now = Date.now();
  const claim = await db.prepare(`UPDATE notifications SET state='sending', attempts=attempts+1, lease_until=?
    WHERE id=? AND business_id=? AND attempts<3 AND (state IN ('approved','failed') OR (state='sending' AND lease_until<?))
      AND (event_key NOT LIKE '%:reminder' OR EXISTS
        (SELECT 1 FROM appointments a WHERE a.id=notifications.appointment_id AND a.business_id=? AND a.status='confirmed' AND a.start_at>?))`)
    .bind(now + 60_000,id,businessId,now,businessId,new Date(now).toISOString()).run();
  if (claim.meta.changes < 1) return false;
  try {
    const row = await db.prepare('SELECT body FROM notifications WHERE id=? AND business_id=?').bind(id, businessId).first<{ body: string }>();
    if (!row) throw new Error('Missing notification');
    await adapter.deliver(row.body);
    await db.prepare("UPDATE notifications SET state='mock_delivered', lease_until=0, delivered_at=CURRENT_TIMESTAMP WHERE id=? AND business_id=?").bind(id, businessId).run();
    return true;
  } catch {
    await db.prepare("UPDATE notifications SET state='failed', lease_until=0 WHERE id=? AND business_id=?").bind(id, businessId).run();
    return false;
  }
}
