import { bookingInput, availableSlots, localDay, slotInterval, withinBookingWindow } from '../../shared/booking';
import { z } from 'zod';
import { allowPublicBooking, login, logout, ownerBusiness } from './auth';
import { allowedRequestOrigin } from './origin';
import { canTransition, type AppointmentStatus } from '../../shared/appointments';
import { Temporal } from '@js-temporal/polyfill';
import { analyzeEnquiry, cloudflareProvider, type AiBinding } from './ai';
import { approveNotification, deliverApproved, processEvent, processPendingEvents, queueUpcomingReminders } from './workflows';
import { businessProfile, hoursConfig, serviceConfig } from '../../shared/config';
import { processInboundWebhook, processPendingInboundWebhooks, verifyWebhook } from './webhooks';
import { appointmentsCsv, listAppointments, parseAppointmentFilter } from './appointment-list';
import { eraseCustomerDetails, purgeExpiredCustomers, resetExpiredDemoBookings } from './privacy';
import { processCrmEvent, processPendingCrmEvents } from './crm';

interface Env { DB: D1Database; DEMO_BUSINESS_SLUG: string; ALLOWED_ORIGIN: string; DEMO_MODE?: string; OWNER_USERNAME?: string; OWNER_PASSWORD_HASH?: string; WEBHOOK_SECRET?: string; AI?: AiBinding; AI_MODEL?: string }
interface Business { id: string; slug: string; name: string; description: string; timezone: string; currency: string; address: string; phone: string }
interface Service { id: string; name: string; description: string; duration_min: number; price_minor: number }
interface Appointment { id: string; reference: string; service_id: string; start_at: string; end_at: string; status: string; customer_contact: string; idempotency_key: string }

const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const json = (value: unknown, status = 200, extra: HeadersInit = {}) => new Response(JSON.stringify(value), { status, headers: { ...headers, ...extra } });
const bad = (error: string, status = 400) => json({ error }, status);

async function readText(request: Request): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) return '';
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
  return text + decoder.decode();
}

async function readJson(request: Request): Promise<unknown> {
  const raw = await readText(request);
  try { return JSON.parse(raw); } catch { return null; }
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

  if (url.pathname === '/api/webhooks/inbound' && request.method === 'POST') {
    if (!env.WEBHOOK_SECRET || env.WEBHOOK_SECRET.length < 32) return bad('Webhook integration is not configured', 503);
    const body = await readText(request);
    if (!await verifyWebhook(request,body,env.WEBHOOK_SECRET)) return bad('Invalid webhook signature', 401);
    let data: unknown;
    try { data = JSON.parse(body); } catch { return bad('Invalid webhook payload'); }
    const parsed = z.object({ id: z.uuid(), type: z.literal('booking.followup_requested'), reference: z.string().regex(/^MBF-[A-F0-9]{8}$/) }).safeParse(data);
    if (!parsed.success) return bad('Invalid webhook payload');
    const appointment = await env.DB.prepare('SELECT id FROM appointments WHERE business_id=? AND reference=?').bind(b.id,parsed.data.reference).first<{ id: string }>();
    if (!appointment) return bad('Booking not found', 404);
    const created = await env.DB.prepare(`INSERT OR IGNORE INTO inbound_webhooks(business_id,external_id,appointment_id,event_type)
      VALUES(?,?,?,'booking.followup_requested')`).bind(b.id,parsed.data.id,appointment.id).run();
    if (created.meta.changes < 1) {
      const existing = await env.DB.prepare('SELECT appointment_id,state FROM inbound_webhooks WHERE business_id=? AND external_id=?').bind(b.id,parsed.data.id).first<{ appointment_id: string; state: string }>();
      if (!existing || existing.appointment_id !== appointment.id) return bad('Webhook ID was used for another booking', 409);
      return json({ accepted: true, duplicate: true, state: existing.state });
    }
    const processed = await processInboundWebhook(env.DB,b.id,parsed.data.id);
    return json({ accepted: true, duplicate: false, state: processed ? 'done' : 'failed' }, processed ? 201 : 202);
  }

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
    if (url.pathname === '/api/owner/webhooks' && request.method === 'GET') {
      const [events,tasks] = await Promise.all([
        env.DB.prepare(`SELECT w.external_id,w.event_type,w.state,w.attempts,w.last_error,w.created_at,a.reference
          FROM inbound_webhooks w JOIN appointments a ON a.id=w.appointment_id
          WHERE w.business_id=? ORDER BY w.created_at DESC LIMIT 50`).bind(b.id).all(),
        env.DB.prepare(`SELECT t.id,t.title,t.state,t.created_at,t.completed_at,a.reference
          FROM owner_tasks t JOIN appointments a ON a.id=t.appointment_id
          WHERE t.business_id=? ORDER BY t.created_at DESC,t.id DESC LIMIT 50`).bind(b.id).all(),
      ]);
      return json({ events: events.results, tasks: tasks.results, configured: Boolean(env.WEBHOOK_SECRET && env.WEBHOOK_SECRET.length >= 32) });
    }
    if (url.pathname === '/api/owner/webhooks/run' && request.method === 'POST') return json(await processPendingInboundWebhooks(env.DB,b.id));
    if (url.pathname === '/api/owner/integrations' && request.method === 'GET') {
      const rows = await env.DB.prepare(`SELECT c.event_key,c.state,c.attempts,c.last_error,c.created_at,a.reference
        FROM crm_sync_events c JOIN appointments a ON a.id=c.appointment_id
        WHERE c.business_id=? ORDER BY c.created_at DESC,c.event_key DESC LIMIT 50`).bind(b.id).all();
      return json({ provider: 'mock', externalConfigured: false, events: rows.results });
    }
    if (url.pathname === '/api/owner/integrations/run' && request.method === 'POST') return json(await processPendingCrmEvents(env.DB,b.id));
    const taskMatch = url.pathname.match(/^\/api\/owner\/tasks\/(\d+)\/complete$/);
    if (taskMatch && request.method === 'POST') {
      const id = Number(taskMatch[1]);
      if (!Number.isSafeInteger(id) || id < 1) return bad('Invalid task');
      const result = await env.DB.prepare("UPDATE owner_tasks SET state='done',completed_at=CURRENT_TIMESTAMP WHERE id=? AND business_id=? AND state='open'").bind(id,b.id).run();
      if (result.meta.changes < 1) return bad('Task not found or already completed', 409);
      return json({ id, state: 'done' });
    }
    if (url.pathname === '/api/owner/config' && request.method === 'GET') {
      const [services, hours] = await Promise.all([
        env.DB.prepare('SELECT id,name,description,duration_min,price_minor,active FROM services WHERE business_id=? ORDER BY sort_order,name').bind(b.id).all(),
        env.DB.prepare('SELECT weekday,open_min,close_min FROM working_hours WHERE business_id=? ORDER BY weekday').bind(b.id).all(),
      ]);
      return json({ business: b, services: services.results, hours: hours.results });
    }
    if (url.pathname === '/api/owner/profile' && request.method === 'PATCH') {
      const parsed = businessProfile.safeParse(await readJson(request));
      if (!parsed.success) return bad('Invalid business profile');
      const value = parsed.data;
      await env.DB.prepare('UPDATE businesses SET name=?,description=?,address=?,phone=? WHERE id=?')
        .bind(value.name,value.description,value.address,value.phone,b.id).run();
      return json({ saved: true });
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
    if (url.pathname === '/api/owner/retention/run' && request.method === 'POST') return json(await purgeExpiredCustomers(env.DB,b.id));
    if (url.pathname === '/api/owner/analytics' && request.method === 'GET') {
      const [counts, services, workflows] = await Promise.all([
        env.DB.prepare(`SELECT COUNT(*) AS total,
          SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN status='confirmed' THEN 1 ELSE 0 END) AS confirmed,
          SUM(CASE WHEN status='declined' THEN 1 ELSE 0 END) AS declined,
          SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END) AS cancelled,
          SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed,
          AVG(CASE WHEN status!='pending' THEN (julianday(updated_at)-julianday(created_at))*1440 END) AS avg_decision_minutes
          FROM appointments WHERE business_id=?`).bind(b.id).first<Record<string, number | null>>(),
        env.DB.prepare(`SELECT s.name,COUNT(a.id) AS bookings FROM services s JOIN appointments a ON a.service_id=s.id
          WHERE a.business_id=? AND s.business_id=? GROUP BY s.id,s.name ORDER BY bookings DESC,s.name LIMIT 5`).bind(b.id,b.id).all(),
        env.DB.prepare(`SELECT COUNT(*) AS total,
          SUM(CASE WHEN state='done' THEN 1 ELSE 0 END) AS done,
          SUM(CASE WHEN state='failed' THEN 1 ELSE 0 END) AS failed
          FROM workflow_events WHERE business_id=?`).bind(b.id).first<Record<string, number | null>>(),
      ]);
      const total = Number(counts?.total ?? 0);
      const successful = Number(counts?.confirmed ?? 0) + Number(counts?.completed ?? 0);
      const workflowTotal = Number(workflows?.total ?? 0);
      return json({
        appointments: {
          total, pending: Number(counts?.pending ?? 0), confirmed: Number(counts?.confirmed ?? 0),
          declined: Number(counts?.declined ?? 0), cancelled: Number(counts?.cancelled ?? 0),
          completed: Number(counts?.completed ?? 0), conversionRate: total ? successful / total : null,
          avgDecisionMinutes: counts?.avg_decision_minutes ?? null,
        },
        popularServices: services.results,
        workflows: { total: workflowTotal, done: Number(workflows?.done ?? 0), failed: Number(workflows?.failed ?? 0), successRate: workflowTotal ? Number(workflows?.done ?? 0) / workflowTotal : null },
      });
    }
    if (url.pathname === '/api/owner/enquiries' && request.method === 'GET') {
      const rows = await env.DB.prepare(`SELECT e.id,e.service_id,e.requested_date,e.requested_time,e.language,e.missing_fields,e.mode,e.latency_ms,
        e.review_state,e.created_at,a.reference,a.customer_name,a.customer_contact,s.name AS service_name
        FROM enquiry_analyses e LEFT JOIN appointments a ON a.id=e.appointment_id
        LEFT JOIN services s ON s.id=e.service_id AND s.business_id=e.business_id
        WHERE e.business_id=? ORDER BY e.created_at DESC,e.id DESC LIMIT 100`).bind(b.id).all();
      return json({ enquiries: rows.results });
    }
    const enquiryMatch = url.pathname.match(/^\/api\/owner\/enquiries\/([0-9a-f-]{36})\/review$/);
    if (enquiryMatch && request.method === 'POST') {
      const result = await env.DB.prepare("UPDATE enquiry_analyses SET review_state='reviewed',reviewed_at=CURRENT_TIMESTAMP WHERE id=? AND business_id=? AND review_state='pending'")
        .bind(enquiryMatch[1],b.id).run();
      if (result.meta.changes < 1) return bad('Enquiry not found or already reviewed', 409);
      return json({ id: enquiryMatch[1], state: 'reviewed' });
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
      if (request.method === 'DELETE') {
        const customer = await env.DB.prepare('SELECT 1 AS found FROM customer_records WHERE business_id=? AND contact_key=?').bind(b.id,contactKey).first();
        if (!customer) return bad('Customer not found', 404);
        const anonymizedBookings = await eraseCustomerDetails(env.DB,b.id,contactKey);
        if (anonymizedBookings === null) return bad('Finish or cancel active bookings before deleting this customer', 409);
        return json({ deleted: true, anonymizedBookings });
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
      const filter = parseAppointmentFilter(url);
      if (!filter.success) return bad('Invalid appointment filter');
      return json({ appointments: await listAppointments(env.DB,b.id,filter.data,100) });
    }
    if (url.pathname === '/api/owner/appointments/export' && request.method === 'GET') {
      const filter = parseAppointmentFilter(url);
      if (!filter.success) return bad('Invalid appointment filter');
      const rows = await listAppointments(env.DB,b.id,filter.data,1000);
      return new Response(appointmentsCsv(rows), { headers: {
        'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="microbizflow-appointments.csv"',
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      } });
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
    if (url.pathname === '/api/owner/reminders/run' && request.method === 'POST') {
      const queued = await queueUpcomingReminders(env.DB,b.id);
      return json({ queued, ...await processPendingEvents(env.DB,b.id) });
    }
    if (url.pathname === '/api/owner/notifications' && request.method === 'GET') {
      const rows = await env.DB.prepare(`SELECT n.id,n.event_key,n.kind,n.body,n.state,n.attempts,n.created_at,n.approved_at,n.delivered_at,a.reference,a.status AS appointment_status,a.start_at
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
      try { await processCrmEvent(env.DB,b.id,`${id}:status:${parsed.data.status}`); } catch { /* Durable CRM event remains for retry. */ }
      return json({ id, status: parsed.data.status });
    }
    return bad('Not found', 404);
  }

  if (url.pathname === '/api/business' && request.method === 'GET') {
    const [services, hours] = await Promise.all([
      env.DB.prepare('SELECT id,name,description,duration_min,price_minor FROM services WHERE business_id = ? AND active = 1 ORDER BY sort_order,name').bind(b.id).all<Service>(),
      env.DB.prepare('SELECT weekday,open_min,close_min FROM working_hours WHERE business_id = ? ORDER BY weekday').bind(b.id).all(),
    ]);
    return json({ business: { slug: b.slug, name: b.name, description: b.description, timezone: b.timezone, currency: b.currency, address: b.address, phone: b.phone }, services: services.results, hours: hours.results, aiAvailable: Boolean(env.AI), demoMode: env.DEMO_MODE !== 'false' });
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
    const analysisId = crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO enquiry_analyses(id,business_id,service_id,requested_date,requested_time,language,missing_fields,mode,latency_ms)
      VALUES(?,?,?,?,?,?,?,?,?)`).bind(analysisId,b.id,analysis.intent.serviceId,analysis.intent.date,analysis.intent.time,
      analysis.intent.language,analysis.intent.missing.join(','),analysis.mode,analysis.latencyMs).run();
    return json({ ...analysis, analysisId });
  }

  if ((url.pathname === '/api/bookings/status' || url.pathname === '/api/bookings/cancel') && request.method === 'POST') {
    const kind = url.pathname.endsWith('/cancel') ? 'cancel' : 'lookup';
    if (!await allowPublicBooking(request, env.DB, kind, kind === 'cancel' ? 5 : 10)) return bad('Too many requests. Try again later.', 429);
    const parsed = z.object({ reference: z.string().regex(/^MBF-[A-F0-9]{8}$/), cancellationCode: z.uuid() }).safeParse(await readJson(request));
    if (!parsed.success) return bad('Enter a valid reference and private code');
    const item = await env.DB.prepare('SELECT id,reference,status,start_at,idempotency_key FROM appointments WHERE business_id=? AND reference=? AND idempotency_key=?')
      .bind(b.id,parsed.data.reference,parsed.data.cancellationCode).first<{ id: string; reference: string; status: AppointmentStatus; start_at: string; idempotency_key: string }>();
    if (!item) return bad('Booking not found for these details', 404);
    if (kind === 'lookup') return json({ reference: item.reference, status: item.status, startAt: item.start_at });
    if (!canTransition(item.status, 'cancelled') || Date.parse(item.start_at) <= Date.now() + 30 * 60_000) return bad('This booking can no longer be cancelled online', 409);
    const changed = await env.DB.prepare("UPDATE appointments SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE id=? AND business_id=? AND status=?")
      .bind(item.id,b.id,item.status).run();
    if (changed.meta.changes < 1) return bad('Booking changed. Check its latest status.', 409);
    try { await processEvent(env.DB,b.id,`${item.id}:status:cancelled`); } catch { /* Durable event remains for manual retry. */ }
    try { await processCrmEvent(env.DB,b.id,`${item.id}:status:cancelled`); } catch { /* Durable CRM event remains for retry. */ }
    return json({ reference: item.reference, status: 'cancelled' });
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
    const demoMode = env.DEMO_MODE !== 'false';
    if (demoMode && !/^[A-Za-z0-9._%+-]{1,80}@example\.invalid$/i.test(input.customerContact))
      return bad('This demo accepts fictional email addresses ending in @example.invalid only');
    const s = await service(env.DB, b.id, input.serviceId);
    if (!s) return bad('Service not found', 404);
    if (!withinBookingWindow(input.date, b.timezone)) return bad('Date must be within the next 60 days');
    const data = await dayData(env.DB, b, input.date);
    const interval = slotInterval(input.date, input.time, s.duration_min, b.timezone, data.hours);
    if (!interval || Date.parse(interval.start_at) <= Date.now() + 30 * 60_000) return bad('This time is unavailable', 409);

    const findExisting = () => env.DB.prepare('SELECT id,reference,service_id,start_at,end_at,status,customer_contact,idempotency_key FROM appointments WHERE business_id = ? AND idempotency_key = ?').bind(b.id, input.idempotencyKey).first<Appointment>();
    const existing = await findExisting();
    if (existing) return existing.service_id === s.id && existing.start_at === interval.start_at && existing.customer_contact === input.customerContact
      ? json({ reference: existing.reference, status: existing.status, cancellationCode: existing.idempotency_key }, 200) : bad('Idempotency key was used for another request', 409);

    const id = crypto.randomUUID();
    const reference = `MBF-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    try {
      await env.DB.prepare(`INSERT INTO appointments (id,reference,business_id,service_id,resource_id,customer_name,customer_contact,customer_note,start_at,end_at,idempotency_key)
        SELECT ?,?,?,?,r.id,?,?,?,?,?,? FROM resources r
        WHERE r.business_id = ? AND r.active = 1 AND NOT EXISTS (
          SELECT 1 FROM appointments a WHERE a.resource_id = r.id AND a.status IN ('pending','confirmed') AND a.start_at < ? AND ? < a.end_at
        ) ORDER BY r.id LIMIT 1`).bind(id, reference, b.id, s.id, demoMode ? 'Demo visitor' : input.customerName, input.customerContact, demoMode ? '' : input.note, interval.start_at, interval.end_at, input.idempotencyKey, b.id, interval.end_at, interval.start_at).run();
    } catch {
      const repeat = await findExisting();
      if (repeat && repeat.service_id === s.id && repeat.start_at === interval.start_at && repeat.customer_contact === input.customerContact) return json({ reference: repeat.reference, status: repeat.status, cancellationCode: repeat.idempotency_key });
      return bad('This time is no longer available', 409);
    }
    const created = await findExisting();
    if (!created) return bad('This time is no longer available', 409);
    if (input.analysisId) {
      try {
        await env.DB.prepare('UPDATE enquiry_analyses SET appointment_id=? WHERE id=? AND business_id=? AND appointment_id IS NULL')
          .bind(created.id,input.analysisId,b.id).run();
      } catch { /* Optional enquiry linking must not fail a committed booking. */ }
    }
    try { await processEvent(env.DB, b.id, `${created.id}:created`); } catch { /* Durable event remains for manual retry. */ }
    try { await processCrmEvent(env.DB,b.id,`${created.id}:created`); } catch { /* Durable CRM event remains for retry. */ }
    return json({ reference: created.reference, status: created.status, cancellationCode: created.idempotency_key }, 201);
  }
  return bad('Not found', 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('origin');
    if (!allowedRequestOrigin(request, env.ALLOWED_ORIGIN)) return bad('Origin not allowed', 403);
    const cors: HeadersInit = origin ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } : {};
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
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    const b = await business(env.DB,env.DEMO_BUSINESS_SLUG);
    if (!b) throw new Error('Business is not configured');
    // Keep each invocation small for Workers Free CPU and D1 request limits.
    if (env.DEMO_MODE !== 'false') await resetExpiredDemoBookings(env.DB,b.id);
    await queueUpcomingReminders(env.DB,b.id);
    await processPendingEvents(env.DB,b.id,2);
    await processPendingInboundWebhooks(env.DB,b.id,2);
    await processPendingCrmEvents(env.DB,b.id,2);
    await purgeExpiredCustomers(env.DB,b.id,Date.now(),1,10);
  },
} satisfies ExportedHandler<Env>;
