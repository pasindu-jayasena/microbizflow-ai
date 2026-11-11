import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { checkDeploymentConfig } from '../scripts/check-deployment-config.mjs';

const id = '11111111-2222-4333-8444-555555555555';
const pages = readFileSync('wrangler.toml', 'utf8')
  .replace('microbizflow-local', 'microbizflow-demo')
  .replace('00000000-0000-0000-0000-000000000000', id)
  .replace('http://127.0.0.1:8788', 'https://microbizflow-ai.pages.dev');
const worker = readFileSync('wrangler.worker.toml', 'utf8')
  .replace('microbizflow-local', 'microbizflow-demo')
  .replace('00000000-0000-0000-0000-000000000000', id)
  .replace('http://127.0.0.1:5173', 'https://microbizflow-ai.pages.dev');

test('accepts the planned free-only production configuration', () => {
  assert.deepEqual(checkDeploymentConfig(pages, worker), {
    project: 'microbizflow-ai', database: 'microbizflow-demo', origin: 'https://microbizflow-ai.pages.dev',
  });
});

test('blocks local placeholders and origins', () => {
  assert.throws(() => checkDeploymentConfig(readFileSync('wrangler.toml', 'utf8'), worker), /approved demo database/);
  assert.throws(() => checkDeploymentConfig(pages.replace(id, '00000000-0000-0000-0000-000000000000'), worker), /real D1 ID/);
  assert.throws(() => checkDeploymentConfig(pages.replace('https://microbizflow-ai.pages.dev', 'http://127.0.0.1:8788'), worker), /origins/);
});

test('blocks paid or unintended bindings and a public scheduler', () => {
  assert.throws(() => checkDeploymentConfig(`${pages}\n[[r2_buckets]]\nbinding = "FILES"\n`, worker), /only root/);
  assert.throws(() => checkDeploymentConfig(pages, worker.replace('workers_dev = false', 'workers_dev = true')), /no public Worker/);
  assert.throws(() => checkDeploymentConfig(pages, worker.replace('DEMO_MODE = "true"', 'DEMO_MODE = "false"')), /demo mode/);
  assert.throws(() => checkDeploymentConfig(pages, worker.replace(id, '99999999-2222-4333-8444-555555555555')), /same real D1 ID/);
});
