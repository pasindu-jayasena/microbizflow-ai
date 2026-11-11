DROP TRIGGER audit_appointment_status;

CREATE TRIGGER audit_appointment_status AFTER UPDATE OF status ON appointments
WHEN NEW.status != OLD.status
BEGIN
  INSERT INTO appointment_audit (appointment_id, old_status, new_status, actor)
  VALUES (NEW.id, OLD.status, NEW.status,
    CASE WHEN NEW.status='cancelled' AND NEW.customer_contact='demo-expired:' || NEW.id
      THEN 'system' ELSE 'owner' END);
END;
