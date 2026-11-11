const encoder = new TextEncoder();

export async function verifyWebhook(request: Request, body: string, secret: string | undefined, now = Date.now()): Promise<boolean> {
  if (!secret || secret.length < 32) return false;
  const stamp = request.headers.get('X-MicroBizFlow-Timestamp') ?? '';
  const signature = request.headers.get('X-MicroBizFlow-Signature') ?? '';
  if (!/^\d{10}$/.test(stamp) || !/^sha256=[0-9a-f]{64}$/.test(signature)) return false;
  const timestampMs = Number(stamp) * 1000;
  if (Math.abs(now - timestampMs) > 5 * 60_000) return false;
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`${stamp}.${body}`)));
  const supplied = signature.slice(7);
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= expected[i]! ^ Number.parseInt(supplied.slice(i * 2, i * 2 + 2), 16);
  return mismatch === 0;
}

export async function processInboundWebhook(db: D1Database, businessId: string, externalId: string): Promise<boolean> {
  const now = Date.now();
  const claim = await db.prepare(`UPDATE inbound_webhooks SET state='processing',attempts=attempts+1,lease_until=?,updated_at=CURRENT_TIMESTAMP
    WHERE business_id=? AND external_id=? AND attempts<3 AND (state IN ('pending','failed') OR (state='processing' AND lease_until<?))`)
    .bind(now + 60_000,businessId,externalId,now).run();
  if (claim.meta.changes < 1) return false;
  try {
    const row = await db.prepare('SELECT appointment_id FROM inbound_webhooks WHERE business_id=? AND external_id=?').bind(businessId,externalId).first<{ appointment_id: string }>();
    if (!row) throw new Error('Missing inbound event');
    await db.prepare(`INSERT OR IGNORE INTO owner_tasks(business_id,appointment_id,external_id,title)
      VALUES(?,?,?,'Review customer follow-up request')`).bind(businessId,row.appointment_id,externalId).run();
    await db.prepare("UPDATE inbound_webhooks SET state='done',lease_until=0,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE business_id=? AND external_id=?")
      .bind(businessId,externalId).run();
    return true;
  } catch {
    await db.prepare("UPDATE inbound_webhooks SET state='failed',lease_until=0,last_error='Processing failed',updated_at=CURRENT_TIMESTAMP WHERE business_id=? AND external_id=?")
      .bind(businessId,externalId).run();
    return false;
  }
}

export async function processPendingInboundWebhooks(db: D1Database, businessId: string, limit = 10): Promise<{ processed: number; failed: number }> {
  const due = await db.prepare(`SELECT external_id FROM inbound_webhooks WHERE business_id=? AND attempts<3
    AND (state IN ('pending','failed') OR (state='processing' AND lease_until<?)) ORDER BY created_at LIMIT ?`)
    .bind(businessId,Date.now(),limit).all<{ external_id: string }>();
  let processed = 0;
  let failed = 0;
  for (const row of due.results) {
    if (await processInboundWebhook(db,businessId,row.external_id)) processed++;
    else failed++;
  }
  return { processed, failed };
}
