CREATE TABLE crm_sync_events (
  event_key TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  appointment_id TEXT NOT NULL REFERENCES appointments(id),
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','processing','mock_synced','failed','skipped')),
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_until INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_crm_sync_state ON crm_sync_events(business_id,state,lease_until);

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
