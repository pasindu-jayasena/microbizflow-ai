import { useState } from 'react';

type Status = 'pending' | 'confirmed' | 'declined' | 'cancelled';
type Sample = { reference: string; service: string; time: string; status: Status };

const samples: Sample[] = [
  { reference: 'SAMPLE-001', service: 'Signature haircut', time: 'Tomorrow · 10:00 AM', status: 'pending' },
  { reference: 'SAMPLE-002', service: 'Beard shaping', time: 'Tomorrow · 11:30 AM', status: 'confirmed' },
  { reference: 'SAMPLE-003', service: 'Cut + beard', time: 'In 2 days · 2:00 PM', status: 'pending' },
  { reference: 'SAMPLE-004', service: 'Signature haircut', time: 'In 3 days · 9:00 AM', status: 'cancelled' },
];

export function OwnerPreview() {
  const [appointments, setAppointments] = useState<Sample[]>(samples);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('');
  const [notice, setNotice] = useState('');
  const visible = appointments.filter(item => (!filter || item.status === filter)
    && (!query || (item.reference + ' ' + item.service).toLowerCase().includes(query.toLowerCase().trim())));
  const count = (status: Status) => appointments.filter(item => item.status === status).length;

  function changeStatus(reference: string, status: Status) {
    setAppointments(current => current.map(item => item.reference === reference ? { ...item, status } : item));
    setNotice(reference + ' changed in this preview only. No database record was updated.');
  }

  return <div className="min-h-screen bg-cream text-ink">
    <header className="border-b border-ink/10 bg-white"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
      <a className="text-xl font-bold tracking-tight" href="/">MicroBizFlow AI</a>
      <nav className="flex gap-5 text-sm font-semibold text-pine"><a href="/">Customer site</a><a href="/owner">Owner sign in</a></nav>
    </div></header>
    <main className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div><p className="eyebrow">Interactive sample · fictional data</p><h1 className="section-title mt-3">Owner workspace preview</h1>
          <p className="mt-4 max-w-2xl text-slate-600">Explore appointment review with four sample records. Changes live only in this browser tab and reset when you reload. This page never reads customer records.</p></div>
        <button type="button" className="rounded-full border border-pine px-5 py-2 text-sm font-semibold text-pine" onClick={() => { setAppointments(samples); setNotice('Sample records restored.'); }}>Reset preview</button>
      </div>
      <div className="mt-8 rounded-2xl border border-emerald-100 bg-mint p-5 text-sm leading-6 text-pine">
        The real owner dashboard requires sign in. Its appointments, customers, settings, and actions are separate from this preview.
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[
        ['Sample requests', appointments.length], ['Pending', count('pending')], ['Confirmed', count('confirmed')], ['Cancelled', count('cancelled')],
      ].map(([label, value]) => <div key={label} className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold text-pine">{value}</p></div>)}</div>
      <div className="mt-8 flex flex-wrap items-end gap-4 rounded-2xl bg-white p-5">
        <label className="min-w-48 flex-1 text-sm font-medium" htmlFor="preview-search">Search sample requests<input id="preview-search" className="field mt-2" value={query} onChange={event => setQuery(event.target.value)} placeholder="Service or sample reference" /></label>
        <label className="min-w-40 text-sm font-medium" htmlFor="preview-status">Status<select id="preview-status" className="field mt-2" value={filter} onChange={event => setFilter(event.target.value)}><option value="">All statuses</option><option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="declined">Declined</option><option value="cancelled">Cancelled</option></select></label>
      </div>
      {notice && <p role="status" className="mt-5 rounded-xl bg-mint p-4 text-sm text-pine">{notice}</p>}
      <div className="mt-8"><h2 className="text-xl font-semibold">Sample appointments</h2>
        <div className="mt-4 space-y-3">{visible.length ? visible.map(item => <article key={item.reference} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white p-5 shadow-sm">
          <div><div className="flex items-center gap-3"><h3 className="font-semibold">{item.service}</h3><span className={item.status === 'pending' ? 'rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800' : 'rounded-full bg-mint px-3 py-1 text-xs font-semibold text-pine'}>{item.status}</span></div>
            <p className="mt-2 text-sm text-slate-600">{item.time} · {item.reference}</p><p className="mt-1 text-xs text-slate-500">Fictional sample; no customer contact shown</p></div>
          <div className="flex gap-2">{item.status === 'pending' && <><button type="button" className="rounded-full bg-pine px-4 py-2 text-sm font-semibold text-white" onClick={() => changeStatus(item.reference, 'confirmed')}>Confirm</button><button type="button" className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold" onClick={() => changeStatus(item.reference, 'declined')}>Decline</button></>}{item.status === 'confirmed' && <button type="button" className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold" onClick={() => changeStatus(item.reference, 'cancelled')}>Cancel</button>}</div>
        </article>) : <p className="rounded-2xl bg-white p-8 text-sm text-slate-600">No sample appointments match those filters.</p>}</div>
      </div>
    </main>
  </div>;
}
