CREATE TABLE inbound_webhooks (
  business_id TEXT NOT NULL REFERENCES businesses(id),
  external_id TEXT NOT NULL,
  appointment_id TEXT NOT NULL REFERENCES appointments(id),
  event_type TEXT NOT NULL CHECK(event_type='booking.followup_requested'),
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','processing','done','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_until INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (business_id, external_id)
);
CREATE INDEX idx_inbound_webhooks_state ON inbound_webhooks(business_id,state,lease_until);

CREATE TABLE owner_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  appointment_id TEXT NOT NULL REFERENCES appointments(id),
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'open' CHECK(state IN ('open','done')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  UNIQUE(business_id,external_id),
  FOREIGN KEY (business_id,external_id) REFERENCES inbound_webhooks(business_id,external_id)
);
CREATE INDEX idx_owner_tasks_business_state ON owner_tasks(business_id,state,created_at);
