import { useEffect, useMemo, useState } from 'react';
import { Temporal } from '@js-temporal/polyfill';
import { BookingStatus } from './BookingStatus';

type Service = { id: string; name: string; description: string; duration_min: number; price_minor: number };
type Hours = { weekday: number; open_min: number; close_min: number };
type Business = { slug: string; name: string; description: string; timezone: string; currency: string; address: string; phone: string };
type Catalogue = { business: Business; services: Service[]; hours: Hours[]; aiAvailable?: boolean };
type BookingResult = { reference: string; status: string; cancellationCode: string };
type Analysis = { intent: { serviceId: string | null; date: string | null; time: string | null; language: string; missing: string[]; clarification: string | null }; mode: 'demo' | 'cloudflare' | 'fallback'; latencyMs: number };

const API = import.meta.env.VITE_API_BASE_URL?.trim() ?? '';
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const money = (amount: number, currency: string) => new Intl.NumberFormat('en-LK', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount / 100);
const clock = (minutes: number) => new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 0, 1, Math.floor(minutes / 60), minutes % 60)));
const labelTime = (time: string) => clock(Number(time.slice(0, 2)) * 60 + Number(time.slice(3)));

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error || 'Please try again.');
  return body;
}

export function App() {
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [loadError, setLoadError] = useState('');
  const [selected, setSelected] = useState('');
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState<string[]>([]);
  const [time, setTime] = useState('');
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotError, setSlotError] = useState('');
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [result, setResult] = useState<BookingResult | null>(null);
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [enquiry, setEnquiry] = useState('');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analysisError, setAnalysisError] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [consentExternalAI, setConsentExternalAI] = useState(false);

  useEffect(() => {
    api<Catalogue>('/api/business').then(data => {
      setCatalogue(data);
      setSelected(data.services[0]?.id ?? '');
      setDate(Temporal.Now.zonedDateTimeISO(data.business.timezone).toPlainDate().toString());
    }).catch(error => setLoadError(error instanceof Error ? error.message : 'Unable to load services.'));
  }, []);

  useEffect(() => {
    if (!catalogue || !selected || !date) return;
    const controller = new AbortController();
    setSlotsLoading(true); setSlotError(''); setTime(''); setSlots([]);
    api<{ slots: string[] }>(`/api/availability?serviceId=${encodeURIComponent(selected)}&date=${encodeURIComponent(date)}`, { signal: controller.signal })
      .then(data => setSlots(data.slots))
      .catch(error => { if (!controller.signal.aborted) setSlotError(error instanceof Error ? error.message : 'Unable to load times.'); })
      .finally(() => { if (!controller.signal.aborted) setSlotsLoading(false); });
    return () => controller.abort();
  }, [catalogue, selected, date]);

  const service = useMemo(() => catalogue?.services.find(item => item.id === selected), [catalogue, selected]);
  const today = catalogue ? Temporal.Now.zonedDateTimeISO(catalogue.business.timezone).toPlainDate() : null;
  const minDate = today?.toString();
  const maxDate = today?.add({ days: 60 }).toString();
  const resetRequest = () => { setRequestKey(crypto.randomUUID()); setSubmitError(''); };

  async function analyze() {
    if (!enquiry.trim() || analyzing) return;
    setAnalyzing(true); setAnalysisError(''); setAnalysis(null);
    try {
      const result = await api<Analysis>('/api/enquiries/analyze', { method: 'POST', body: JSON.stringify({ text: enquiry, consentExternalAI }) });
      setAnalysis(result);
    } catch (error) { setAnalysisError(error instanceof Error ? error.message : 'Could not analyze your message.'); }
    finally { setAnalyzing(false); }
  }

  function applyAnalysis() {
    if (!analysis) return;
    if (analysis.intent.serviceId && catalogue?.services.some(item => item.id === analysis.intent.serviceId)) setSelected(analysis.intent.serviceId);
    if (analysis.intent.date) setDate(analysis.intent.date);
    setTime(''); resetRequest();
    document.getElementById('service')?.focus();
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !date || !time || submitting) return;
    setSubmitting(true); setSubmitError('');
    try {
      const booked = await api<BookingResult>('/api/bookings', { method: 'POST', body: JSON.stringify({ serviceId: selected, date, time, customerName: name, customerContact: contact, note, idempotencyKey: requestKey }) });
      setResult(booked);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Could not send your request.');
      if (error instanceof Error && error.message.includes('unavailable')) {
        setTime('');
        try {
          const current = await api<{ slots: string[] }>(`/api/availability?serviceId=${encodeURIComponent(selected)}&date=${encodeURIComponent(date)}`);
          setSlots(current.slots);
        } catch { /* The submission error remains visible. */ }
      }
    } finally { setSubmitting(false); }
  }

  if (loadError) return <main className="min-h-screen bg-cream px-6 py-20 text-ink"><div className="mx-auto max-w-xl rounded-2xl bg-white p-8 shadow-sm"><h1 className="text-2xl font-semibold">Service unavailable</h1><p className="mt-3 text-slate-600">{loadError}</p><button className="button-primary mt-6" onClick={() => location.reload()}>Try again</button></div></main>;
  if (!catalogue) return <main className="grid min-h-screen place-items-center bg-cream text-ink" role="status">Loading the booking page…</main>;

  return <div className="min-h-screen bg-cream text-ink">
    <header className="border-b border-ink/10 bg-cream/95">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <a className="text-lg font-bold tracking-tight" href="#top">HARBOUR<span className="text-pine">CUT</span><span className="ml-2 align-top text-[10px] font-medium tracking-[.2em] text-slate-500">STUDIO</span></a>
        <a className="rounded-full border border-pine px-5 py-2 text-sm font-semibold text-pine transition hover:bg-mint focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine" href="#booking">Book a visit</a>
      </div>
    </header>

    <main id="top">
      <section className="mx-auto grid max-w-6xl gap-10 px-5 pb-16 pt-14 sm:px-8 md:grid-cols-[1.1fr_.9fr] md:items-center md:pb-24 md:pt-24">
        <div>
          <p className="mb-5 text-xs font-bold uppercase tracking-[.25em] text-pine">A little time for yourself</p>
          <h1 className="max-w-2xl text-5xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">Good cuts. <span className="text-pine">Good timing.</span></h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-slate-600">{catalogue.business.description} Choose a service, find a time, and we’ll review your request.</p>
          <a className="button-primary mt-8 inline-flex" href="#booking">Find your time <span aria-hidden="true" className="ml-3">↗</span></a>
          <p className="mt-5 text-sm text-slate-500">Colombo, Sri Lanka · Times shown in {catalogue.business.timezone}</p>
        </div>
        <div className="relative overflow-hidden rounded-[2rem] bg-ink p-9 text-white shadow-xl sm:p-12">
          <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full border-[38px] border-white/10" aria-hidden="true" />
          <div className="absolute -bottom-20 right-8 h-64 w-64 rounded-full border-[28px] border-pine/60" aria-hidden="true" />
          <p className="relative text-xs font-bold uppercase tracking-[.25em] text-emerald-200">Your appointment, simplified</p>
          <p className="relative mt-12 max-w-xs text-4xl font-medium leading-tight">A fresh look starts with a moment that works for you.</p>
          <div className="relative mt-12 flex items-center gap-4 border-t border-white/20 pt-6"><span className="grid h-12 w-12 place-items-center rounded-full bg-white/10 text-2xl" aria-hidden="true">✦</span><span className="text-sm text-white/75">Easy booking · Thoughtful service</span></div>
        </div>
      </section>

      <section className="bg-white py-16 sm:py-20" id="services"><div className="mx-auto max-w-6xl px-5 sm:px-8">
        <p className="eyebrow">What we do</p><div className="mt-3 flex flex-wrap items-end justify-between gap-5"><h2 className="section-title">Services, made simple.</h2><p className="max-w-sm text-slate-500">Straightforward pricing. Time set aside for the details that matter.</p></div>
        <div className="mt-10 grid gap-4 md:grid-cols-3">{catalogue.services.map((item, index) => <article key={item.id} className="flex min-h-56 flex-col rounded-2xl border border-slate-200 bg-cream p-7"><span className="text-xs font-semibold tracking-widest text-pine">0{index + 1} / SERVICE</span><h3 className="mt-8 text-2xl font-semibold">{item.name}</h3><p className="mt-2 flex-1 text-sm leading-6 text-slate-600">{item.description}</p><div className="mt-6 flex items-center justify-between border-t border-slate-200 pt-5 text-sm"><span>{item.duration_min} min</span><strong className="text-base">{money(item.price_minor, catalogue.business.currency)}</strong></div></article>)}</div>
      </div></section>

      <section id="booking" className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[.8fr_1.2fr] lg:gap-20">
        <div><p className="eyebrow">Your next visit</p><h2 className="section-title mt-3">Make time for a good cut.</h2><p className="mt-5 max-w-md leading-7 text-slate-600">Pick an available time and send your request. A booking stays pending until the studio confirms it.</p><div className="mt-8 rounded-2xl border border-ink/10 bg-white p-6"><p className="font-semibold">Opening hours</p><dl className="mt-4 space-y-2 text-sm">{weekdays.map((day, index) => { const entry = catalogue.hours.find(h => h.weekday === index); return <div className="flex justify-between gap-4" key={day}><dt className="text-slate-600">{day}</dt><dd className="font-medium">{entry ? `${clock(entry.open_min)} – ${clock(entry.close_min)}` : 'Closed'}</dd></div>; })}</dl></div><p className="mt-5 text-sm text-slate-500">{catalogue.business.address}</p></div>
        <div className="rounded-3xl bg-white p-6 shadow-[0_12px_50px_rgba(20,40,38,.07)] sm:p-9">
          {result ? <div role="status" className="py-8 text-center"><div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-mint text-3xl text-pine" aria-hidden="true">✓</div><h3 className="mt-6 text-3xl font-semibold">Request received</h3><p className="mt-3 text-slate-600">Your request was sent. Check its latest status below.</p><p className="mt-6 text-xs font-semibold uppercase tracking-widest text-slate-500">Booking reference</p><p className="mt-2 text-2xl font-bold tracking-wide text-pine">{result.reference}</p><p className="mt-4 text-sm text-slate-500">Keep this reference for your records.</p><button type="button" className="button-primary mt-8" onClick={() => { setResult(null); setTime(''); setName(''); setContact(''); setNote(''); resetRequest(); }}>Make another request</button></div> : <form onSubmit={submit}>
            <div className="mb-7 flex items-center justify-between gap-4"><div><p className="eyebrow">Book online</p><h3 className="mt-1 text-2xl font-semibold">Request an appointment</h3></div><span className="rounded-full bg-mint px-3 py-1 text-xs font-semibold text-pine">No payment needed</span></div>
            <div className="mb-7 rounded-2xl border border-emerald-100 bg-mint p-5"><p className="text-sm font-semibold text-pine">Need help finding a time?</p><p className="mt-1 text-sm text-slate-600">Describe your visit in English or Sinhala. We’ll suggest the details we can recognize; you choose the actual booking slot.</p><label className="field-label mt-4" htmlFor="enquiry">Your message</label><textarea className="field min-h-20 resize-y" id="enquiry" maxLength={500} value={enquiry} onChange={event => { setEnquiry(event.target.value); setAnalysis(null); }} placeholder="I need a haircut tomorrow around 5 PM" />{catalogue.aiAvailable && <label className="mt-3 flex items-start gap-2 text-xs leading-5 text-slate-600"><input type="checkbox" className="mt-1 accent-pine" checked={consentExternalAI} onChange={event => setConsentExternalAI(event.target.checked)} /><span>Allow this message to be processed by Cloudflare Workers AI. Obvious contact details are redacted. Avoid personal details.</span></label>}<button type="button" className="mt-4 rounded-full bg-white px-5 py-2 text-sm font-semibold text-pine shadow-sm disabled:opacity-50" onClick={() => void analyze()} disabled={analyzing || enquiry.trim().length < 3}>{analyzing ? 'Reading your message…' : 'Find details'}</button>{analysisError && <p role="alert" className="mt-3 text-sm text-red-700">{analysisError}</p>}{analysis && <div className="mt-4 rounded-xl bg-white p-4 text-sm" role="status"><p className="font-semibold text-pine">{analysis.mode === 'cloudflare' ? 'AI suggestion' : analysis.mode === 'fallback' ? 'Simple suggestion (AI unavailable)' : 'Simple suggestion'}</p><p className="mt-2 text-slate-600">Service: {catalogue.services.find(item => item.id === analysis.intent.serviceId)?.name ?? 'Please choose'} · Date: {analysis.intent.date ?? 'Please choose'} · Time: {analysis.intent.time ? labelTime(analysis.intent.time) : 'Please choose'}</p>{analysis.intent.clarification && <p className="mt-2 text-slate-600">{analysis.intent.clarification}</p>}{(analysis.intent.serviceId || analysis.intent.date) && <button type="button" className="mt-3 font-semibold text-pine underline underline-offset-4" onClick={applyAnalysis}>Use suggested service and date</button>}</div>}</div>
            <label className="field-label" htmlFor="service">Service</label><select className="field" id="service" required value={selected} onChange={event => { setSelected(event.target.value); resetRequest(); }}><option value="" disabled>Choose a service</option>{catalogue.services.map(item => <option key={item.id} value={item.id}>{item.name} · {item.duration_min} min · {money(item.price_minor, catalogue.business.currency)}</option>)}</select>
            <label className="field-label mt-5" htmlFor="date">Date</label><input className="field" id="date" type="date" required min={minDate} max={maxDate} value={date} onChange={event => { setDate(event.target.value); resetRequest(); }} />
            <fieldset className="mt-6"><legend className="field-label">Available times</legend><p className="mb-3 text-xs text-slate-500">{catalogue.business.timezone} · Appointment times are subject to confirmation</p>{slotsLoading ? <p role="status" className="text-sm text-slate-600">Checking available times…</p> : slotError ? <p role="alert" className="text-sm text-red-700">{slotError}</p> : slots.length ? <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">{slots.map(slot => <button key={slot} type="button" aria-pressed={time === slot} className={`rounded-lg border px-2 py-3 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-pine ${time === slot ? 'border-pine bg-pine text-white' : 'border-slate-200 hover:border-pine'}`} onClick={() => { setTime(slot); resetRequest(); }}>{labelTime(slot)}</button>)}</div> : <p className="rounded-lg bg-cream p-4 text-sm text-slate-600">No times available on this date. Please choose another day.</p>}</fieldset>
            <div className="mt-6 grid gap-5 sm:grid-cols-2"><div><label className="field-label" htmlFor="name">Your name</label><input className="field" id="name" autoComplete="name" minLength={2} maxLength={100} required value={name} onChange={event => { setName(event.target.value); resetRequest(); }} /></div><div><label className="field-label" htmlFor="contact">Email or phone</label><input className="field" id="contact" autoComplete="email" minLength={5} maxLength={120} required value={contact} onChange={event => { setContact(event.target.value); resetRequest(); }} /></div></div>
            <label className="field-label mt-5" htmlFor="note">Anything we should know? <span className="font-normal text-slate-500">Optional</span></label><textarea className="field min-h-24 resize-y" id="note" maxLength={500} value={note} onChange={event => { setNote(event.target.value); resetRequest(); }} placeholder="A style or timing preference" />
            {submitError && <p role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">{submitError}</p>}
            <button className="button-primary mt-6 w-full justify-center disabled:cursor-not-allowed disabled:opacity-50" type="submit" disabled={!time || submitting}>{submitting ? 'Sending request…' : service ? `Request ${service.name}` : 'Request appointment'}</button>
            <p className="mt-4 text-center text-xs leading-5 text-slate-500">Fictional demonstration business. Please do not enter real personal details.</p>
          </form>}
          {result && <div className="mt-5 rounded-xl bg-cream p-4 text-sm"><p className="font-semibold text-ink">Private cancellation code</p><p className="mt-1 break-all font-mono text-pine">{result.cancellationCode}</p><p className="mt-2 text-slate-600">Save this code with your reference. Anyone with both can check or cancel this booking.</p></div>}
        </div>
      </section>
      <BookingStatus booking={result} timezone={catalogue.business.timezone} />
    </main>
    <footer className="bg-ink px-5 py-8 text-center text-sm text-white/70"><p>Harbour Cut Studio is a fictional MicroBizFlow AI demonstration business.</p><p className="mt-1">No real messages are sent from this site. <a className="underline underline-offset-4" href="/owner">Owner sign in</a></p></footer>
  </div>;
}
