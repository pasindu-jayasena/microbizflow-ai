import { useEffect, useState } from 'react';

type Event = { event_key: string; reference: string; state: string; attempts: number; last_error: string | null; created_at: string };
type Activity = { provider: 'mock'; externalConfigured: boolean; events: Event[] };

export function Integrations({ refreshToken }: { refreshToken: number }) {
  const [activity, setActivity] = useState<Activity | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function reload() {
    const response = await fetch('/api/owner/integrations', { credentials: 'include' });
    const body = await response.json() as Activity & { error?: string };
    if (!response.ok) throw new Error(body.error || 'Could not load CRM activity');
    setActivity(body);
  }
  useEffect(() => { reload().catch(cause => setError(cause instanceof Error ? cause.message : 'Could not load CRM activity')); }, [refreshToken]);

  async function processPending() {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/owner/integrations/run', { method: 'POST', credentials: 'include' });
      const body = await response.json() as { processed?: number; failed?: number; error?: string };
      if (!response.ok) throw new Error(body.error || 'Could not process CRM records');
      setMessage(`Recorded ${body.processed ?? 0} mock CRM sync(s); ${body.failed ?? 0} failed. No external service was contacted.`);
      await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not process CRM records'); }
    finally { setBusy(false); }
  }

  return <section className="mt-12" aria-labelledby="integrations-title"><p className="eyebrow">Connected systems</p><h2 id="integrations-title" className="mt-2 text-2xl font-semibold">CRM integration</h2>
    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Mock CRM mode records booking updates and retries in this demo. HubSpot, Google services, and other CRMs require a separately configured provider and credentials. No customer data is sent to them here.</p>
    <button type="button" disabled={busy} onClick={() => void processPending()} className="mt-4 rounded-full border border-pine px-4 py-2 text-sm font-semibold text-pine disabled:opacity-50">Process mock CRM queue</button>
    {error && <p className="mt-4 text-sm text-red-700" role="alert">{error}</p>}{message && <p className="mt-4 text-sm text-pine" role="status">{message}</p>}
    {!activity ? <p className="mt-4 text-sm" role="status">Loading CRM activity…</p> : activity.events.length === 0 ? <p className="mt-4 rounded-2xl bg-white p-5 text-sm text-slate-600">No CRM sync records yet.</p> : <div className="mt-5 grid gap-3 sm:grid-cols-2">{activity.events.map(event => <article key={event.event_key} className="rounded-2xl bg-white p-4 shadow-sm"><div className="flex items-center justify-between gap-2"><strong className="text-sm">{event.reference}</strong><span className="rounded-full bg-mint px-3 py-1 text-xs font-semibold text-pine">{event.state.replace('_', ' ')}</span></div><p className="mt-2 text-xs text-slate-500">{event.event_key.endsWith(':created') ? 'New booking' : 'Status update'} · Attempt {event.attempts}{event.last_error ? ` · ${event.last_error}` : ''}</p></article>)}</div>}
  </section>;
}
