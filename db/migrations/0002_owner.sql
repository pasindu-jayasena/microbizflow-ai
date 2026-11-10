CREATE TABLE owner_sessions (
  token_hash TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_owner_sessions_expiry ON owner_sessions(expires_at);

CREATE TABLE login_attempts (
  client_hash TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);

CREATE TRIGGER audit_appointment_status AFTER UPDATE OF status ON appointments
WHEN NEW.status != OLD.status
BEGIN
  INSERT INTO appointment_audit (appointment_id, old_status, new_status, actor)
  VALUES (NEW.id, OLD.status, NEW.status, 'owner');
END;
