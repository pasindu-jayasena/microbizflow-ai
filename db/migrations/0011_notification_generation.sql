ALTER TABLE notifications ADD COLUMN generation_mode TEXT NOT NULL DEFAULT 'rules'
  CHECK(generation_mode IN ('rules','llm','fallback'));
ALTER TABLE notifications ADD COLUMN generation_latency_ms INTEGER NOT NULL DEFAULT 0
  CHECK(generation_latency_ms >= 0);
