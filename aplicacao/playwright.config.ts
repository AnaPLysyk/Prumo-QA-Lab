import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './testes-e2e',
  retries: 2,
  use: { baseURL: 'http://localhost:3000' }
});
