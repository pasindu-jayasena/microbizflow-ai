import { describe, expect, it } from 'vitest';
import { availableSlots, overlaps, slotInterval } from './booking';

const hours = { weekday: 1, open_min: 540, close_min: 1080 };
describe('booking rules', () => {
  it('rejects closed and out-of-hours slots', () => {
    expect(slotInterval('2026-11-16', '17:30', 45, 'Asia/Colombo', hours)).toBeNull();
    expect(slotInterval('2026-11-15', '09:00', 45, 'Asia/Colombo', hours)).toBeNull();
    expect(slotInterval('2026-11-16', '09:10', 45, 'Asia/Colombo', hours)).toBeNull();
  });
  it('converts the business local time to UTC', () => {
    expect(slotInterval('2026-11-16', '09:00', 45, 'Asia/Colombo', hours)).toEqual({
      start_at: '2026-11-16T03:30:00.000Z', end_at: '2026-11-16T04:15:00.000Z',
    });
  });
  it('uses both resources and releases a slot only after both are occupied', () => {
    const interval = slotInterval('2026-11-16', '09:00', 45, 'Asia/Colombo', hours)!;
    const one = [{ resource_id: 'a', ...interval }];
    const two = [...one, { resource_id: 'b', ...interval }];
    const now = Date.parse('2026-11-11T00:00:00.000Z');
    expect(availableSlots('2026-11-16', 'Asia/Colombo', 45, hours, ['a', 'b'], one, now)).toContain('09:00');
    expect(availableSlots('2026-11-16', 'Asia/Colombo', 45, hours, ['a', 'b'], two, now)).not.toContain('09:00');
  });
  it('treats adjacent intervals as non-overlapping', () => {
    expect(overlaps({ start_at: 'a', end_at: 'b' }, { start_at: 'b', end_at: 'c' })).toBe(false);
  });
});
