import { useEffect, useState } from 'react';

type Customer = { contact_key: string; display_name: string; contact: string; notes: string; booking_count: number; last_start_at: string | null };
type Visit = { reference: string; start_at: string; status: string; service_name: string };
type Detail = { customer: Customer; appointments: Visit[] };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: 'include', ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error || 'Could not load customer records');
  return body;
}

export function Customers({ timezone }: { timezone: string }) {
  const [query, setQuery] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function search(term: string) {
    setLoading(true); setError('');
    try { const result = await api<{ customers: Customer[] }>(`/api/owner/customers?q=${encodeURIComponent(term)}`); setCustomers(result.customers); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not search customers'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void search(''); }, []);

  async function open(contactKey: string) {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await api<Detail>(`/api/owner/customers/${encodeURIComponent(contactKey)}`);
      setDetail(result); setNotes(result.customer.notes);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load customer history'); }
    finally { setBusy(false); }
  }

  async function saveNotes(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!detail) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await api(`/api/owner/customers/${encodeURIComponent(detail.customer.contact_key)}`, { method: 'PATCH', body: JSON.stringify({ notes }) });
      setDetail({ ...detail, customer: { ...detail.customer, notes } });
      setMessage('Private note saved.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save note'); }
    finally { setBusy(false); }
  }

  async function deleteCustomer() {
    if (!detail || !window.confirm(`Delete ${detail.customer.display_name}'s customer record and remove personal details from ${detail.appointments.length} booking(s)? This cannot be undone. Pending or confirmed bookings must be resolved first.`)) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await api(`/api/owner/customers/${encodeURIComponent(detail.customer.contact_key)}`, { method: 'DELETE' });
      setDetail(null); setNotes('');
      await search(query);
      setMessage('Customer details deleted. Booking status and audit counts remain.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not delete customer'); }
    finally { setBusy(false); }
  }

  const format = (iso: string) => new Intl.DateTimeFormat('en-LK', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(new Date(iso));

  return <section className="mt-12" aria-labelledby="customers-title">
    <p className="eyebrow">Customer records</p><h2 id="customers-title" className="mt-2 text-2xl font-semibold">Customers</h2>
    <p className="mt-2 text-sm text-slate-600">Contacts are grouped by their normalized booking contact. Notes are visible only to signed-in owners.</p>
    <form className="mt-5 flex max-w-xl gap-2" onSubmit={event => { event.preventDefault(); void search(query); }}><label className="sr-only" htmlFor="customer-search">Search customers</label><input id="customer-search" className="field" maxLength={100} value={query} onChange={event => setQuery(event.target.value)} placeholder="Name or contact" /><button className="rounded-full bg-pine px-5 py-2 text-sm font-semibold text-white" type="submit">Search</button></form>
    {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="mt-4 text-sm text-pine">{message}</p>}
    {loading ? <p className="mt-5 text-sm text-slate-600" role="status">Loading customers…</p> : customers.length === 0 ? <p className="mt-5 rounded-2xl bg-white p-6 text-slate-600">No customers match this search.</p> : <div className="mt-5 grid gap-3 sm:grid-cols-2">{customers.map(customer => <button key={customer.contact_key} type="button" disabled={busy} onClick={() => void open(customer.contact_key)} className="rounded-2xl bg-white p-5 text-left shadow-sm transition hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-pine"><strong className="block">{customer.display_name}</strong><span className="mt-1 block text-sm text-slate-600">{customer.contact}</span><span className="mt-3 block text-xs text-slate-500">{customer.booking_count} booking{customer.booking_count === 1 ? '' : 's'}{customer.last_start_at ? ` · Latest ${format(customer.last_start_at)}` : ''}</span></button>)}</div>}
    {detail && <div className="mt-6 rounded-2xl border border-pine/20 bg-white p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-xl font-semibold">{detail.customer.display_name}</h3><p className="mt-1 text-sm text-slate-600">{detail.customer.contact}</p></div><button type="button" onClick={() => setDetail(null)} className="text-sm font-semibold text-pine underline">Close details</button></div>
      <form className="mt-6 max-w-2xl" onSubmit={saveNotes}><label htmlFor="customer-notes" className="field-label">Private customer notes</label><textarea id="customer-notes" className="field mt-2 min-h-28" maxLength={1000} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Preferences or follow-up details" /><div className="mt-3 flex items-center gap-3"><button type="submit" disabled={busy} className="rounded-full bg-pine px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">Save note</button></div></form>
      <h4 className="mt-7 font-semibold">Appointment history</h4>{detail.appointments.length === 0 ? <p className="mt-2 text-sm text-slate-600">No appointments recorded.</p> : <ul className="mt-3 divide-y divide-slate-100">{detail.appointments.map(visit => <li key={visit.reference} className="py-3 text-sm"><strong>{visit.service_name}</strong><span className="ml-2 text-slate-600">{format(visit.start_at)} · {visit.status} · {visit.reference}</span></li>)}</ul>}
      <div className="mt-7 border-t border-slate-200 pt-5"><h4 className="font-semibold">Delete customer details</h4><p className="mt-2 text-sm text-slate-600">Removes this contact, private note, and personal details from bookings. Booking status and audit counts stay for reporting. Resolve pending or confirmed bookings first.</p><button type="button" disabled={busy} onClick={() => void deleteCustomer()} className="mt-3 rounded-full border border-red-700 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">Delete customer details</button></div>
    </div>}
  </section>;
}
