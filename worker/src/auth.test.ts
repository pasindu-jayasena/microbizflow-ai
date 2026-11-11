import { describe, expect, it } from 'vitest';
import { verifyPassword } from './auth';

const hex = (bytes: Uint8Array) => Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');

describe('owner password verification', () => {
  it('accepts only the matching PBKDF2 password', async () => {
    const salt = new Uint8Array(16).fill(7);
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('fictional-test-password'), 'PBKDF2', false, ['deriveBits']);
    const hash = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 210_000 }, key, 256));
    const stored = `${hex(salt)}:${hex(hash)}`;
    expect(await verifyPassword('fictional-test-password', stored)).toBe(true);
    expect(await verifyPassword('wrong-password', stored)).toBe(false);
    expect(await verifyPassword('fictional-test-password', 'malformed')).toBe(false);
  });
  it('accepts only a generated-length production secret with a matching salted hash', async () => {
    const password = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';
    const salt = '0123456789abcdef0123456789abcdef';
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${password}`)));
    const stored = `random-sha256:${salt}:${hex(digest)}`;
    expect(await verifyPassword(password, stored)).toBe(true);
    expect(await verifyPassword('wrong-password', stored)).toBe(false);
    expect(await verifyPassword(password.slice(1), stored)).toBe(false);
    expect(await verifyPassword(password, 'random-sha256:bad:bad')).toBe(false);
  });
});
