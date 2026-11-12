CREATE TABLE assistant_runs (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  actor TEXT NOT NULL CHECK(actor IN ('owner','automation')),
  intent TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('rules','llm','fallback')),
  latency_ms INTEGER NOT NULL CHECK(latency_ms >= 0),
  proposal_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_assistant_runs_business ON assistant_runs(business_id,created_at);

CREATE TABLE assistant_proposals (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  run_id TEXT NOT NULL REFERENCES assistant_runs(id),
  service_id TEXT NOT NULL REFERENCES services(id),
  old_price_minor INTEGER NOT NULL,
  new_price_minor INTEGER NOT NULL CHECK(new_price_minor BETWEEN 10000 AND 10000000),
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','approved','rejected')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at TEXT,
  CHECK(old_price_minor <> new_price_minor)
);
CREATE INDEX idx_assistant_proposals_business ON assistant_proposals(business_id,state,created_at);
