import { useEffect, useState } from 'react';

type Event = { external_id: string; event_type: string; state: string; attempts: number; last_error: string | null; created_at: string; reference: string };
type Task = { id: number; title: string; state: string; created_at: string; completed_at: string | null; reference: string };
type Data = { events: Event[]; tasks: Task[]; configured: boolean };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: 'include', ...init });
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error || 'Request failed');
  return body;
}

export function WebhookActivity({ refreshToken }: { refreshToken: number }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function refresh() {
    const result = await api<Data>('/api/owner/webhooks');
    setData(result);
  }
  useEffect(() => { refresh().catch(cause => setError(cause instanceof Error ? cause.message : 'Could not load webhook activity')); }, [refreshToken]);
  async function run(path: string) {
    setBusy(true); setError('');
    try { await api(path, { method: 'POST' }); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update webhook activity'); }
    finally { setBusy(false); }
  }

  return <section className="mt-12" aria-labelledby="webhook-title"><p className="eyebrow">Integrations</p><h2 id="webhook-title" className="mt-2 text-2xl font-semibold">Inbound webhooks</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">A configured sender can request an owner follow-up for an existing booking. Signed events are deduplicated and recorded; no external message is sent.</p>
    {error && <p className="mt-4 text-sm text-red-700" role="alert">{error}</p>}
    {!data ? <p className="mt-4 text-sm" role="status">Loading webhook activity…</p> : <><p className="mt-4 text-sm font-medium text-slate-600">Integration: {data.configured ? 'configured' : 'disabled until a server secret is set'}</p><div className="mt-5 grid gap-4 lg:grid-cols-2"><div className="rounded-2xl bg-white p-6"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">Follow-up tasks</h3></div>{data.tasks.length ? <ul className="mt-4 space-y-3">{data.tasks.map(task => <li key={task.id} className="rounded-xl border border-slate-100 p-4 text-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><strong>{task.title}</strong><p className="mt-1 text-slate-600">{task.reference} · {task.state}</p></div>{task.state === 'open' && <button disabled={busy} onClick={() => void run(`/api/owner/tasks/${task.id}/complete`)} className="rounded-full border border-pine px-4 py-2 font-semibold text-pine disabled:opacity-50">Mark done</button>}</div></li>)}</ul> : <p className="mt-4 text-sm text-slate-600">No follow-up tasks.</p>}</div><div className="rounded-2xl bg-white p-6"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">Recent signed events</h3><button disabled={busy} onClick={() => void run('/api/owner/webhooks/run')} className="rounded-full border border-pine px-4 py-2 text-sm font-semibold text-pine disabled:opacity-50">Retry pending</button></div>{data.events.length ? <ul className="mt-4 space-y-3">{data.events.map(event => <li key={event.external_id} className="rounded-xl border border-slate-100 p-4 text-sm"><strong>{event.reference}</strong><p className="mt-1 text-slate-600">{event.event_type} · {event.state} · {event.attempts} attempt{event.attempts === 1 ? '' : 's'}</p>{event.last_error && <p className="mt-1 text-red-700">{event.last_error}</p>}</li>)}</ul> : <p className="mt-4 text-sm text-slate-600">No signed events received.</p>}</div></div></>}
  </section>;
}
