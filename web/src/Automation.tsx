import { useEffect, useState } from 'react';

type Notice = { id: number; event_key: string; reference: string; kind: 'owner_notice' | 'customer_draft'; body: string; state: string; attempts: number; created_at: string; appointment_status: string; start_at: string };
type Workflow = { event_key: string; reference: string; kind: string; subject_status: string; state: string; attempts: number; last_error: string | null; created_at: string };
const API = import.meta.env.VITE_API_BASE_URL?.trim() ?? '';
const actionable = (item: Notice) => !item.event_key.endsWith(':reminder') || (item.appointment_status === 'confirmed' && new Date(item.start_at).getTime() > Date.now());

async function ownerApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, { credentials: 'include', ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error || 'Request failed');
  return body;
}

export function Automation({ refreshToken }: { refreshToken: number }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function reload() {
    setLoading(true); setError('');
    try {
      const [n, w] = await Promise.all([ownerApi<{ notifications: Notice[] }>('/api/owner/notifications'), ownerApi<{ workflows: Workflow[] }>('/api/owner/workflows')]);
      setNotices(n.notifications); setWorkflows(w.workflows);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load activity.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void reload(); }, [refreshToken]);

  async function act(id: number, action: 'approve' | 'retry') {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await ownerApi<{ mockDelivered: boolean }>(`/api/owner/notifications/${id}/${action}`, { method: 'POST' });
      setMessage(result.mockDelivered ? 'Recorded in the mock outbox. No real message was sent.' : 'Delivery failed; review and retry the notification.');
      await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update notification.'); }
    finally { setBusy(false); }
  }

  async function runPending() {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await ownerApi<{ processed: number; failed: number }>('/api/owner/workflows/run', { method: 'POST' });
      setMessage(`Processed ${result.processed} workflow event${result.processed === 1 ? '' : 's'}; ${result.failed} failed.`);
      await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not process workflows.'); }
    finally { setBusy(false); }
  }

  async function prepareReminders() {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await ownerApi<{ queued: number }>('/api/owner/reminders/run', { method: 'POST' });
      setMessage(`Prepared ${result.queued} upcoming reminder${result.queued === 1 ? '' : 's'} for review. No real message was sent.`);
      await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not prepare reminders.'); }
    finally { setBusy(false); }
  }

  return <section className="mt-12 border-t border-ink/10 pt-10" aria-labelledby="automation-heading">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="eyebrow">AI & automation · human review</p><h2 id="automation-heading" className="mt-2 text-2xl font-semibold">Notifications & workflow activity</h2></div><div className="flex flex-wrap gap-2"><button className="rounded-full border border-pine px-5 py-2 text-sm font-semibold text-pine disabled:opacity-50" type="button" disabled={busy} onClick={() => void prepareReminders()}>Prepare reminders</button><button className="rounded-full border border-pine px-5 py-2 text-sm font-semibold text-pine disabled:opacity-50" type="button" disabled={busy} onClick={() => void runPending()}>Process pending events</button></div></div>
    <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">Assistant suggestions and booking events can prepare customer drafts, but you approve them before mock delivery. No external AI model, real email, or SMS is connected in this public demo.</p>
    {error && <p role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="mt-5 rounded-lg bg-mint p-3 text-sm text-pine">{message}</p>}
    {loading ? <p role="status" className="mt-7 text-sm text-slate-600">Loading activity…</p> : <div className="mt-7 grid gap-7 lg:grid-cols-2">
      <div><h3 className="text-lg font-semibold">Notification queue</h3>{notices.length === 0 ? <p className="mt-3 rounded-xl bg-white p-5 text-sm text-slate-600">No notifications yet.</p> : <div className="mt-3 space-y-3">{notices.map(item => <article key={item.id} className="rounded-xl bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-semibold uppercase tracking-wide text-pine">{item.kind === 'customer_draft' ? 'Customer draft' : 'Internal notice'}</span><span className="text-xs text-slate-500">{item.state.replace('_', ' ')}</span></div><p className="mt-2 text-sm font-medium">{item.body}</p><p className="mt-2 text-xs text-slate-500">{item.reference} · Attempts: {item.attempts}</p>{item.state === 'needs_approval' && actionable(item) && <button className="mt-4 rounded-full bg-pine px-4 py-2 text-xs font-semibold text-white disabled:opacity-50" disabled={busy} onClick={() => void act(item.id, 'approve')}>Approve & record mock delivery</button>}{(item.state === 'failed' || item.state === 'approved') && actionable(item) && <button className="mt-4 rounded-full border border-pine px-4 py-2 text-xs font-semibold text-pine disabled:opacity-50" disabled={busy} onClick={() => void act(item.id, 'retry')}>Retry mock delivery</button>}{!actionable(item) && <p className="mt-3 text-xs text-slate-500">This reminder is no longer eligible for delivery.</p>}</article>)}</div>}</div>
      <div><h3 className="text-lg font-semibold">Workflow activity</h3>{workflows.length === 0 ? <p className="mt-3 rounded-xl bg-white p-5 text-sm text-slate-600">No workflow events yet.</p> : <div className="mt-3 space-y-3">{workflows.map(item => <article key={item.event_key} className="flex items-center justify-between gap-4 rounded-xl bg-white p-5 shadow-sm"><div><p className="text-sm font-medium">{item.reference} · {item.kind.replace('_', ' ')}</p><p className="mt-1 text-xs text-slate-500">{item.subject_status} · Attempt {item.attempts}{item.last_error ? ` · ${item.last_error}` : ''}</p></div><span className="rounded-full bg-cream px-3 py-1 text-xs font-semibold text-pine">{item.state}</span></article>)}</div>}</div>
    </div>}
  </section>;
}
