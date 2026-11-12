DROP TRIGGER enqueue_crm_booking;
DROP TRIGGER enqueue_crm_status;

CREATE TABLE crm_sync_events_next (
  event_key TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  appointment_id TEXT NOT NULL REFERENCES appointments(id),
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','processing','mock_synced','external_synced','failed','dead','skipped')),
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_until INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  provider TEXT NOT NULL DEFAULT 'mock' CHECK(provider IN ('mock','hubspot')),
  external_id TEXT,
  latency_ms INTEGER NOT NULL DEFAULT 0 CHECK(latency_ms >= 0),
  synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO crm_sync_events_next(event_key,business_id,appointment_id,state,attempts,lease_until,last_error,created_at,updated_at)
  SELECT event_key,business_id,appointment_id,state,attempts,lease_until,last_error,created_at,updated_at FROM crm_sync_events;
DROP TABLE crm_sync_events;
ALTER TABLE crm_sync_events_next RENAME TO crm_sync_events;
CREATE INDEX idx_crm_sync_state ON crm_sync_events(business_id,state,next_attempt_at,lease_until);

CREATE TRIGGER enqueue_crm_booking AFTER INSERT ON appointments
BEGIN
  INSERT INTO crm_sync_events(event_key,business_id,appointment_id)
  VALUES(NEW.id || ':created',NEW.business_id,NEW.id);
END;
CREATE TRIGGER enqueue_crm_status AFTER UPDATE OF status ON appointments
WHEN NEW.status != OLD.status
BEGIN
  INSERT OR IGNORE INTO crm_sync_events(event_key,business_id,appointment_id)
  VALUES(NEW.id || ':status:' || NEW.status,NEW.business_id,NEW.id);
END;
