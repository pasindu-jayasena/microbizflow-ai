import { expect, test } from '@playwright/test';
import { Temporal } from '@js-temporal/polyfill';

test('owner approval confirms a pending booking and prepares an approved-only draft', async ({ page, request }) => {
  test.skip(!process.env.LOCAL_OWNER_PASSWORD,'A disposable local owner credential is required');
  const catalogue = await request.get('/api/business').then(response => response.json());
  const today = Temporal.Now.zonedDateTimeISO(catalogue.business.timezone).toPlainDate();
  const contact = `approval-${crypto.randomUUID()}@example.invalid`;
  let booking: { reference: string; cancellationCode: string } | null = null;
  for (let offset = 4; offset <= 12 && !booking; offset++) {
    const date = today.add({ days: offset }).toString();
    const available = await request.get(`/api/availability?serviceId=svc_cut&date=${date}`).then(response => response.json());
    for (const time of available.slots.slice(-3)) {
      const result = await request.post('/api/bookings', { data: { serviceId:'svc_cut',date,time,
        customerName:'Fictional Approval Test',customerContact:contact,note:'',idempotencyKey:crypto.randomUUID() } });
      if (result.status() === 201) { booking = await result.json(); break; }
      expect(result.status()).toBe(409);
    }
  }
  expect(booking).not.toBeNull();
  const reference = booking!.reference;
  expect((await request.get('/api/owner/appointments')).status()).toBe(401);
  await page.goto('/owner');
  await page.getByLabel('Password').fill(process.env.LOCAL_OWNER_PASSWORD!);
  await page.getByRole('button',{name:'Sign in'}).click();
  await page.getByLabel('Search appointments').fill(contact);
  await page.getByRole('button',{name:'Apply filters'}).click();
  const appointment = page.getByRole('heading',{name:'Recent requests'}).locator('..').locator('..').locator('article').filter({ hasText: reference });
  await expect(appointment).toContainText('pending');
  await appointment.getByRole('button',{name:'Confirm'}).click();
  await expect(appointment).toContainText('confirmed');
  const status = await request.post('/api/bookings/status',{ data: { reference,cancellationCode:booking!.cancellationCode } });
  expect(status.status()).toBe(200);
  expect((await status.json()).status).toBe('confirmed');
  const drafts = await page.evaluate(async ref => {
    const response = await fetch('/api/owner/notifications',{ credentials:'include' });
    const body = await response.json() as { notifications: Array<{ reference: string; state: string; kind: string }> };
    return body.notifications.filter(item => item.reference === ref);
  },reference);
  expect(drafts.some((item: { state: string; kind: string }) => item.kind === 'customer_draft' && item.state === 'needs_approval')).toBe(true);
});
