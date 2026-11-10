import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// On Windows, workerd needs a writable TEMP directory for its local cache.
const temp = join(process.cwd(), '.wrangler', 'tmp');
mkdirSync(temp, { recursive: true });
const env = { ...process.env, TEMP: temp, TMP: temp };
const bin = join(process.cwd(), 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const result = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], { stdio: 'inherit', env });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
