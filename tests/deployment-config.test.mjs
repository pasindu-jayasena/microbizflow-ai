import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { checkDeploymentConfig } from '../scripts/check-deployment-config.mjs';

const pages = readFileSync('wrangler.toml', 'utf8');
const worker = readFileSync('wrangler.worker.production.toml', 'utf8');
const id = /database_id = "([0-9a-f-]+)"/.exec(pages)?.[1];
assert.ok(id);

test('accepts the planned free-only production configuration', () => {
  assert.deepEqual(checkDeploymentConfig(pages, worker), {
    project: 'microbizflow-ai', database: 'microbizflow-demo', origin: 'https://microbizflow-ai.pages.dev',
    aiModel: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  });
});

test('blocks local placeholders and origins', () => {
  assert.throws(() => checkDeploymentConfig(pages.replace('microbizflow-demo', 'microbizflow-local'), worker), /approved demo database/);
  assert.throws(() => checkDeploymentConfig(pages.replace(id, '00000000-0000-0000-0000-000000000000'), worker), /real D1 ID/);
  assert.throws(() => checkDeploymentConfig(pages.replace('https://microbizflow-ai.pages.dev', 'http://127.0.0.1:8788'), worker), /origins/);
});

test('blocks paid or unintended bindings and a public scheduler', () => {
  assert.throws(() => checkDeploymentConfig(`${pages}\n[[r2_buckets]]\nbinding = "FILES"\n`, worker), /only the local baseline/);
  assert.throws(() => checkDeploymentConfig(pages, worker.replace('workers_dev = false', 'workers_dev = true')), /no public Worker/);
  assert.throws(() => checkDeploymentConfig(pages, worker.replace('DEMO_MODE = "true"', 'DEMO_MODE = "false"')), /demo mode/);
  assert.throws(() => checkDeploymentConfig(pages, worker.replace(id, '99999999-2222-4333-8444-555555555555')), /same real D1 ID/);
  assert.throws(() => checkDeploymentConfig(pages.replace('@cf/meta/llama-3.3-70b-instruct-fp8-fast','@cf/zai-org/glm-5.3'),worker), /approved Free-access JSON model/);
  assert.throws(() => checkDeploymentConfig(pages.replace(/(\[env\.production\.ai\]\r?\nbinding = ")AI"/,'$1PAID_AI"'),worker), /Expected one Workers AI binding/);
  assert.throws(() => checkDeploymentConfig(pages,worker.replace('DRAFT_AI_ENABLED = "true"','DRAFT_AI_ENABLED = "false"')), /AI workflows must be enabled/);
  assert.throws(() => checkDeploymentConfig(`${pages}\n[ai]\nbinding = "AI"\n`,worker), /local baseline/);
});
