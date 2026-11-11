import { describe, expect, it } from 'vitest';
import { processCrmEvent, type CrmCustomerProjection } from './crm';

describe('CRM adapter workflow', () => {
  it('retries an idempotent mock sync after an adapter failure', async () => {
    const event = { state: 'pending', attempts: 0 };
    const source = { appointment_id: 'booking-1', customer_name: 'Fictional Visitor',
      customer_contact: 'fictional@example.invalid', reference: 'MBF-1234ABCD', status: 'confirmed' };
    const db = {
      prepare(sql: string) {
        return { bind() { return {
          async run() {
            if (sql.includes("SET state='processing'")) {
              if (!['pending', 'failed'].includes(event.state) || event.attempts >= 3) return { meta: { changes: 0 } };
              event.state = 'processing'; event.attempts++;
            } else if (sql.includes("SET state='mock_synced'")) event.state = 'mock_synced';
            else if (sql.includes("SET state='failed'")) event.state = 'failed';
            return { meta: { changes: 1 } };
          },
          async first() { return source; },
        }; } };
      },
    } as unknown as D1Database;
    const received: { projection: CrmCustomerProjection; key: string }[] = [];
    const adapter = { async upsertCustomer(projection: CrmCustomerProjection, key: string) {
      received.push({ projection, key });
      if (received.length === 1) throw new Error('Synthetic temporary failure');
    } };
    expect(await processCrmEvent(db,'biz_demo','booking-1:created',adapter)).toBe(false);
    expect(event.state).toBe('failed');
    expect(await processCrmEvent(db,'biz_demo','booking-1:created',adapter)).toBe(true);
    expect(event.state).toBe('mock_synced');
    expect(event.attempts).toBe(2);
    expect(received).toEqual([
      { projection: { businessId: 'biz_demo', customerName: source.customer_name, customerContact: source.customer_contact,
        bookingReference: source.reference, bookingStatus: source.status }, key: 'booking-1:created' },
      { projection: { businessId: 'biz_demo', customerName: source.customer_name, customerContact: source.customer_contact,
        bookingReference: source.reference, bookingStatus: source.status }, key: 'booking-1:created' },
    ]);
    expect(await processCrmEvent(db,'biz_demo','booking-1:created',adapter)).toBe(false);
    expect(received).toHaveLength(2);
  });
});
