import { createHash, randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';

const path = '.production-owner-credentials';
if (existsSync(path)) {
  console.error(`${path} already exists. Rotate or remove it manually before generating new credentials.`);
  process.exit(1);
}

const password = randomBytes(32).toString('base64url');
const salt = randomBytes(16).toString('hex');
const hash = createHash('sha256').update(`${salt}:${password}`).digest('hex');
writeFileSync(path, `OWNER_USERNAME=owner\nOWNER_PASSWORD=${password}\nOWNER_PASSWORD_HASH=random-sha256:${salt}:${hash}\n`, { flag: 'wx', mode: 0o600 });
console.log(`Generated a 256-bit owner secret in ignored ${path}. Open it locally, save the password in your password manager, and delete the file after configuring Pages secrets. Nothing secret was printed.`);
