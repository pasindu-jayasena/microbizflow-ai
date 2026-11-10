CREATE TABLE workflow_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  appointment_id TEXT NOT NULL REFERENCES appointments(id),
  event_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK(kind IN ('booking_requested','status_changed')),
  subject_status TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','processing','done','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_until INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_workflow_events_state ON workflow_events(business_id, state, lease_until);

CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  appointment_id TEXT NOT NULL REFERENCES appointments(id),
  event_key TEXT NOT NULL UNIQUE REFERENCES workflow_events(event_key),
  kind TEXT NOT NULL CHECK(kind IN ('owner_notice','customer_draft')),
  body TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('needs_approval','approved','sending','mock_delivered','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_until INTEGER NOT NULL DEFAULT 0,
  approved_at TEXT,
  delivered_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_notifications_business_state ON notifications(business_id, state, created_at);

CREATE TABLE notification_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_id INTEGER NOT NULL REFERENCES notifications(id),
  old_state TEXT,
  new_state TEXT NOT NULL,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER enqueue_booking_requested AFTER INSERT ON appointments
BEGIN
  INSERT INTO workflow_events (business_id,appointment_id,event_key,kind,subject_status)
  VALUES (NEW.business_id,NEW.id,NEW.id || ':created','booking_requested',NEW.status);
END;

CREATE TRIGGER enqueue_booking_status AFTER UPDATE OF status ON appointments
WHEN NEW.status != OLD.status
BEGIN
  INSERT OR IGNORE INTO workflow_events (business_id,appointment_id,event_key,kind,subject_status)
  VALUES (NEW.business_id,NEW.id,NEW.id || ':status:' || NEW.status,'status_changed',NEW.status);
END;

CREATE TRIGGER audit_notification_created AFTER INSERT ON notifications
BEGIN
  INSERT INTO notification_audit (notification_id,old_state,new_state,actor)
  VALUES (NEW.id,NULL,NEW.state,'workflow');
END;

CREATE TRIGGER audit_notification_state AFTER UPDATE OF state ON notifications
WHEN NEW.state != OLD.state
BEGIN
  INSERT INTO notification_audit (notification_id,old_state,new_state,actor)
  VALUES (NEW.id,OLD.state,NEW.state,CASE WHEN NEW.state='approved' THEN 'owner' ELSE 'workflow' END);
END;
