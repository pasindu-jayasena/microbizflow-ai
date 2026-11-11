import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const placeholder = '00000000-0000-0000-0000-000000000000';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseConfig(source) {
  const sections = new Map([['root', {}]]);
  let section = 'root';
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (/^(?:\[[a-z0-9_]+\]|\[\[[a-z0-9_]+\]\])$/.test(line)) {
      section = line.replace(/^\[+|\]+$/g, '');
      if (sections.has(section)) throw new Error(`Duplicate section: ${section}`);
      sections.set(section, {});
      continue;
    }
    const match = /^([A-Za-z0-9_]+)\s*=\s*(.+)$/.exec(line);
    if (!match) throw new Error(`Unsupported configuration line: ${line}`);
    const [, key, rawValue] = match;
    const values = sections.get(section);
    if (Object.hasOwn(values, key)) throw new Error(`Duplicate key: ${section}.${key}`);
    values[key] = JSON.parse(rawValue);
  }
  return sections;
}

function assertKeys(section, expected, name) {
  const actual = Object.keys(section ?? {}).sort();
  if (actual.join(',') !== [...expected].sort().join(',')) {
    throw new Error(`${name} keys must be exactly: ${expected.join(', ')}`);
  }
}

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

export function checkDeploymentConfig(pagesSource, workerSource) {
  const pages = parseConfig(pagesSource);
  const worker = parseConfig(workerSource);
  requireValue([...pages.keys()].sort().join(',') === 'd1_databases,root,vars', 'Pages may contain only root, one D1 binding, and vars');
  requireValue([...worker.keys()].sort().join(',') === 'd1_databases,root,triggers,vars', 'Worker may contain only root, one D1 binding, triggers, and vars');
  assertKeys(pages.get('root'), ['name', 'pages_build_output_dir', 'compatibility_date'], 'Pages root');
  assertKeys(worker.get('root'), ['name', 'main', 'compatibility_date', 'workers_dev', 'preview_urls'], 'Worker root');
  assertKeys(pages.get('d1_databases'), ['binding', 'database_name', 'database_id', 'preview_database_id', 'migrations_dir'], 'Pages D1');
  assertKeys(worker.get('d1_databases'), ['binding', 'database_name', 'database_id', 'migrations_dir'], 'Worker D1');
  assertKeys(pages.get('vars'), ['DEMO_BUSINESS_SLUG', 'DEMO_MODE', 'ALLOWED_ORIGIN'], 'Pages vars');
  assertKeys(worker.get('vars'), ['DEMO_BUSINESS_SLUG', 'DEMO_MODE', 'ALLOWED_ORIGIN'], 'Worker vars');
  assertKeys(worker.get('triggers'), ['crons'], 'Worker triggers');

  const pageRoot = pages.get('root');
  const workerRoot = worker.get('root');
  const pageDb = pages.get('d1_databases');
  const workerDb = worker.get('d1_databases');
  const pageVars = pages.get('vars');
  const workerVars = worker.get('vars');
  requireValue(pageRoot.name === 'microbizflow-ai' && pageRoot.pages_build_output_dir === './dist/web', 'Unexpected Pages project or output directory');
  requireValue(workerRoot.name === 'microbizflow-api' && workerRoot.main === 'worker/src/index.ts', 'Unexpected Worker name or entrypoint');
  requireValue(workerRoot.workers_dev === false && workerRoot.preview_urls === false, 'Scheduler must have no public Worker or preview URL');
  requireValue(JSON.stringify(worker.get('triggers').crons) === JSON.stringify(['0 * * * *']), 'Expected one hourly Cron trigger');
  requireValue(pageRoot.compatibility_date === workerRoot.compatibility_date, 'Compatibility dates must match');
  requireValue(pageDb.binding === 'DB' && workerDb.binding === 'DB', 'Both runtimes must bind D1 as DB');
  requireValue(pageDb.database_name === 'microbizflow-demo' && workerDb.database_name === pageDb.database_name, 'Both runtimes must use the approved demo database');
  requireValue(uuid.test(pageDb.database_id) && pageDb.database_id !== placeholder && workerDb.database_id === pageDb.database_id, 'Both runtimes need the same real D1 ID');
  requireValue(pageDb.migrations_dir === 'db/migrations' && workerDb.migrations_dir === pageDb.migrations_dir, 'Unexpected migrations directory');
  requireValue(pageDb.preview_database_id === 'DB', 'Unexpected Pages local preview binding');
  requireValue(pageVars.DEMO_MODE === 'true' && workerVars.DEMO_MODE === 'true', 'Public deployment must keep demo mode enabled');
  requireValue(pageVars.DEMO_BUSINESS_SLUG === 'harbour-cut' && workerVars.DEMO_BUSINESS_SLUG === pageVars.DEMO_BUSINESS_SLUG, 'Demo business slugs must match');
  const origin = `https://${pageRoot.name}.pages.dev`;
  requireValue(pageVars.ALLOWED_ORIGIN === origin && workerVars.ALLOWED_ORIGIN === origin, `Both origins must be ${origin}`);
  return { project: pageRoot.name, database: pageDb.database_name, origin };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const result = checkDeploymentConfig(readFileSync('wrangler.toml', 'utf8'), readFileSync('wrangler.worker.production.toml', 'utf8'));
    console.log(`Deployment config ready: ${result.project}, ${result.database}, ${result.origin}`);
  } catch (error) {
    console.error(`Deployment config blocked: ${error.message}`);
    process.exitCode = 1;
  }
}
