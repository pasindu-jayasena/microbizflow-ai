import { expect, test } from '@playwright/test';

test('public owner preview uses fictional browser-only records', async ({ page }) => {
  const ownerRequests: string[] = [];
  page.on('request', request => {
    if (request.url().includes('/api/owner/')) ownerRequests.push(request.url());
  });
  await page.goto('/owner-preview');
  await expect(page.getByRole('heading', { name: 'Owner workspace preview' })).toBeVisible();
  await expect(page.getByText('This page never reads customer records.')).toBeVisible();
  const automation = page.locator('#ai-automation-preview');
  await expect(automation.getByRole('heading', { name: 'AI & automation, with owner approval.' })).toBeVisible();
  await expect(automation.getByText('Every step stays in this browser preview.', { exact: false })).toBeVisible();
  await expect(automation.locator('[aria-current="step"]')).toContainText('Suggestion prepared');
  await automation.getByRole('button', { name: 'Next sample step' }).click();
  await expect(automation.locator('[aria-current="step"]')).toContainText('Owner review');
  await automation.getByRole('button', { name: 'Next sample step' }).click();
  await expect(automation.locator('[aria-current="step"]')).toContainText('Delivery simulation');
  const sample = page.locator('article').filter({ hasText: 'SAMPLE-001' });
  await expect(sample.getByText('pending')).toBeVisible();
  await sample.getByRole('button', { name: 'Confirm' }).click();
  await expect(sample.getByText('confirmed')).toBeVisible();
  await expect(page.getByRole('status')).toContainText('No database record was updated');
  await page.getByLabel('Search sample requests').fill('beard');
  await expect(page.locator('article')).toHaveCount(2);
  await page.reload();
  await expect(page.locator('article').filter({ hasText: 'SAMPLE-001' }).getByText('pending')).toBeVisible();
  expect(ownerRequests).toEqual([]);
});
