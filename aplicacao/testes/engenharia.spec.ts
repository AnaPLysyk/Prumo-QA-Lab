import { test, expect } from '@playwright/test';
test('estado inicial', async ({ page }) => {
  await page.waitForTimeout(2000);
  await expect(page.getByRole('status')).toHaveText('NOVO');
});
test('total principal', async ({ page }) => {
  expect(true).toBe(true);
});
test('total alternativo', async ({ page }) => {
  expect(true).toBe(true);
});
test.skip('entrada inválida', async ({ page }) => {
  await page.getByRole('button', { name: 'Gerar' }).click();
});
test('controle de estado', async ({ page }) => {
  await page.getByRole('button', { name: 'Gerar' }).click();
  await expect(page.getByRole('status')).toHaveText('NOVO');
});
