import { Temporal } from '@js-temporal/polyfill';
import { z } from 'zod';

export const intentSchema = z.object({
  serviceId: z.string().max(80).nullable(),
  date: z.iso.date().nullable(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  language: z.enum(['en', 'si', 'unknown']),
});
export type Intent = z.infer<typeof intentSchema>;
export type IntentResult = Intent & { missing: Array<'service' | 'date' | 'time'>; clarification: string | null };
export interface OfferedService { id: string; name: string }

export function finishIntent(intent: Intent): IntentResult {
  const missing: IntentResult['missing'] = [];
  if (!intent.serviceId) missing.push('service');
  if (!intent.date) missing.push('date');
  if (!intent.time) missing.push('time');
  const clarification = missing.length ? `Please specify ${missing.join(', ')}.` : null;
  return { ...intent, missing, clarification };
}

export function validIntent(value: unknown, services: OfferedService[], timezone: string, today?: string): IntentResult | null {
  const parsed = intentSchema.safeParse(value);
  if (!parsed.success) return null;
  const intent = parsed.data;
  if (intent.serviceId && !services.some(service => service.id === intent.serviceId)) return null;
  if (intent.date) {
    try {
      const current = today ? Temporal.PlainDate.from(today) : Temporal.Now.zonedDateTimeISO(timezone).toPlainDate();
      const chosen = Temporal.PlainDate.from(intent.date);
      if (Temporal.PlainDate.compare(chosen, current) < 0 || Temporal.PlainDate.compare(chosen, current.add({ days: 60 })) > 0) return null;
    } catch { return null; }
  }
  return finishIntent(intent);
}

export function demoIntent(text: string, services: OfferedService[], timezone: string, today?: string): IntentResult {
  const language: Intent['language'] = /[\u0D80-\u0DFF]/u.test(text) ? 'si' : /[a-z]/i.test(text) ? 'en' : 'unknown';
  const lower = text.toLowerCase();
  const wantsCut = /haircut|hair cut|\bcut\b|කොණ්ඩ|කොන්ඩ|කෙස්/u.test(lower);
  const wantsBeard = /beard|රැවුල/u.test(lower);
  let serviceId: string | null = null;
  if (wantsCut && wantsBeard) serviceId = services.find(service => /cut\s*\+\s*beard|haircut.*beard/i.test(service.name))?.id ?? null;
  if (!serviceId && wantsBeard) serviceId = services.find(service => /beard/i.test(service.name))?.id ?? null;
  if (!serviceId && wantsCut) serviceId = services.find(service => /haircut|\bcut\b/i.test(service.name))?.id ?? null;
  if (!serviceId) serviceId = services.find(service => lower.includes(service.name.toLowerCase()))?.id ?? null;

  const current = today ? Temporal.PlainDate.from(today) : Temporal.Now.zonedDateTimeISO(timezone).toPlainDate();
  let date: string | null = null;
  const iso = text.match(/\b\d{4}-\d{2}-\d{2}\b/u)?.[0];
  if (iso) {
    try { date = Temporal.PlainDate.from(iso).toString(); } catch { date = null; }
  } else if (/\btomorrow\b|හෙට/iu.test(text)) date = current.add({ days: 1 }).toString();
  else if (/\btoday\b|අද/iu.test(text)) date = current.toString();
  if (date) {
    const chosen = Temporal.PlainDate.from(date);
    if (Temporal.PlainDate.compare(chosen, current) < 0 || Temporal.PlainDate.compare(chosen, current.add({ days: 60 })) > 0) date = null;
  }

  let time: string | null = null;
  const ampm = text.match(/\b(\d{1,2})(?::([0-5]\d))?\s*(am|pm)\b/iu);
  const sinhalaTime = text.match(/(?:පස්වරු|පෙරවරු)\s*(\d{1,2})(?::([0-5]\d))?/u) ?? text.match(/(\d{1,2})(?::([0-5]\d))?\s*(පස්වරු|පෙරවරු)/u);
  if (ampm) {
    const hour = Number(ampm[1]);
    if (hour >= 1 && hour <= 12) time = `${String(hour % 12 + (ampm[3]?.toLowerCase() === 'pm' ? 12 : 0)).padStart(2, '0')}:${ampm[2] ?? '00'}`;
  } else if (sinhalaTime) {
    const prefix = sinhalaTime[0].includes('පස්වරු') ? 'pm' : 'am';
    const hour = Number(sinhalaTime[1]);
    if (hour >= 1 && hour <= 12) time = `${String(hour % 12 + (prefix === 'pm' ? 12 : 0)).padStart(2, '0')}:${sinhalaTime[2] ?? '00'}`;
  } else {
    const twentyFour = text.match(/\b([01]\d|2[0-3]):([0-5]\d)\b/u);
    if (twentyFour) time = `${twentyFour[1]}:${twentyFour[2]}`;
  }
  return finishIntent({ serviceId, date, time, language });
}

export function redactContact(text: string): string {
  return text.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/gu, '[email]').replace(/\+?\d[\d\s().-]{7,}\d/gu, '[phone]');
}
