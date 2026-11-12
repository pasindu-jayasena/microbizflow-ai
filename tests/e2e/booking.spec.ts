import { expect, test } from '@playwright/test';
import { Temporal } from '@js-temporal/polyfill';

test('a customer can request, check, and cancel a real booking', async ({ page, request }) => {
  // Local D1 persists across runs; use a fresh synthetic client identity for this flow.
  const groups = crypto.randomUUID().replaceAll('-', '').match(/.{4}/g)!;
  const testIp = `2001:db8:${groups.slice(0, 6).join(':')}`;
  await page.route('**/api/**', route => route.continue({ headers: { ...route.request().headers(), 'CF-Connecting-IP': testIp } }));
  const catalogue = await request.get('/api/business').then(response => response.json());
  const today = Temporal.Now.zonedDateTimeISO(catalogue.business.timezone).toPlainDate();
  let date = '';
  for (let offset = 2; offset <= 9; offset++) {
    const candidate = today.add({ days: offset }).toString();
    const available = await request.get(`/api/availability?serviceId=svc_cut&date=${candidate}`).then(response => response.json());
    if (available.slots.length) { date = candidate; break; }
  }
  expect(date).not.toBe('');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /A good cut starts with time for you/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'From enquiry to appointment.' })).toBeVisible();
  await expect(page.getByText('Suggestions make booking easier.', { exact: false })).toBeVisible();
  await expect(page.getByText('Built-in suggestions')).toBeVisible();
  await expect.poll(() => page.locator('img[src="/salon-studio.webp"]').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByText('Monday').locator('..')).toContainText('9:00 AM – 6:00 PM');
  await page.getByRole('link', { name: 'Book a visit' }).click();
  await page.getByLabel('Your message').fill('I need a haircut tomorrow around 5 PM.');
  await page.getByRole('button', { name: 'Find details' }).click();
  const suggestion = page.getByRole('button', { name: 'Use suggested service and date' });
  const limited = page.getByRole('alert').filter({ hasText: 'Too many assistant requests' });
  await expect(suggestion.or(limited)).toBeVisible();
  const analyzed = await suggestion.isVisible();
  if (analyzed) {
    await expect(page.getByText('Simple suggestion', { exact: true })).toBeVisible();
    await suggestion.click();
  }
  await page.getByLabel('Date').fill(date);
  await expect(page.locator('fieldset button').first()).toBeVisible();
  await page.locator('fieldset button').first().click();
  if (!catalogue.demoMode) await page.getByLabel('Your name').fill('Fictional Browser Test');
  const contact = `browser-${crypto.randomUUID()}@example.invalid`;
  await page.locator('#contact').fill('real@example.com');
  expect(await page.locator('#contact').evaluate((input: HTMLInputElement) => input.checkValidity())).toBe(false);
  await page.locator('#contact').fill(contact);
  await page.getByRole('button', { name: /Request Signature haircut/ }).click();
  await expect(page.getByRole('heading', { name: 'Request received' })).toBeVisible();
  const reference = await page.locator('#booking').getByText(/^MBF-[A-F0-9]{8}$/).textContent();
  await expect(page.getByText(/MBF-[A-F0-9]{8}/)).toBeVisible();
  await expect(page.getByText('Private cancellation code')).toBeVisible();
  await page.getByRole('button', { name: 'Check status' }).click();
  await expect(page.getByText(/Booking MBF-[A-F0-9]{8}: pending/)).toBeVisible();
  await page.getByRole('button', { name: 'Cancel booking' }).click();
  await expect(page.getByText(/Booking MBF-[A-F0-9]{8}: cancelled/)).toBeVisible();
  if (process.env.LOCAL_OWNER_PASSWORD) {
    await page.goto('/owner');
    await page.getByLabel('Password').fill(process.env.LOCAL_OWNER_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('button', { name: 'Prepare reminders' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'upcoming reminder' })).toBeVisible();
    if (analyzed && reference) {
      const enquiryCard = page.getByRole('region', { name: 'AI enquiries' }).locator('article').filter({ hasText: reference });
      await expect(enquiryCard).toBeVisible();
      await enquiryCard.getByRole('button', { name: 'Mark reviewed' }).click();
      await expect(enquiryCard).toContainText('reviewed');
    }
    await page.getByLabel('Search appointments').fill(contact);
    await page.getByRole('combobox', { name: 'Status' }).selectOption('cancelled');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page.locator('article').filter({ hasText: contact }).first()).toBeVisible();
    const downloadStarted = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV' }).click();
    const download = await downloadStarted;
    expect(download.suggestedFilename()).toBe('microbizflow-appointments.csv');
    expect(await download.failure()).toBeNull();
    const csv = await page.evaluate(async term => (await fetch(`/api/owner/appointments/export?q=${encodeURIComponent(term)}&status=cancelled`, { credentials: 'include' })).text(), contact);
    expect(csv).toContain(contact);
    expect(csv).toContain('"cancelled"');
    await expect(page.getByRole('heading', { name: 'Customers', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Analytics', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'CRM synchronization' })).toBeVisible();
    await page.getByRole('button', { name: 'Process due CRM events' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'This demo contacted no external CRM' })).toBeVisible();
    await expect(page.getByText('Booking requests', { exact: true })).toBeVisible();
    await page.getByLabel('Search customers').fill(contact);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    const customer = page.getByRole('button', { name: new RegExp(contact.replaceAll('.', '\\.')) });
    await expect(customer).toBeVisible();
    await customer.click();
    await expect(page.getByRole('heading', { name: 'Appointment history' })).toBeVisible();
    await expect(page.getByText(contact).last()).toBeVisible();
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Delete customer details' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Customer details deleted' })).toBeVisible();
    await expect(page.getByText('No customers match this search.')).toBeVisible();
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Run retention now' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Retention run erased' })).toBeVisible();
  }
});

test('owner records stay behind the sign-in screen', async ({ page, request }) => {
  const privateResponse = await request.get('/api/owner/appointments');
  expect(privateResponse.status()).toBe(401);
  expect((await request.get('/api/owner/appointments/export')).status()).toBe(401);
  await page.goto('/owner');
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
});
