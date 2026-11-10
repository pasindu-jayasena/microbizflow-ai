CREATE TABLE customer_records (
  business_id TEXT NOT NULL REFERENCES businesses(id),
  contact_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  contact TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (business_id, contact_key)
);
CREATE INDEX idx_customer_records_name ON customer_records(business_id, display_name);
CREATE INDEX idx_appointments_customer_contact ON appointments(business_id, lower(trim(customer_contact)));

INSERT INTO customer_records (business_id, contact_key, display_name, contact)
SELECT a.business_id, lower(trim(a.customer_contact)), a.customer_name, a.customer_contact
FROM appointments a
WHERE a.id = (
  SELECT latest.id FROM appointments latest
  WHERE latest.business_id = a.business_id
    AND lower(trim(latest.customer_contact)) = lower(trim(a.customer_contact))
  ORDER BY latest.created_at DESC, latest.id DESC LIMIT 1
);

CREATE TRIGGER record_customer_after_booking AFTER INSERT ON appointments
BEGIN
  INSERT INTO customer_records (business_id,contact_key,display_name,contact)
  VALUES (NEW.business_id,lower(trim(NEW.customer_contact)),NEW.customer_name,NEW.customer_contact)
  ON CONFLICT(business_id,contact_key) DO UPDATE SET
    display_name=excluded.display_name,
    contact=excluded.contact,
    updated_at=CURRENT_TIMESTAMP;
END;
