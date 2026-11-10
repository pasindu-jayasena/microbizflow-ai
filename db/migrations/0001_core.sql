CREATE TABLE businesses (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  timezone TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'LKR',
  address TEXT NOT NULL,
  phone TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE services (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  duration_min INTEGER NOT NULL CHECK(duration_min BETWEEN 15 AND 480),
  price_minor INTEGER NOT NULL CHECK(price_minor >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(business_id, name)
);
CREATE INDEX idx_services_business ON services(business_id, active, sort_order);

CREATE TABLE resources (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
  UNIQUE(business_id, name)
);

CREATE TABLE working_hours (
  business_id TEXT NOT NULL REFERENCES businesses(id),
  weekday INTEGER NOT NULL CHECK(weekday BETWEEN 0 AND 6),
  open_min INTEGER NOT NULL CHECK(open_min BETWEEN 0 AND 1439),
  close_min INTEGER NOT NULL CHECK(close_min BETWEEN 1 AND 1440),
  CHECK(close_min > open_min),
  PRIMARY KEY(business_id, weekday)
);

CREATE TABLE appointments (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  service_id TEXT NOT NULL REFERENCES services(id),
  resource_id TEXT NOT NULL REFERENCES resources(id),
  customer_name TEXT NOT NULL,
  customer_contact TEXT NOT NULL,
  customer_note TEXT NOT NULL DEFAULT '',
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','declined','cancelled','completed')),
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(end_at > start_at),
  UNIQUE(business_id, idempotency_key)
);
CREATE INDEX idx_appointments_resource_time ON appointments(resource_id, start_at, end_at, status);
CREATE INDEX idx_appointments_business_time ON appointments(business_id, start_at, status);

CREATE TRIGGER prevent_appointment_overlap_insert
BEFORE INSERT ON appointments
WHEN NEW.status IN ('pending', 'confirmed')
BEGIN
  SELECT RAISE(ABORT, 'resource overlap')
  WHERE EXISTS (
    SELECT 1 FROM appointments a
    WHERE a.resource_id = NEW.resource_id
      AND a.status IN ('pending', 'confirmed')
      AND a.start_at < NEW.end_at AND NEW.start_at < a.end_at
  );
END;

CREATE TRIGGER prevent_appointment_overlap_update
BEFORE UPDATE OF start_at, end_at, resource_id, status ON appointments
WHEN NEW.status IN ('pending', 'confirmed')
BEGIN
  SELECT RAISE(ABORT, 'resource overlap')
  WHERE EXISTS (
    SELECT 1 FROM appointments a
    WHERE a.resource_id = NEW.resource_id AND a.id != NEW.id
      AND a.status IN ('pending', 'confirmed')
      AND a.start_at < NEW.end_at AND NEW.start_at < a.end_at
  );
END;

CREATE TABLE appointment_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  appointment_id TEXT NOT NULL REFERENCES appointments(id),
  old_status TEXT,
  new_status TEXT NOT NULL,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER audit_appointment_create AFTER INSERT ON appointments
BEGIN
  INSERT INTO appointment_audit (appointment_id, old_status, new_status, actor)
  VALUES (NEW.id, NULL, NEW.status, 'customer');
END;
