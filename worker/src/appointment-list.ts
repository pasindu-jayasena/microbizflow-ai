import { z } from 'zod';

export const appointmentFilter = z.object({
  q: z.string().trim().max(100),
  status: z.union([z.literal(''), z.enum(['pending','confirmed','declined','cancelled','completed'])]),
});
export type AppointmentFilter = z.infer<typeof appointmentFilter>;

export function parseAppointmentFilter(url: URL) {
  return appointmentFilter.safeParse({ q: url.searchParams.get('q') ?? '', status: url.searchParams.get('status') ?? '' });
}

export async function listAppointments(db: D1Database, businessId: string, filter: AppointmentFilter, limit: number) {
  const rows = await db.prepare(`SELECT a.id,a.reference,a.start_at,a.end_at,a.status,a.customer_name,a.customer_contact,a.customer_note,
    s.name AS service_name,r.name AS resource_name
    FROM appointments a JOIN services s ON s.id=a.service_id JOIN resources r ON r.id=a.resource_id
    WHERE a.business_id=? AND (?='' OR a.status=?) AND (
      ?='' OR instr(lower(a.customer_name),lower(?))>0 OR instr(lower(a.customer_contact),lower(?))>0 OR instr(lower(a.reference),lower(?))>0
    ) ORDER BY a.start_at DESC LIMIT ?`).bind(businessId,filter.status,filter.status,filter.q,filter.q,filter.q,filter.q,limit).all();
  return rows.results;
}

export function csvCell(value: unknown): string {
  const raw = String(value ?? '');
  const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function appointmentsCsv(rows: Record<string, unknown>[]): string {
  const columns = ['reference','start_at','end_at','status','customer_name','customer_contact','customer_note','service_name','resource_name'];
  return [columns.join(','), ...rows.map(row => columns.map(column => csvCell(row[column])).join(','))].join('\r\n') + '\r\n';
}
