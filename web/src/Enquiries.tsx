import { useEffect, useState } from 'react';

type Enquiry = {
  id: string; service_id: string | null; requested_date: string | null; requested_time: string | null;
  language: string; missing_fields: string; mode: string; latency_ms: number; review_state: string;
  created_at: string; reference: string | null; customer_name: string | null; customer_contact: string | null; service_name: string | null;
};

export function Enquiries({ refreshToken }: { refreshToken: number }) {
  const [rows, setRows] = useState<Enquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function refresh() {
    const response = await fetch('/api/owner/enquiries', { credentials: 'include' });
    const body = await response.json() as { enquiries?: Enquiry[]; error?: string };
    if (!response.ok || !body.enquiries) throw new Error(body.error || 'Could not load enquiries');
    setRows(body.enquiries);
  }
  useEffect(() => { refresh().catch(cause => setError(cause instanceof Error ? cause.message : 'Could not load enquiries')).finally(() => setLoading(false)); }, [refreshToken]);
  async function review(id: string) {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/owner/enquiries/${id}/review`, { method: 'POST', credentials: 'include' });
      if (!response.ok) throw new Error('Could not mark enquiry reviewed');
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not review enquiry'); }
    finally { setBusy(false); }
  }

  return <section className="mt-12" aria-labelledby="enquiries-title"><p className="eyebrow">Assistant activity</p><h2 id="enquiries-title" className="mt-2 text-2xl font-semibold">AI enquiries</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Structured suggestions are stored for review. Original message text is not retained. A suggestion is linked to a booking only when the customer submits one.</p>
    {error && <p className="mt-4 text-sm text-red-700" role="alert">{error}</p>}
    {loading ? <p className="mt-4 text-sm" role="status">Loading enquiries…</p> : rows.length === 0 ? <p className="mt-4 rounded-2xl bg-white p-6 text-sm text-slate-600">No assistant enquiries yet.</p> : <div className="mt-5 grid gap-3 lg:grid-cols-2">{rows.map(row => <article key={row.id} className="rounded-2xl bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">{row.service_name ?? 'Service undecided'}</h3><span className="rounded-full bg-mint px-3 py-1 text-xs font-semibold text-pine">{row.review_state}</span></div><p className="mt-2 text-sm text-slate-600">{row.requested_date ?? 'Date missing'} · {row.requested_time ?? 'Time missing'} · {row.language.toUpperCase()}</p><p className="mt-2 text-xs text-slate-500">{row.mode} suggestion · {row.latency_ms} ms{row.missing_fields ? ` · Missing: ${row.missing_fields}` : ''}</p>{row.reference ? <p className="mt-3 text-sm text-slate-600">Linked booking: {row.reference} · {row.customer_name} · {row.customer_contact}</p> : <p className="mt-3 text-sm text-slate-500">No booking linked</p>}{row.review_state === 'pending' && <button type="button" disabled={busy} onClick={() => void review(row.id)} className="mt-4 rounded-full border border-pine px-4 py-2 text-sm font-semibold text-pine disabled:opacity-50">Mark reviewed</button>}</article>)}</div>}
  </section>;
}
