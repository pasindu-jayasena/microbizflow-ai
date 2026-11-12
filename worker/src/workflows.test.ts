import { describe, expect, it } from 'vitest';
import { deliverApproved, draftForEvent } from './workflows';

describe('notification drafts', () => {
  const base = { reference: 'MBF-TEST123', service_name: 'Signature haircut' };
  it('creates an internal notice for a new request', () => {
    expect(draftForEvent({ ...base, kind: 'booking_requested', subject_status: 'pending' })).toEqual({
      kind: 'owner_notice', body: 'Booking MBF-TEST123 (Signature haircut) is waiting for review.', state: 'mock_delivered',
    });
  });
  it('holds customer-facing text for owner approval', () => {
    for (const status of ['confirmed', 'declined', 'cancelled', 'reminder_due', 'followup_due']) {
      expect(draftForEvent({ ...base, kind: 'status_changed', subject_status: status }).state).toBe('needs_approval');
    }
  });
  it('retries a failed mock delivery and never delivers before approval', async () => {
    const record = { state: 'needs_approval', attempts: 0 };
    const db = {
      prepare(sql: string) {
        return {
          bind() {
            return {
              async run() {
                if (sql.includes("SET state='sending'")) {
                  if (!['approved', 'failed'].includes(record.state) || record.attempts >= 3) return { meta: { changes: 0 } };
                  record.state = 'sending'; record.attempts++;
                } else if (sql.includes("SET state='failed'")) record.state = 'failed';
                else if (sql.includes("SET state='mock_delivered'")) record.state = 'mock_delivered';
                return { meta: { changes: 1 } };
              },
              async first() { return { body: 'fictional draft' }; },
            };
          },
        };
      },
    } as unknown as D1Database;
    let deliveries = 0;
    const adapter = { async deliver() { deliveries++; if (deliveries === 1) throw new Error('temporary failure'); } };
    expect(await deliverApproved(db, 'biz_demo', 1, adapter)).toBe(false);
    expect(deliveries).toBe(0);
    record.state = 'approved';
    expect(await deliverApproved(db, 'biz_demo', 1, adapter)).toBe(false);
    expect(record.state).toBe('failed');
    expect(await deliverApproved(db, 'biz_demo', 1, adapter)).toBe(true);
    expect(record.state).toBe('mock_delivered');
    expect(record.attempts).toBe(2);
    expect(deliveries).toBe(2);
    expect(await deliverApproved(db, 'biz_demo', 1, adapter)).toBe(false);
    expect(deliveries).toBe(2);
  });
});
