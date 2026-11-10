import { Temporal } from '@js-temporal/polyfill';
import { z } from 'zod';

export const bookingInput = z.object({
  serviceId: z.string().min(1).max(80),
  date: z.iso.date(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  customerName: z.string().trim().min(2).max(100),
  customerContact: z.string().trim().min(5).max(120),
  note: z.string().trim().max(500).default(''),
  idempotencyKey: z.uuid(),
});
export type BookingInput = z.infer<typeof bookingInput>;

export interface Hours { weekday: number; open_min: number; close_min: number }
export interface Interval { start_at: string; end_at: string }

export function localDay(date: string, timezone: string): { weekday: number; start: string; end: string } {
  const day = Temporal.PlainDate.from(date);
  const start = day.toZonedDateTime({ timeZone: timezone, plainTime: '00:00' });
  const end = day.add({ days: 1 }).toZonedDateTime({ timeZone: timezone, plainTime: '00:00' });
  return { weekday: day.dayOfWeek % 7, start: new Date(start.epochMilliseconds).toISOString(), end: new Date(end.epochMilliseconds).toISOString() };
}

export function slotInterval(date: string, time: string, durationMin: number, timezone: string, hours: Hours | null): Interval | null {
  if (!hours || !Number.isInteger(durationMin) || durationMin <= 0) return null;
  const [hour, minute] = time.split(':').map(Number);
  if (hour === undefined || minute === undefined || hour > 23 || minute > 59) return null;
  const startMin = hour * 60 + minute;
  if (startMin % 15 !== 0 || startMin < hours.open_min || startMin + durationMin > hours.close_min) return null;
  const day = Temporal.PlainDate.from(date);
  if (day.dayOfWeek % 7 !== hours.weekday) return null;
  try {
    const start = Temporal.ZonedDateTime.from({ timeZone: timezone, year: day.year, month: day.month, day: day.day, hour, minute }, { disambiguation: 'reject' });
    const end = start.add({ minutes: durationMin });
    return { start_at: new Date(start.epochMilliseconds).toISOString(), end_at: new Date(end.epochMilliseconds).toISOString() };
  } catch {
    return null;
  }
}

export function withinBookingWindow(date: string, timezone: string, now = Date.now()): boolean {
  const today = Temporal.Instant.fromEpochMilliseconds(now).toZonedDateTimeISO(timezone).toPlainDate();
  const chosen = Temporal.PlainDate.from(date);
  return Temporal.PlainDate.compare(chosen, today) >= 0 && Temporal.PlainDate.compare(chosen, today.add({ days: 60 })) <= 0;
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start_at < b.end_at && b.start_at < a.end_at;
}

export function availableSlots(date: string, timezone: string, durationMin: number, hours: Hours | null, resources: string[], appointments: Array<Interval & { resource_id: string }>, now = Date.now()): string[] {
  if (!hours || !withinBookingWindow(date, timezone, now) || resources.length === 0) return [];
  const slots: string[] = [];
  for (let minute = hours.open_min; minute + durationMin <= hours.close_min; minute += 15) {
    const time = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
    const interval = slotInterval(date, time, durationMin, timezone, hours);
    if (!interval || Date.parse(interval.start_at) <= now + 30 * 60_000) continue;
    if (resources.some(id => !appointments.some(a => a.resource_id === id && overlaps(a, interval)))) slots.push(time);
  }
  return slots;
}
