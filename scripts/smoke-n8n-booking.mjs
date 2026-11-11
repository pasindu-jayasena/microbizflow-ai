import assert from 'node:assert/strict';
import { Temporal } from '@js-temporal/polyfill';

const api = 'http://127.0.0.1:8788';
const n8n = 'http://127.0.0.1:5678';
const business = await fetch(`${api}/api/business`).then(response => response.json());
const today = Temporal.Now.zonedDateTimeISO(business.business.timezone).toPlainDate();
let date;
let time;
for (let offset = 2; offset < 12; offset++) {
  date = today.add({ days: offset }).toString();
  const available = await fetch(`${api}/api/availability?serviceId=svc_cut&date=${date}`).then(response => response.json());
  if (available.slots?.length) { time = available.slots[0]; break; }
}
assert.ok(time,'A future demonstration slot is required');
const booking = { serviceId:'svc_cut',date,time,customerName:'Fictional n8n Visitor',
  customerContact:`n8n-booking-${crypto.randomUUID()}@example.invalid`,note:'',idempotencyKey:crypto.randomUUID() };
const result = await fetch(`${n8n}/webhook/microbizflow/appointment-request`, {
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(booking),
});
assert.equal(result.status,200);
const data = await result.json();
assert.equal(data.status,'pending');
assert.match(data.reference,/^MBF-[A-F0-9]{8}$/);
assert.equal((await fetch(`${api}/api/owner/appointments`)).status,401);
const privateStatus = await fetch(`${api}/api/bookings/status`,{ method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({reference:data.reference,cancellationCode:data.cancellationCode}) });
assert.equal(privateStatus.status,200);
assert.equal((await privateStatus.json()).status,'pending');
console.log('Local n8n booking passed: live availability, pending request, private status, and owner authorization boundary.');
