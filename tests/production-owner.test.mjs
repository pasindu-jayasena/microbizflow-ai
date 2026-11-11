import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

test('production owner setup creates a private random credential file without printing secrets', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mbf-owner-'));
  try {
    const script = resolve('scripts/prepare-production-owner.mjs');
    const first = spawnSync(process.execPath, [script], { cwd: directory, encoding: 'utf8' });
    assert.equal(first.status, 0, first.stderr);
    const content = readFileSync(join(directory, '.production-owner-credentials'), 'utf8');
    const values = Object.fromEntries(content.trim().split('\n').map(line => line.split('=')));
    assert.equal(values.OWNER_USERNAME, 'owner');
    assert.match(values.OWNER_PASSWORD, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(Buffer.from(values.OWNER_PASSWORD, 'base64url').length, 32);
    const [, salt, hash] = values.OWNER_PASSWORD_HASH.split(':');
    assert.equal(createHash('sha256').update(`${salt}:${values.OWNER_PASSWORD}`).digest('hex'), hash);
    assert.equal(first.stdout.includes(values.OWNER_PASSWORD), false);
    assert.equal(first.stdout.includes(hash), false);
    const second = spawnSync(process.execPath, [script], { cwd: directory, encoding: 'utf8' });
    assert.equal(second.status, 1);
    assert.equal(readFileSync(join(directory, '.production-owner-credentials'), 'utf8'), content);
    assert.match(readFileSync('.gitignore', 'utf8'), /^\.production-owner-credentials$/m);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
