import { bookingInput, availableSlots, localDay, slotInterval, withinBookingWindow } from '../../shared/booking';
import { z } from 'zod';
import { allowPublicBooking, login, logout, ownerBusiness } from './auth';
import { canTransition, type AppointmentStatus } from '../../shared/appointments';
import { Temporal } from '@js-temporal/polyfill';
import { analyzeEnquiry, cloudflareProvider, type AiBinding } from './ai';
import { approveNotification, deliverApproved, processEvent, processPendingEvents } from './workflows';
import { hoursConfig, serviceConfig } from '../../shared/config';

interface Env { DB: D1Database; DEMO_BUSINESS_SLUG: string; ALLOWED_ORIGIN: string; OWNER_USERNAME?: string; OWNER_PASSWORD_HASH?: string; AI?: AiBinding; AI_MODEL?: string }
interface Business { id: string; slug: string; name: string; description: string; timezone: string; currency: string; address: string; phone: string }
interface Service { id: string; name: string; description: string; duration_min: number; price_minor: number }
interface Appointment { id: string; reference: string; service_id: string; start_at: string; end_at: string; status: string; customer_contact: string; idempotency_key: string }

const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const json = (value: unknown, status = 200, extra: HeadersInit = {}) => new Response(JSON.stringify(value), { status, headers: { ...headers, ...extra } });
const bad = (error: string, status = 400) => json({ error }, status);

async function readJson(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 8192) { await reader.cancel(); throw new Error('payload-too-large'); }
    text += decoder.decode(value, { stream: true });
  }
  try { return JSON.parse(text + decoder.decode()); } catch { return null; }
}

async function business(db: D1Database, slug: string): Promise<Business | null> {
  return db.prepare('SELECT id,slug,name,description,timezone,currency,address,phone FROM businesses WHERE slug = ?').bind(slug).first<Business>();
}

async function service(db: D1Database, businessId: string, serviceId: string): Promise<Service | null> {
  return db.prepare('SELECT id,name,description,duration_min,price_minor FROM services WHERE business_id = ? AND id = ? AND active = 1').bind(businessId, serviceId).first<Service>();
}

async function dayData(db: D1Database, b: Business, date: string) {
  const day = localDay(date, b.timezone);
  const [hours, resources, appointments] = await Promise.all([
    db.prepare('SELECT weekday,open_min,close_min FROM working_hours WHERE business_id = ? AND weekday = ?').bind(b.id, day.weekday).first<{ weekday: number; open_min: number; close_min: number }>(),
    db.prepare('SELECT id FROM resources WHERE business_id = ? AND active = 1 ORDER BY id').bind(b.id).all<{ id: string }>(),
    db.prepare("SELECT resource_id,start_at,end_at FROM appointments WHERE business_id = ? AND status IN ('pending','confirmed') AND start_at < ? AND end_at > ?").bind(b.id, day.end, day.start).all<{ resource_id: string; start_at: string; end_at: string }>(),
  ]);
  return { hours, resourceIds: resources.results.map(r => r.id), appointments: appointments.results };
}

async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/api/health' && request.method === 'GET') return json({ ok: true });
  const b = await business(env.DB, env.DEMO_BUSINESS_SLUG);
  if (!b) return bad('Business is not configured', 503);

  if (url.pathname === '/api/owner/login' && request.method === 'POST') {
    const data = z.object({ username: z.string().min(1).max(100), password: z.string().min(1).max(200) }).safeParse(await readJson(request));
    if (!data.success) return bad('Invalid login details');
    return login(request, env, b.id, data.data.username, data.data.password);
  }
  if (url.pathname.startsWith('/api/owner/')) {
    const ownedBusinessId = await ownerBusiness(request, env);
    if (url.pathname === '/api/owner/session' && request.method === 'GET') return json({ authenticated: ownedBusinessId === b.id });
    if (url.pathname === '/api/owner/logout' && request.method === 'POST') return logout(request, env);
    if (ownedBusinessId !== b.id) return bad('Sign in required', 401);
    if (url.pathname === '/api/owner/config' && request.method === 'GET') {
      const [services, hours] = await Promise.all([
        env.DB.prepare('SELECT id,name,description,duration_min,price_minor,active FROM services WHERE business_id=? ORDER BY sort_order,name').bind(b.id).all(),
        env.DB.prepare('SELECT weekday,open_min,close_min FROM working_hours WHERE business_id=? ORDER BY weekday').bind(b.id).all(),
      ]);
      return json({ services: services.results, hours: hours.results });
    }
    if (url.pathname === '/api/owner/customers' && request.method === 'GET') {
      const query = (url.searchParams.get('q') ?? '').trim();
      if (query.length > 100) return bad('Search is too long');
      const rows = await env.DB.prepare(`SELECT c.contact_key,c.display_name,c.contact,c.notes,COUNT(a.id) AS booking_count,MAX(a.start_at) AS last_start_at
        FROM customer_records c LEFT JOIN appointments a ON a.business_id=c.business_id AND lower(trim(a.customer_contact))=c.contact_key
        WHERE c.business_id=? AND (instr(lower(c.display_name),lower(?)) > 0 OR instr(lower(c.contact),lower(?)) > 0)
        GROUP BY c.business_id,c.contact_key ORDER BY c.updated_at DESC,c.contact_key LIMIT 50`).bind(b.id,query,query).all();
      return json({ customers: rows.results });
    }
    const customerMatch = url.pathname.match(/^\/api\/owner\/customers\/([^/]+)$/);
    if (customerMatch) {
      let contactKey: string;
      try { contactKey = decodeURIComponent(customerMatch[1]!).toLowerCase().trim(); } catch { return bad('Invalid customer'); }
      if (!contactKey || contactKey.length > 120) return bad('Invalid customer');
      if (request.method === 'GET') {
        const customer = await env.DB.prepare('SELECT contact_key,display_name,contact,notes FROM customer_records WHERE business_id=? AND contact_key=?').bind(b.id,contactKey).first();
        if (!customer) return bad('Customer not found', 404);
        const appointments = await env.DB.prepare(`SELECT a.reference,a.start_at,a.status,s.name AS service_name FROM appointments a JOIN services s ON s.id=a.service_id
          WHERE a.business_id=? AND lower(trim(a.customer_contact))=? ORDER BY a.start_at DESC LIMIT 100`).bind(b.id,contactKey).all();
        return json({ customer, appointments: appointments.results });
      }
      if (request.method === 'PATCH') {
        const parsed = z.object({ notes: z.string().trim().max(1000) }).safeParse(await readJson(request));
        if (!parsed.success) return bad('Invalid customer notes');
        const result = await env.DB.prepare('UPDATE customer_records SET notes=?,updated_at=CURRENT_TIMESTAMP WHERE business_id=? AND contact_key=?').bind(parsed.data.notes,b.id,contactKey).run();
        if (result.meta.changes < 1) return bad('Customer not found', 404);
        return json({ contactKey });
      }
    }
    if (url.pathname === '/api/owner/services' && request.method === 'POST') {
      const parsed = serviceConfig.safeParse(await readJson(request));
      if (!parsed.success) return bad('Invalid service details');
      const value = parsed.data;
      const id = crypto.randomUUID();
      try {
        await env.DB.prepare('INSERT INTO services(id,business_id,name,description,duration_min,price_minor,active) VALUES(?,?,?,?,?,?,?)')
          .bind(id,b.id,value.name,value.description,value.durationMin,value.priceMinor,Number(value.active)).run();
      } catch { return bad('A service with that name already exists', 409); }
      return json({ id }, 201);
    }
    const serviceMatch = url.pathname.match(/^\/api\/owner\/services\/([a-zA-Z0-9_-]{1,64})$/);
    if (serviceMatch && request.method === 'PATCH') {
      const parsed = serviceConfig.safeParse(await readJson(request));
      if (!parsed.success) return bad('Invalid service details');
      const value = parsed.data;
      try {
        const result = await env.DB.prepare('UPDATE services SET name=?,description=?,duration_min=?,price_minor=?,active=? WHERE id=? AND business_id=?')
          .bind(value.name,value.description,value.durationMin,value.priceMinor,Number(value.active),serviceMatch[1],b.id).run();
        if (result.meta.changes < 1) return bad('Service not found', 404);
      } catch { return bad('A service with that name already exists', 409); }
      return json({ id: serviceMatch[1] });
    }
    const hoursMatch = url.pathname.match(/^\/api\/owner\/hours\/([0-6])$/);
    if (hoursMatch && request.method === 'PUT') {
      const parsed = hoursConfig.safeParse(await readJson(request));
      if (!parsed.success) return bad('Invalid working hours');
      const weekday = Number(hoursMatch[1]);
      if (parsed.data.closed) await env.DB.prepare('DELETE FROM working_hours WHERE business_id=? AND weekday=?').bind(b.id,weekday).run();
      else await env.DB.prepare('INSERT INTO working_hours(business_id,weekday,open_min,close_min) VALUES(?,?,?,?) ON CONFLICT(business_id,weekday) DO UPDATE SET open_min=excluded.open_min,close_min=excluded.close_min')
        .bind(b.id,weekday,parsed.data.openMin,parsed.data.closeMin).run();
      return json({ weekday });
    }
    if (url.pathname === '/api/owner/appointments' && request.method === 'GET') {
      const rows = await env.DB.prepare(`SELECT a.id,a.reference,a.start_at,a.end_at,a.status,a.customer_name,a.customer_contact,a.customer_note,s.name AS service_name,r.name AS resource_name
        FROM appointments a JOIN services s ON s.id = a.service_id JOIN resources r ON r.id = a.resource_id
        WHERE a.business_id = ? ORDER BY a.start_at DESC LIMIT 100`).bind(b.id).all();
      return json({ appointments: rows.results });
    }
    if (url.pathname === '/api/owner/workflows' && request.method === 'GET') {
      const rows = await env.DB.prepare(`SELECT e.event_key,e.kind,e.subject_status,e.state,e.attempts,e.last_error,e.created_at,a.reference
        FROM workflow_events e JOIN appointments a ON a.id=e.appointment_id
        WHERE e.business_id=? ORDER BY e.id DESC LIMIT 50`).bind(b.id).all();
      return json({ workflows: rows.results });
    }
    if (url.pathname === '/api/owner/workflows/run' && request.method === 'POST') {
      return json(await processPendingEvents(env.DB, b.id));
    }
    if (url.pathname === '/api/owner/notifications' && request.method === 'GET') {
      const rows = await env.DB.prepare(`SELECT n.id,n.kind,n.body,n.state,n.attempts,n.created_at,n.approved_at,n.delivered_at,a.reference
        FROM notifications n JOIN appointments a ON a.id=n.appointment_id
        WHERE n.business_id=? ORDER BY n.id DESC LIMIT 50`).bind(b.id).all();
      return json({ notifications: rows.results });
    }
    const notificationAction = url.pathname.match(/^\/api\/owner\/notifications\/(\d+)\/(approve|retry)$/);
    if (notificationAction && request.method === 'POST') {
      const id = Number(notificationAction[1]);
      if (!Number.isSafeInteger(id) || id < 1) return bad('Invalid notification');
      if (notificationAction[2] === 'approve' && !await approveNotification(env.DB, b.id, id)) return bad('Notification is not awaiting approval', 409);
      const delivered = await deliverApproved(env.DB, b.id, id);
      return json({ id, mockDelivered: delivered });
    }
    if (url.pathname === '/api/owner/summary' && request.method === 'GET') {
      const row = await env.DB.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status='confirmed' THEN 1 ELSE 0 END) AS confirmed,
        SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END) AS cancelled
        FROM appointments WHERE business_id = ?`).bind(b.id).first();
      return json({ summary: row });
    }
    const match = url.pathname.match(/^\/api\/owner\/appointments\/([0-9a-f-]{36})$/);
    if (match && request.method === 'PATCH') {
      const parsed = z.object({ status: z.enum(['confirmed', 'declined', 'cancelled', 'completed']) }).safeParse(await readJson(request));
      if (!parsed.success) return bad('Invalid status');
      const id = match[1];
      const current = await env.DB.prepare('SELECT status FROM appointments WHERE id = ? AND business_id = ?').bind(id, b.id).first<{ status: string }>();
      if (!current) return bad('Appointment not found', 404);
      if (!canTransition(current.status as AppointmentStatus, parsed.data.status)) return bad('Invalid status transition', 409);
      const updated = await env.DB.prepare('UPDATE appointments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND business_id = ? AND status = ?').bind(parsed.data.status, id, b.id, current.status).run();
      if (updated.meta.changes < 1) return bad('Appointment changed. Refresh and try again.', 409);
      try { await processEvent(env.DB, b.id, `${id}:status:${parsed.data.status}`); } catch { /* Durable event remains for manual retry. */ }
      return json({ id, status: parsed.data.status });
    }
    return bad('Not found', 404);
  }

  if (url.pathname === '/api/business' && request.method === 'GET') {
    const [services, hours] = await Promise.all([
      env.DB.prepare('SELECT id,name,description,duration_min,price_minor FROM services WHERE business_id = ? AND active = 1 ORDER BY sort_order,name').bind(b.id).all<Service>(),
      env.DB.prepare('SELECT weekday,open_min,close_min FROM working_hours WHERE business_id = ? ORDER BY weekday').bind(b.id).all(),
    ]);
    return json({ business: { slug: b.slug, name: b.name, description: b.description, timezone: b.timezone, currency: b.currency, address: b.address, phone: b.phone }, services: services.results, hours: hours.results, aiAvailable: Boolean(env.AI) });
  }

  if (url.pathname === '/api/enquiries/analyze' && request.method === 'POST') {
    if (!await allowPublicBooking(request, env.DB, 'ai', 10)) return bad('Too many assistant requests. Try again later.', 429);
    const parsed = z.object({ text: z.string().trim().min(3).max(500), consentExternalAI: z.boolean().default(false) }).safeParse(await readJson(request));
    if (!parsed.success) return bad('Please enter a short enquiry');
    const offered = await env.DB.prepare('SELECT id,name FROM services WHERE business_id = ? AND active = 1 ORDER BY sort_order').bind(b.id).all<{ id: string; name: string }>();
    const today = Temporal.Now.zonedDateTimeISO(b.timezone).toPlainDate().toString();
    const allowedModels = new Set(['@cf/meta/llama-3.1-8b-instruct', '@cf/meta/llama-3-8b-instruct']);
    const configuredModel = env.AI_MODEL || '@cf/meta/llama-3.1-8b-instruct';
    const provider = parsed.data.consentExternalAI && env.AI && allowedModels.has(configuredModel)
      ? cloudflareProvider(env.AI, configuredModel) : undefined;
    const analysis = await analyzeEnquiry(parsed.data.text, offered.results, b.timezone, today, provider);
    return json(analysis);
  }

  if (url.pathname === '/api/availability' && request.method === 'GET') {
    const serviceId = url.searchParams.get('serviceId') ?? '';
    const date = url.searchParams.get('date') ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad('Invalid date');
    try {
      if (!withinBookingWindow(date, b.timezone)) return bad('Date must be within the next 60 days');
      const s = await service(env.DB, b.id, serviceId);
      if (!s) return bad('Service not found', 404);
      const data = await dayData(env.DB, b, date);
      return json({ date, serviceId, slots: availableSlots(date, b.timezone, s.duration_min, data.hours, data.resourceIds, data.appointments) });
    } catch { return bad('Invalid date'); }
  }

  if (url.pathname === '/api/bookings' && request.method === 'POST') {
    if (!await allowPublicBooking(request, env.DB)) return bad('Too many booking requests. Try again later.', 429);
    const body = await readJson(request);
    const parsed = bookingInput.safeParse(body);
    if (!parsed.success) return bad('Please check the booking details');
    const input = parsed.data;
    const s = await service(env.DB, b.id, input.serviceId);
    if (!s) return bad('Service not found', 404);
    if (!withinBookingWindow(input.date, b.timezone)) return bad('Date must be within the next 60 days');
    const data = await dayData(env.DB, b, input.date);
    const interval = slotInterval(input.date, input.time, s.duration_min, b.timezone, data.hours);
    if (!interval || Date.parse(interval.start_at) <= Date.now() + 30 * 60_000) return bad('This time is unavailable', 409);

    const findExisting = () => env.DB.prepare('SELECT id,reference,service_id,start_at,end_at,status,customer_contact,idempotency_key FROM appointments WHERE business_id = ? AND idempotency_key = ?').bind(b.id, input.idempotencyKey).first<Appointment>();
    const existing = await findExisting();
    if (existing) return existing.service_id === s.id && existing.start_at === interval.start_at && existing.customer_contact === input.customerContact
      ? json({ reference: existing.reference, status: existing.status }, 200) : bad('Idempotency key was used for another request', 409);

    const id = crypto.randomUUID();
    const reference = `MBF-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    try {
      await env.DB.prepare(`INSERT INTO appointments (id,reference,business_id,service_id,resource_id,customer_name,customer_contact,customer_note,start_at,end_at,idempotency_key)
        SELECT ?,?,?,?,r.id,?,?,?,?,?,? FROM resources r
        WHERE r.business_id = ? AND r.active = 1 AND NOT EXISTS (
          SELECT 1 FROM appointments a WHERE a.resource_id = r.id AND a.status IN ('pending','confirmed') AND a.start_at < ? AND ? < a.end_at
        ) ORDER BY r.id LIMIT 1`).bind(id, reference, b.id, s.id, input.customerName, input.customerContact, input.note, interval.start_at, interval.end_at, input.idempotencyKey, b.id, interval.end_at, interval.start_at).run();
    } catch {
      const repeat = await findExisting();
      if (repeat && repeat.service_id === s.id && repeat.start_at === interval.start_at && repeat.customer_contact === input.customerContact) return json({ reference: repeat.reference, status: repeat.status });
      return bad('This time is no longer available', 409);
    }
    const created = await findExisting();
    if (!created) return bad('This time is no longer available', 409);
    try { await processEvent(env.DB, b.id, `${created.id}:created`); } catch { /* Durable event remains for manual retry. */ }
    return json({ reference: created.reference, status: created.status }, 201);
  }
  return bad('Not found', 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('origin');
    if (origin && origin !== env.ALLOWED_ORIGIN) return bad('Origin not allowed', 403);
    const cors: HeadersInit = origin ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } : {};
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      const response = await handle(request, env);
      Object.entries(cors).forEach(([key, value]) => response.headers.set(key, value));
      return response;
    } catch (error) {
      if (error instanceof Error && error.message === 'payload-too-large') return bad('Request too large', 413);
      return json({ error: 'Service temporarily unavailable' }, 503, cors);
    }
  },
} satisfies ExportedHandler<Env>;
