import { useEffect, useState } from 'react';

type AnalyticsData = {
  appointments: { total: number; pending: number; confirmed: number; declined: number; cancelled: number; completed: number; conversionRate: number | null; avgDecisionMinutes: number | null };
  popularServices: { name: string; bookings: number }[];
  workflows: { total: number; done: number; failed: number; successRate: number | null };
};
const percent = (value: number | null) => value === null ? '—' : `${Math.round(value * 100)}%`;

export function Analytics({ refreshToken }: { refreshToken: number }) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    fetch('/api/owner/analytics', { credentials: 'include' }).then(async response => {
      const body = await response.json() as AnalyticsData & { error?: string };
      if (!response.ok) throw new Error(body.error || 'Unable to load analytics');
      return body;
    }).then(body => { if (active) { setData(body); setError(''); } })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load analytics'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refreshToken]);

  const statuses = data ? ([['Pending', data.appointments.pending], ['Confirmed', data.appointments.confirmed], ['Declined', data.appointments.declined], ['Cancelled', data.appointments.cancelled], ['Completed', data.appointments.completed]] as const) : [];
  return <section className="mt-12" aria-labelledby="analytics-title">
    <p className="eyebrow">Performance</p><h2 id="analytics-title" className="mt-2 text-2xl font-semibold">Analytics</h2>
    <p className="mt-2 text-sm text-slate-600">These figures come from stored demo appointments and workflow events. They include synthetic test bookings.</p>
    {loading ? <p role="status" className="mt-5 text-sm">Loading analytics…</p> : error ? <p role="alert" className="mt-5 text-sm text-red-700">{error}</p> : data && <>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {([['Booking requests', data.appointments.total], ['Confirmed or completed', data.appointments.confirmed + data.appointments.completed], ['Conversion rate', percent(data.appointments.conversionRate)], ['Workflow success', percent(data.workflows.successRate)]] as const).map(([label, value]) => <div key={label} className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{label}</p><p className="mt-3 text-3xl font-semibold text-pine">{value}</p></div>)}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2"><div className="rounded-2xl bg-white p-6"><h3 className="font-semibold">Booking outcomes</h3><div className="mt-5 space-y-3">{statuses.map(([label, count]) => <div key={label}><div className="flex justify-between text-sm"><span>{label}</span><strong>{count}</strong></div><div className="mt-1 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-pine" style={{ width: `${data.appointments.total ? count / data.appointments.total * 100 : 0}%` }} /></div></div>)}</div></div>
        <div className="rounded-2xl bg-white p-6"><h3 className="font-semibold">Operations</h3><dl className="mt-5 space-y-3 text-sm"><div className="flex justify-between"><dt>Average time to a decision</dt><dd className="font-semibold">{data.appointments.avgDecisionMinutes === null ? '—' : `${Math.round(data.appointments.avgDecisionMinutes)} min`}</dd></div><div className="flex justify-between"><dt>Workflow events completed</dt><dd className="font-semibold">{data.workflows.done} / {data.workflows.total}</dd></div><div className="flex justify-between"><dt>Failed workflow events</dt><dd className="font-semibold">{data.workflows.failed}</dd></div></dl><h3 className="mt-7 font-semibold">Popular services</h3>{data.popularServices.length ? <ol className="mt-3 space-y-2">{data.popularServices.map(service => <li className="flex justify-between text-sm" key={service.name}><span>{service.name}</span><strong>{service.bookings}</strong></li>)}</ol> : <p className="mt-3 text-sm text-slate-600">No bookings yet.</p>}</div>
      </div>
    </>}
  </section>;
}
