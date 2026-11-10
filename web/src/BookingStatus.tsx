import { useEffect, useState } from 'react';

type Result = { reference: string; status: string; startAt?: string };

export function BookingStatus({ booking, timezone }: { booking: { reference: string; cancellationCode: string } | null; timezone: string }) {
  const [reference, setReference] = useState('');
  const [code, setCode] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (booking) { setReference(booking.reference); setCode(booking.cancellationCode); setResult(null); } }, [booking]);

  async function request(action: 'status' | 'cancel') {
    setBusy(true); setError(''); setResult(null);
    try {
      const response = await fetch(`/api/bookings/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reference: reference.trim().toUpperCase(), cancellationCode: code.trim() }) });
      const body = await response.json() as Result & { error?: string };
      if (!response.ok) throw new Error(body.error || 'Could not find this booking');
      setResult(body);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not find this booking'); }
    finally { setBusy(false); }
  }

  return <section className="mx-auto max-w-6xl px-5 pb-16 sm:px-8" aria-labelledby="booking-status-title"><div className="rounded-3xl border border-ink/10 bg-white p-6 sm:p-9"><h2 id="booking-status-title" className="text-2xl font-semibold">Check or cancel a booking</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Enter the reference and private code shown when you booked. Keep the code private. Online cancellation is available until 30 minutes before the visit.</p>
    <div className="mt-6 grid max-w-2xl gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Booking reference<input className="field mt-2" autoComplete="off" maxLength={12} value={reference} onChange={event => setReference(event.target.value)} placeholder="MBF-1234ABCD" /></label><label className="text-sm font-medium">Private code<input className="field mt-2" autoComplete="off" maxLength={36} value={code} onChange={event => setCode(event.target.value)} placeholder="Code from your confirmation" /></label></div>
    <div className="mt-5 flex flex-wrap gap-3"><button type="button" disabled={busy || !reference || !code} onClick={() => void request('status')} className="rounded-full bg-pine px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Checking…' : 'Check status'}</button><button type="button" disabled={busy || !reference || !code} onClick={() => void request('cancel')} className="rounded-full border border-red-300 px-5 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">Cancel booking</button></div>
    {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}{result && <p role="status" className="mt-4 rounded-xl bg-mint p-4 text-sm text-pine">Booking {result.reference}: <strong>{result.status}</strong>{result.startAt ? ` · ${new Intl.DateTimeFormat('en-LK', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(new Date(result.startAt))}` : ''}</p>}
  </div></section>;
}
