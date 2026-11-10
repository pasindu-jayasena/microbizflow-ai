import { useEffect, useState } from 'react';

type Service = { id: string; name: string; description: string; duration_min: number; price_minor: number; active: number };
type Hours = { weekday: number; open_min: number; close_min: number };
const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
const time = (value: number) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: 'include', ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error || 'Could not save changes');
  return body;
}

function ServiceEditor({ item, currency, saved }: { item?: Service; currency: string; saved: () => Promise<void> }) {
  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [duration, setDuration] = useState(item?.duration_min ?? 45);
  const [price, setPrice] = useState(item ? (item.price_minor / 100).toFixed(2) : '0.00');
  const [active, setActive] = useState(Boolean(item?.active ?? true));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const amount = Number(price);
      if (!Number.isFinite(amount) || amount < 0 || !/^\d+(\.\d{1,2})?$/.test(price)) throw new Error('Enter a valid price with up to two decimals.');
      await api(item ? `/api/owner/services/${encodeURIComponent(item.id)}` : '/api/owner/services', {
        method: item ? 'PATCH' : 'POST',
        body: JSON.stringify({ name, description, durationMin: duration, priceMinor: Math.round(amount * 100), active }),
      });
      await saved();
      setMessage(item ? 'Service saved.' : 'Service added.');
      if (!item) { setName(''); setDescription(''); setDuration(45); setPrice('0.00'); }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save service.'); }
    finally { setBusy(false); }
  }

  return <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5">
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-medium">Service name<input className="field mt-2" required minLength={2} maxLength={100} value={name} onChange={event => setName(event.target.value)} /></label>
      <label className="text-sm font-medium">Duration (minutes)<input className="field mt-2" type="number" min={15} max={480} step={15} required value={duration} onChange={event => setDuration(Number(event.target.value))} /></label>
      <label className="text-sm font-medium sm:col-span-2">Description<textarea className="field mt-2 min-h-20" required minLength={2} maxLength={500} value={description} onChange={event => setDescription(event.target.value)} /></label>
      <label className="text-sm font-medium">Price ({currency})<input className="field mt-2" type="text" inputMode="decimal" required value={price} onChange={event => setPrice(event.target.value)} /></label>
      {item && <label className="flex items-center gap-3 text-sm font-medium"><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} /> Available to book</label>}
    </div>
    <div className="mt-4 flex flex-wrap items-center gap-4"><button className="rounded-full bg-pine px-5 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={busy} type="submit">{busy ? 'Saving…' : item ? 'Save service' : 'Add service'}</button>{message && <p className="text-sm" role="status">{message}</p>}</div>
  </form>;
}

function HoursEditor({ weekday, value, saved }: { weekday: number; value?: Hours; saved: () => Promise<void> }) {
  const [closed, setClosed] = useState(!value);
  const [open, setOpen] = useState(time(value?.open_min ?? 540));
  const [close, setClose] = useState(time(value?.close_min ?? 1020));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      await api(`/api/owner/hours/${weekday}`, { method: 'PUT', body: JSON.stringify(closed ? { closed: true } : { closed: false, openMin: minutes(open), closeMin: minutes(close) }) });
      await saved(); setMessage('Hours saved.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save hours.'); }
    finally { setBusy(false); }
  }

  return <form onSubmit={submit} className="flex flex-wrap items-end gap-3 border-b border-slate-100 py-4 last:border-0">
    <strong className="w-24 pb-2 text-sm">{days[weekday]}</strong>
    <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={closed} onChange={event => setClosed(event.target.checked)} /> Closed</label>
    {!closed && <><label className="text-xs text-slate-600">Opens<input aria-label={`${days[weekday]} opens`} className="field mt-1" type="time" step={900} required value={open} onChange={event => setOpen(event.target.value)} /></label><label className="text-xs text-slate-600">Closes<input aria-label={`${days[weekday]} closes`} className="field mt-1" type="time" step={900} required value={close} onChange={event => setClose(event.target.value)} /></label></>}
    <button className="rounded-full border border-pine px-4 py-2 text-sm font-semibold text-pine disabled:opacity-50" disabled={busy} type="submit">{busy ? 'Saving…' : 'Save day'}</button>
    {message && <span className="text-sm" role="status">{message}</span>}
  </form>;
}

export function OwnerSettings() {
  const [services, setServices] = useState<Service[]>([]);
  const [hours, setHours] = useState<Hours[]>([]);
  const [currency, setCurrency] = useState('LKR');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  async function refresh() {
    const [data, catalogue] = await Promise.all([
      api<{ services: Service[]; hours: Hours[] }>('/api/owner/config'),
      api<{ business: { currency: string } }>('/api/business'),
    ]);
    setServices(data.services); setHours(data.hours);
    setCurrency(catalogue.business.currency);
  }
  useEffect(() => { refresh().catch(cause => setError(cause instanceof Error ? cause.message : 'Could not load settings.')).finally(() => setLoading(false)); }, []);

  return <section className="mt-12 space-y-10" aria-labelledby="settings-title">
    <div><p className="eyebrow">Business settings</p><h2 id="settings-title" className="mt-2 text-2xl font-semibold">Services and working hours</h2><p className="mt-2 text-sm text-slate-600">Changes to services and hours affect new requests. Existing appointments keep their recorded time. Review current bookings before changing service details.</p></div>
    {loading ? <p role="status">Loading settings…</p> : error ? <p role="alert" className="text-red-700">{error}</p> : <>
      <div><h3 className="mb-4 text-xl font-semibold">Services</h3><div className="grid gap-4 lg:grid-cols-2">{services.map(item => <ServiceEditor key={item.id} item={item} currency={currency} saved={refresh} />)}<ServiceEditor currency={currency} saved={refresh} /></div></div>
      <div><h3 className="mb-4 text-xl font-semibold">Working hours</h3><div className="rounded-2xl bg-white px-5">{days.map((_, weekday) => <HoursEditor key={weekday} weekday={weekday} value={hours.find(item => item.weekday === weekday)} saved={refresh} />)}</div></div>
    </>}
  </section>;
}
