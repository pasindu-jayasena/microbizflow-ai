import { useEffect, useState } from 'react';
import { Automation } from './Automation';
import { OwnerSettings } from './OwnerSettings';
import { Customers } from './Customers';

type Appointment = { id: string; reference: string; start_at: string; end_at: string; status: string; customer_name: string; customer_contact: string; customer_note: string; service_name: string; resource_name: string };
type Summary = { total: number; pending: number; confirmed: number; cancelled: number };
const API = import.meta.env.VITE_API_BASE_URL?.trim() ?? '';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, { credentials: 'include', ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(result.error || 'Request failed');
  return result;
}

export function Owner() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [username, setUsername] = useState('owner');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [timezone, setTimezone] = useState('UTC');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => { api<{ authenticated: boolean }>('/api/owner/session').then(result => setAuthenticated(result.authenticated)).catch(() => { setAuthenticated(false); setError('Owner service is unavailable.'); }); }, []);
  useEffect(() => { if (authenticated) void refresh(); }, [authenticated]);

  async function refresh() {
    setRefreshing(true); setError('');
    try {
      const [bookings, stats, catalogue] = await Promise.all([api<{ appointments: Appointment[] }>('/api/owner/appointments'), api<{ summary: Summary }>('/api/owner/summary'), api<{ business: { timezone: string } }>('/api/business')]);
      setAppointments(bookings.appointments); setSummary(stats.summary); setTimezone(catalogue.business.timezone); setRefreshToken(value => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load appointments.'); }
    finally { setRefreshing(false); }
  }

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try { await api('/api/owner/login', { method: 'POST', body: JSON.stringify({ username, password }) }); setPassword(''); setAuthenticated(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Sign in failed.'); }
    finally { setBusy(false); }
  }

  async function signOut() {
    setBusy(true);
    try { await api('/api/owner/logout', { method: 'POST' }); setAuthenticated(false); setAppointments([]); setSummary(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Sign out failed.'); }
    finally { setBusy(false); }
  }

  async function changeStatus(item: Appointment, status: string) {
    setBusy(true); setError('');
    try { await api(`/api/owner/appointments/${item.id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update appointment.'); }
    finally { setBusy(false); }
  }

  return <div className="min-h-screen bg-cream text-ink"><header className="border-b border-ink/10 bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5 sm:px-8"><a className="text-lg font-bold" href="/">HARBOUR<span className="text-pine">CUT</span> <span className="text-xs font-medium text-slate-500">/ OWNER</span></a>{authenticated && <button className="text-sm font-semibold text-pine underline underline-offset-4 disabled:opacity-50" onClick={signOut} disabled={busy}>Sign out</button>}</div></header>
    {authenticated === null ? <main className="mx-auto max-w-6xl px-5 py-20" role="status">Checking your session…</main> : !authenticated ? <main className="mx-auto max-w-md px-5 py-20"><p className="eyebrow">Private workspace</p><h1 className="section-title mt-3">Welcome back.</h1><p className="mt-4 text-slate-600">Sign in to review and manage appointment requests.</p><form className="mt-8 rounded-2xl bg-white p-7 shadow-sm" onSubmit={signIn}><label htmlFor="username" className="field-label">Username</label><input className="field" id="username" autoComplete="username" required value={username} onChange={event => setUsername(event.target.value)} /><label htmlFor="password" className="field-label mt-5">Password</label><input className="field" id="password" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} />{error && <p className="mt-4 text-sm text-red-700" role="alert">{error}</p>}<button className="button-primary mt-6 w-full disabled:opacity-50" disabled={busy} type="submit">{busy ? 'Signing in…' : 'Sign in'}</button></form><p className="mt-6 text-sm text-slate-500">This demonstration uses fictional business data only.</p></main> : <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">Owner workspace</p><h1 className="section-title mt-2">Appointments</h1><p className="mt-3 text-slate-600">Review requests and keep the day moving.</p></div><button className="rounded-full border border-pine px-5 py-2 text-sm font-semibold text-pine disabled:opacity-50" onClick={() => void refresh()} disabled={refreshing}>Refresh</button></div>
      {error && <div className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</div>}
      {summary && <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">{([['Total requests', summary.total], ['Pending', summary.pending], ['Confirmed', summary.confirmed], ['Cancelled', summary.cancelled]] as const).map(([label, value]) => <div key={label} className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{label}</p><p className="mt-3 text-3xl font-semibold text-pine">{value}</p></div>)}</div>}
      <div className="mt-9"><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-semibold">Recent requests</h2>{refreshing && <span className="text-sm text-slate-500" role="status">Updating…</span>}</div>{appointments.length === 0 ? <div className="rounded-2xl bg-white p-10 text-center text-slate-600">No appointment requests yet. New requests will appear here.</div> : <div className="space-y-3">{appointments.map(item => <article key={item.id} className="grid gap-5 rounded-2xl bg-white p-5 shadow-sm sm:grid-cols-[1fr_auto] sm:items-center"><div><div className="flex flex-wrap items-center gap-3"><h3 className="font-semibold">{item.customer_name}</h3><span className={`rounded-full px-3 py-1 text-xs font-semibold ${item.status === 'pending' ? 'bg-amber-50 text-amber-800' : 'bg-mint text-pine'}`}>{item.status}</span></div><p className="mt-2 text-sm text-slate-600">{item.service_name} · {new Intl.DateTimeFormat('en-LK', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(new Date(item.start_at))} · {item.resource_name}</p><p className="mt-1 text-sm text-slate-600">{item.customer_contact} · {item.reference}</p>{item.customer_note && <p className="mt-2 text-sm text-slate-500">{item.customer_note}</p>}</div><div className="flex flex-wrap gap-2">{item.status === 'pending' && <><button disabled={busy} onClick={() => void changeStatus(item, 'confirmed')} className="rounded-full bg-pine px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Confirm</button><button disabled={busy} onClick={() => void changeStatus(item, 'declined')} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">Decline</button></>}{item.status === 'confirmed' && <><button disabled={busy} onClick={() => void changeStatus(item, 'completed')} className="rounded-full bg-pine px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Complete</button><button disabled={busy} onClick={() => void changeStatus(item, 'cancelled')} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">Cancel</button></>}</div></article>)}</div>}</div>
      <p className="mt-8 text-xs text-slate-500">Showing the latest 100 requests. All metrics are calculated from stored appointments.</p>
      <Automation refreshToken={refreshToken} />
      <Customers timezone={timezone} />
      <OwnerSettings />
    </main>}
  </div>;
}
