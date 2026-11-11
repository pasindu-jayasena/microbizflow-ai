import worker from '../../worker/src/index';

interface Env {
  DB: D1Database;
  DEMO_BUSINESS_SLUG: string;
  ALLOWED_ORIGIN: string;
  DEMO_MODE?: string;
  OWNER_USERNAME?: string;
  OWNER_PASSWORD_HASH?: string;
  WEBHOOK_SECRET?: string;
  AI?: { run(model: string, input: unknown): Promise<unknown> };
  AI_MODEL?: string;
}

// Pages Functions run on the Workers runtime. Keep the browser and API on one
// origin so the owner session cookie works without third-party cookies.
export const onRequest: PagesFunction<Env> = ({ request, env }) => worker.fetch(request, env);
