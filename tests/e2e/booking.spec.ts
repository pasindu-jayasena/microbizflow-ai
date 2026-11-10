import { expect, test } from '@playwright/test';
import { Temporal } from '@js-temporal/polyfill';

test('a customer can use a suggestion and request a real available booking', async ({ page, request }) => {
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
  await expect(page.getByRole('heading', { name: /Good cuts. Good timing./ })).toBeVisible();
  await page.getByRole('link', { name: 'Book a visit' }).click();
  await page.getByLabel('Your message').fill('I need a haircut tomorrow around 5 PM.');
  await page.getByRole('button', { name: 'Find details' }).click();
  await expect(page.getByText('Simple suggestion', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Use suggested service and date' }).click();
  await page.getByLabel('Date').fill(date);
  await expect(page.locator('fieldset button').first()).toBeVisible();
  await page.locator('fieldset button').first().click();
  await page.getByLabel('Your name').fill('Fictional Browser Test');
  const contact = `browser-${crypto.randomUUID()}@example.invalid`;
  await page.getByLabel('Email or phone').fill(contact);
  await page.getByRole('button', { name: /Request Signature haircut/ }).click();
  await expect(page.getByRole('heading', { name: 'Request received' })).toBeVisible();
  await expect(page.getByText(/MBF-[A-F0-9]{8}/)).toBeVisible();
  if (process.env.LOCAL_OWNER_PASSWORD) {
    await page.goto('/owner');
    await page.getByLabel('Password').fill(process.env.LOCAL_OWNER_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Customers', exact: true })).toBeVisible();
    await page.getByLabel('Search customers').fill(contact);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    const customer = page.getByRole('button', { name: new RegExp(contact.replaceAll('.', '\\.')) });
    await expect(customer).toBeVisible();
    await customer.click();
    await expect(page.getByRole('heading', { name: 'Appointment history' })).toBeVisible();
    await expect(page.getByText(contact).last()).toBeVisible();
  }
});

test('owner records stay behind the sign-in screen', async ({ page, request }) => {
  const privateResponse = await request.get('/api/owner/appointments');
  expect(privateResponse.status()).toBe(401);
  await page.goto('/owner');
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
});
