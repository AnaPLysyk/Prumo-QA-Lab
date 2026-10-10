import { test, expect } from '@playwright/test';

test('cancelar pedido', async ({ page }) => {
  await page.goto('/pedidos');
  await page.locator('//table/tbody/tr[2]/td[5]/button').click();
  await page.waitForTimeout(3000);
});

test.skip('operador não cancela pedido fechado', async ({ page }) => {
  await page.goto('/pedidos/1');
  await expect(page.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
});

test('listar pedidos', async ({ page }) => {
  await page.goto('/pedidos');
  await page.getByRole('link', { name: 'Pedidos' }).click();
  await expect(page.getByTestId('lista-pedidos')).toBeVisible();
});

test('listar pedidos novamente', async ({ page }) => {
  await page.goto('/pedidos');
  await page.getByRole('link', { name: 'Pedidos' }).click();
  await expect(page.getByTestId('lista-pedidos')).toBeVisible();
});

test('título da página', async ({ page }) => {
  await page.goto('/pedidos');
  expect(await page.title()).toBeTruthy();
});

test('salvar pedido', async ({ page }) => {
  await page.goto('/pedidos/novo');
  await page.getByLabel('Cliente').fill('Ana');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('status')).toHaveText('Pedido salvo');
});

test('API cria pedido', async ({ request }) => {
  const r = await request.post('/api/pedidos', { data: { cliente: 'Ana' } });
  expect(r.ok()).toBeTruthy();
});
