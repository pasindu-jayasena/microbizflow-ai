export const retentionDays = 365;
export const demoBookingHours = 24;

// Public demo reservations expire so one visitor cannot hold shared inventory
// indefinitely. The D1 batch either anonymizes the booking and removes its
// linked private records together, or leaves all of them intact.
export async function resetExpiredDemoBookings(db: D1Database, businessId: string, now = Date.now(), limit = 2): Promise<number> {
  const cutoff = new Date(now - demoBookingHours * 60 * 60_000).toISOString();
  const due = await db.prepare(`SELECT id,lower(trim(customer_contact)) AS contact_key FROM appointments
    WHERE business_id=? AND status IN ('pending','confirmed') AND created_at<datetime(?)
      AND lower(trim(customer_contact)) LIKE '%@example.invalid'
    ORDER BY created_at,id LIMIT ?`).bind(businessId,cutoff,limit).all<{ id: string; contact_key: string }>();
  let reset = 0;
  for (const row of due.results) {
    const result = await db.batch([
      db.prepare(`DELETE FROM enquiry_analyses WHERE business_id=? AND appointment_id=? AND EXISTS (
        SELECT 1 FROM appointments WHERE id=? AND business_id=? AND status IN ('pending','confirmed')
          AND created_at<datetime(?) AND lower(trim(customer_contact)) LIKE '%@example.invalid')`)
        .bind(businessId,row.id,row.id,businessId,cutoff),
      db.prepare(`UPDATE appointments SET status='cancelled',customer_name='Deleted customer',
        customer_contact='demo-expired:' || id,customer_note='',
        idempotency_key=lower(hex(randomblob(16))),updated_at=CURRENT_TIMESTAMP
        WHERE id=? AND business_id=? AND status IN ('pending','confirmed')
          AND created_at<datetime(?) AND lower(trim(customer_contact)) LIKE '%@example.invalid'`)
        .bind(row.id,businessId,cutoff),
      db.prepare(`DELETE FROM customer_records WHERE business_id=? AND contact_key=? AND NOT EXISTS (
        SELECT 1 FROM appointments WHERE business_id=? AND lower(trim(customer_contact))=?)`)
        .bind(businessId,row.contact_key,businessId,row.contact_key),
    ]);
    reset += result[1]!.meta.changes;
  }
  return reset;
}

// D1 batches are transactional. Every write rechecks the guard so an active or
// too-recent booking cannot be partially erased when another request races it.
export async function eraseCustomerDetails(db: D1Database, businessId: string, contactKey: string, cutoff?: string): Promise<number | null> {
  const blocked = `EXISTS (SELECT 1 FROM appointments protected WHERE protected.business_id=?
    AND lower(trim(protected.customer_contact))=? AND
    (protected.status IN ('pending','confirmed')${cutoff ? ' OR protected.end_at >= ?' : ''}))`;
  const guard = [businessId, contactKey, ...(cutoff ? [cutoff] : [])];
  const results = await db.batch([
    db.prepare(`DELETE FROM enquiry_analyses WHERE business_id=? AND appointment_id IN
      (SELECT id FROM appointments WHERE business_id=? AND lower(trim(customer_contact))=?) AND NOT ${blocked}`)
      .bind(businessId,businessId,contactKey,...guard),
    db.prepare(`UPDATE appointments SET customer_name='Deleted customer',customer_contact='deleted:' || id,
      customer_note='',idempotency_key=lower(hex(randomblob(16))),updated_at=CURRENT_TIMESTAMP
      WHERE business_id=? AND lower(trim(customer_contact))=? AND NOT ${blocked}`)
      .bind(businessId,contactKey,...guard),
    db.prepare(`DELETE FROM customer_records WHERE business_id=? AND contact_key=? AND NOT ${blocked}`)
      .bind(businessId,contactKey,...guard),
  ]);
  return results[2]!.meta.changes > 0 ? results[1]!.meta.changes : null;
}

export async function purgeExpiredCustomers(db: D1Database, businessId: string, now = Date.now(), maxCustomers = 10, maxUnbookedEnquiries = 100): Promise<{ cutoff: string; deletedCustomers: number; anonymizedBookings: number; deletedEnquiries: number }> {
  const cutoff = new Date(now - retentionDays * 86_400_000).toISOString();
  const enquiries = await db.prepare(`DELETE FROM enquiry_analyses WHERE id IN (
    SELECT id FROM enquiry_analyses WHERE business_id=? AND appointment_id IS NULL AND created_at<datetime(?)
    ORDER BY created_at,id LIMIT ?)`).bind(businessId,cutoff,maxUnbookedEnquiries).run();
  const due = await db.prepare(`SELECT c.contact_key FROM customer_records c WHERE c.business_id=?
    AND EXISTS (SELECT 1 FROM appointments a WHERE a.business_id=c.business_id AND lower(trim(a.customer_contact))=c.contact_key)
    AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.business_id=c.business_id AND lower(trim(a.customer_contact))=c.contact_key
      AND (a.status IN ('pending','confirmed') OR a.end_at>=?))
    ORDER BY c.updated_at,c.contact_key LIMIT ?`).bind(businessId,cutoff,maxCustomers).all<{ contact_key: string }>();
  let deletedCustomers = 0;
  let anonymizedBookings = 0;
  for (const customer of due.results) {
    const bookings = await eraseCustomerDetails(db,businessId,customer.contact_key,cutoff);
    if (bookings !== null) { deletedCustomers++; anonymizedBookings += bookings; }
  }
  return { cutoff, deletedCustomers, anonymizedBookings, deletedEnquiries: enquiries.meta.changes };
}
