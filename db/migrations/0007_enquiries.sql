CREATE TABLE enquiry_analyses (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  appointment_id TEXT REFERENCES appointments(id),
  service_id TEXT,
  requested_date TEXT,
  requested_time TEXT,
  language TEXT NOT NULL CHECK(language IN ('en','si','unknown')),
  missing_fields TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('demo','cloudflare','fallback')),
  latency_ms INTEGER NOT NULL CHECK(latency_ms >= 0),
  review_state TEXT NOT NULL DEFAULT 'pending' CHECK(review_state IN ('pending','reviewed')),
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_enquiry_analyses_review ON enquiry_analyses(business_id,review_state,created_at);
CREATE INDEX idx_enquiry_analyses_appointment ON enquiry_analyses(appointment_id);
