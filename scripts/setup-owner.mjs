import { existsSync, writeFileSync } from 'node:fs';
import { pbkdf2Sync, randomBytes } from 'node:crypto';

if (existsSync('.dev.vars')) {
  console.error('.dev.vars already exists. Remove it manually if you intend to rotate the local owner password.');
  process.exit(1);
}

function readPassword() {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      let value = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', chunk => { value += chunk; });
      process.stdin.on('end', () => resolve(value.trimEnd()));
      process.stdin.on('error', reject);
      return;
    }
    process.stdout.write('Choose a local owner password (12+ characters): ');
    let value = '';
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    const onData = chunk => {
      if (chunk === '\r' || chunk === '\n') {
        process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.off('data', onData); process.stdout.write('\n'); resolve(value);
      } else if (chunk === '\u0003') {
        process.stdin.setRawMode(false); reject(new Error('Cancelled'));
      } else if (chunk === '\u007f') {
        value = value.slice(0, -1);
      } else { value += chunk; }
    };
    process.stdin.on('data', onData);
  });
}

try {
  const password = await readPassword();
  if (password.length < 12 || password.length > 200) throw new Error('Password must be 12–200 characters.');
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, 210_000, 32, 'sha256');
  writeFileSync('.dev.vars', `OWNER_USERNAME=owner\nOWNER_PASSWORD_HASH=${salt.toString('hex')}:${hash.toString('hex')}\n`, { flag: 'wx', mode: 0o600 });
  console.log('Local owner login configured. Username: owner. The password was not printed or stored in plaintext.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Setup failed.');
  process.exit(1);
}
