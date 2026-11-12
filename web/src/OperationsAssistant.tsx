import { useEffect, useState } from 'react';

type Answer={answer:string;intent:string;mode:'rules'|'llm'|'fallback';latencyMs:number;proposalId:string|null};
type Proposal={id:string;service_name:string;old_price_minor:number;new_price_minor:number;state:string;created_at:string};
type Run={id:string;actor:string;intent:string;mode:string;latency_ms:number;created_at:string};
type History={runs:Run[];proposals:Proposal[]};
const suggestions=['How many pending appointments?','How many upcoming visits?','List service prices','Show failed CRM sync events'];

async function api<T>(path:string,init?:RequestInit):Promise<T> {
  const response=await fetch(path,{credentials:'include',...init,headers:{'Content-Type':'application/json',...init?.headers}});
  const body=await response.json() as T & {error?:string};
  if (!response.ok) throw new Error(body.error||'Assistant request failed');
  return body;
}

export function OperationsAssistant({refreshToken}:{refreshToken:number}) {
  const [question,setQuestion]=useState('');
  const [answer,setAnswer]=useState<Answer|null>(null);
  const [history,setHistory]=useState<History|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  async function reload(){setHistory(await api<History>('/api/owner/assistant/history'));}
  useEffect(()=>{void reload().catch(cause=>setError(cause instanceof Error?cause.message:'Could not load assistant history'));},[refreshToken]);

  async function ask(text=question){
    setBusy(true);setError('');setMessage('');
    try {
      const result=await api<Answer>('/api/owner/assistant/query',{method:'POST',body:JSON.stringify({question:text})});
      setAnswer(result);setQuestion(text);await reload();
    } catch(cause){setError(cause instanceof Error?cause.message:'Could not answer request');}
    finally{setBusy(false);}
  }
  async function decide(id:string,choice:'approve'|'reject'){
    setBusy(true);setError('');setMessage('');
    try {
      await api(`/api/owner/assistant/proposals/${id}/${choice}`,{method:'POST'});
      setMessage(choice==='approve'?'Price change approved and applied.':'Price change rejected.');
      await reload();
    } catch(cause){setError(cause instanceof Error?cause.message:'Could not review proposal');}
    finally{setBusy(false);}
  }
  return <section className="mt-12 rounded-[2rem] bg-ink p-6 text-white sm:p-8" aria-labelledby="operations-assistant-title">
    <p className="text-xs font-bold uppercase tracking-[.23em] text-emerald-200">AI operations assistant · owner controlled</p>
    <h2 id="operations-assistant-title" className="mt-3 text-2xl font-semibold">Ask about your studio. Review every proposed change.</h2>
    <p className="mt-2 max-w-3xl text-sm leading-6 text-white/70">Ask for appointment counts, service prices, or workflow failures. You can also propose a price change, for example “Set Signature haircut price to LKR 3000”. Only your approval updates the service.</p>
    <div className="mt-6 rounded-2xl bg-white p-5 text-ink"><label htmlFor="operations-question" className="field-label">Your request</label><form className="mt-2 flex flex-col gap-3 sm:flex-row" onSubmit={event=>{event.preventDefault();void ask();}}><input id="operations-question" className="field flex-1" maxLength={300} minLength={3} required value={question} onChange={event=>setQuestion(event.target.value)} placeholder="How many pending appointments?"/><button type="submit" disabled={busy} className="rounded-full bg-pine px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy?'Working…':'Ask assistant'}</button></form>
      <div className="mt-3 flex flex-wrap gap-2">{suggestions.map(item=><button key={item} type="button" disabled={busy} className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-medium text-pine disabled:opacity-50" onClick={()=>void ask(item)}>{item}</button>)}</div>
      {answer&&<div className="mt-5 rounded-xl bg-mint p-4" role="status"><p className="font-medium text-pine">{answer.answer}</p><p className="mt-2 text-xs text-slate-600">{answer.mode==='llm'?'AI classified':answer.mode==='fallback'?'Rules fallback':'Rules classified'} · {answer.latencyMs} ms · {answer.proposalId?'Awaiting owner review':'Read-only result'}</p></div>}
      {error&&<p className="mt-4 text-sm text-red-700" role="alert">{error}</p>}{message&&<p className="mt-4 text-sm text-pine" role="status">{message}</p>}</div>
    <div className="mt-6 grid gap-4 lg:grid-cols-2"><div className="rounded-2xl bg-white p-5 text-ink"><h3 className="font-semibold">Price proposals</h3>{!history?<p className="mt-3 text-sm text-slate-600">Loading proposals…</p>:history.proposals.length===0?<p className="mt-3 text-sm text-slate-600">No proposed changes yet.</p>:<ul className="mt-4 space-y-3">{history.proposals.map(item=><li key={item.id} className="rounded-xl border border-slate-200 p-4 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong>{item.service_name}</strong><span className="capitalize text-slate-600">{item.state}</span></div><p className="mt-1 text-slate-600">LKR {(item.old_price_minor/100).toFixed(2)} → LKR {(item.new_price_minor/100).toFixed(2)}</p>{item.state==='pending'&&<div className="mt-3 flex gap-2"><button type="button" disabled={busy} className="rounded-full bg-pine px-4 py-2 font-semibold text-white disabled:opacity-50" onClick={()=>void decide(item.id,'approve')}>Approve</button><button type="button" disabled={busy} className="rounded-full border border-slate-300 px-4 py-2 font-semibold disabled:opacity-50" onClick={()=>void decide(item.id,'reject')}>Reject</button></div>}</li>)}</ul>}</div>
    <div className="rounded-2xl bg-white p-5 text-ink"><h3 className="font-semibold">Assistant activity</h3>{!history?<p className="mt-3 text-sm text-slate-600">Loading activity…</p>:history.runs.length===0?<p className="mt-3 text-sm text-slate-600">No requests yet.</p>:<ul className="mt-4 space-y-2">{history.runs.slice(0,8).map(run=><li key={run.id} className="flex flex-wrap justify-between gap-2 border-b border-slate-100 pb-2 text-sm"><span className="capitalize">{run.intent.replaceAll('_',' ')}</span><span className="text-slate-500">{run.mode} · {run.latency_ms} ms · {run.actor}</span></li>)}</ul>}<p className="mt-4 text-xs leading-5 text-slate-500">Requests are classified and audited without storing the original question. The assistant cannot run SQL or approve its own proposals.</p></div></div>
  </section>;
}
