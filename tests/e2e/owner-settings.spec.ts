import { expect, test } from '@playwright/test';

test('owner can review and save business profile, service, and hours settings', async ({ page }) => {
  test.skip(!process.env.LOCAL_OWNER_PASSWORD, 'Local owner password is required for protected UI checks.');
  await page.goto('/owner');
  await page.getByLabel('Password').fill(process.env.LOCAL_OWNER_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Services and working hours' })).toBeVisible();
  const businessName = await page.getByRole('textbox', { name: 'Business name' }).inputValue();
  await page.getByRole('button', { name: 'Save business profile' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Business profile saved.' })).toBeVisible();
  const service = page.locator('form').filter({ has: page.locator('input[value="Signature haircut"]') });
  await service.getByRole('button', { name: 'Save service' }).click();
  await expect(service.getByRole('status')).toHaveText('Service saved.');
  const monday = page.locator('form').filter({ has: page.getByLabel('Monday opens') });
  await monday.getByRole('button', { name: 'Save day' }).click();
  await expect(monday.getByRole('status')).toHaveText('Hours saved.');
  await page.goto('/');
  await expect(page.getByRole('link', { name: businessName })).toBeVisible();
});
