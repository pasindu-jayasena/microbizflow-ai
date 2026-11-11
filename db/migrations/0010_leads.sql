CREATE TABLE leads (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  idempotency_key TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  contact_key TEXT NOT NULL,
  service_id TEXT REFERENCES services(id),
  requested_date TEXT,
  requested_time TEXT,
  language TEXT NOT NULL CHECK(language IN ('en','si','unknown')),
  priority TEXT NOT NULL CHECK(priority IN ('high','medium','low')),
  mode TEXT NOT NULL CHECK(mode IN ('rules','llm','fallback')),
  latency_ms INTEGER NOT NULL CHECK(latency_ms >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(business_id,idempotency_key)
);
CREATE INDEX idx_leads_business_created ON leads(business_id,created_at);
