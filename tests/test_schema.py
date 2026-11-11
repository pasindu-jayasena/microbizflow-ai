"""Checks SQLite rules independently of the Worker runtime."""

import pathlib
import sqlite3
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]


class SchemaTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.execute('PRAGMA foreign_keys = ON')
        for migration in sorted((ROOT / 'db' / 'migrations').glob('*.sql')):
            self.db.executescript(migration.read_text(encoding='utf-8'))
        self.db.executescript((ROOT / 'db' / 'seed.sql').read_text(encoding='utf-8'))

    def tearDown(self):
        self.db.close()

    def create(self, ident, resource, start='2026-11-16T03:30:00.000Z', end='2026-11-16T04:15:00.000Z'):
        self.db.execute('''INSERT INTO appointments
            (id, reference, business_id, service_id, resource_id, customer_name,
             customer_contact, start_at, end_at, idempotency_key)
            VALUES (?, ?, 'biz_demo', 'svc_cut', ?, 'Fictional Visitor',
                    'demo@example.invalid', ?, ?, ?)''', (ident, ident, resource, start, end, ident))

    def test_overlap_trigger_preserves_two_chair_capacity(self):
        self.create('one', 'chair_1')
        self.create('two', 'chair_2')
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'resource overlap'):
            self.create('three', 'chair_1', '2026-11-16T04:00:00.000Z', '2026-11-16T04:30:00.000Z')
        self.create('adjacent', 'chair_1', '2026-11-16T04:15:00.000Z', '2026-11-16T05:00:00.000Z')
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM appointments').fetchone()[0], 3)

    def test_idempotency_and_status_audit(self):
        self.create('one', 'chair_1')
        with self.assertRaises(sqlite3.IntegrityError):
            self.create('one', 'chair_2')
        self.db.execute("UPDATE appointments SET status='confirmed' WHERE id='one'")
        rows = self.db.execute("SELECT old_status,new_status FROM appointment_audit WHERE appointment_id='one' ORDER BY id").fetchall()
        self.assertEqual(rows, [(None, 'pending'), ('pending', 'confirmed')])

    def test_workflow_events_are_enqueued_with_appointments(self):
        self.create('one', 'chair_1')
        self.db.execute("UPDATE appointments SET status='confirmed' WHERE id='one'")
        events = self.db.execute("SELECT event_key,kind FROM workflow_events ORDER BY id").fetchall()
        self.assertEqual(events, [('one:created', 'booking_requested'), ('one:status:confirmed', 'status_changed')])

    def test_notification_approval_is_audited(self):
        self.create('one', 'chair_1')
        self.db.execute("UPDATE appointments SET status='confirmed' WHERE id='one'")
        self.db.execute("""INSERT INTO notifications
            (business_id,appointment_id,event_key,kind,body,state)
            VALUES ('biz_demo','one','one:status:confirmed','customer_draft','Fictional message','needs_approval')""")
        self.db.execute("UPDATE notifications SET state='approved' WHERE id=1")
        self.db.execute("UPDATE notifications SET state='mock_delivered' WHERE id=1")
        audit = self.db.execute('SELECT old_state,new_state,actor FROM notification_audit ORDER BY id').fetchall()
        self.assertEqual(audit, [(None, 'needs_approval', 'workflow'), ('needs_approval', 'approved', 'owner'), ('approved', 'mock_delivered', 'workflow')])

    def test_customer_records_deduplicate_contacts_and_keep_notes(self):
        self.create('one', 'chair_1')
        self.db.execute("UPDATE customer_records SET notes='Prefers mornings' WHERE business_id='biz_demo' AND contact_key='demo@example.invalid'")
        self.db.execute("""INSERT INTO appointments
            (id,reference,business_id,service_id,resource_id,customer_name,customer_contact,start_at,end_at,idempotency_key)
            VALUES ('later','later','biz_demo','svc_cut','chair_2','Fictional Visitor Two','DEMO@example.invalid','2026-11-16T03:30:00.000Z','2026-11-16T04:15:00.000Z','later')""")
        row = self.db.execute("SELECT display_name,contact,notes FROM customer_records WHERE business_id='biz_demo' AND contact_key='demo@example.invalid'").fetchone()
        self.assertEqual(row, ('Fictional Visitor Two', 'DEMO@example.invalid', 'Prefers mornings'))
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM customer_records').fetchone()[0], 1)

    def test_webhook_event_and_task_are_unique_per_business(self):
        self.create('one', 'chair_1')
        self.db.execute("INSERT INTO inbound_webhooks(business_id,external_id,appointment_id,event_type) VALUES('biz_demo','event-1','one','booking.followup_requested')")
        self.db.execute("INSERT INTO owner_tasks(business_id,appointment_id,external_id,title) VALUES('biz_demo','one','event-1','Review')")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO owner_tasks(business_id,appointment_id,external_id,title) VALUES('biz_demo','one','event-1','Review')")
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM owner_tasks').fetchone()[0], 1)

    def test_enquiry_review_stores_only_structured_fields(self):
        columns = {row[1] for row in self.db.execute('PRAGMA table_info(enquiry_analyses)')}
        self.assertNotIn('raw_text', columns)
        self.assertNotIn('message', columns)
        self.db.execute("""INSERT INTO enquiry_analyses(id,business_id,language,missing_fields,mode,latency_ms)
            VALUES('enquiry-1','biz_demo','en','date,time','demo',3)""")
        self.db.execute("UPDATE enquiry_analyses SET review_state='reviewed',reviewed_at=CURRENT_TIMESTAMP WHERE id='enquiry-1'")
        self.assertEqual(self.db.execute("SELECT review_state FROM enquiry_analyses WHERE id='enquiry-1'").fetchone()[0], 'reviewed')

    def test_crm_sync_is_durable_and_stores_no_customer_content(self):
        columns = {row[1] for row in self.db.execute('PRAGMA table_info(crm_sync_events)')}
        self.assertNotIn('customer_name', columns)
        self.assertNotIn('customer_contact', columns)
        self.create('one', 'chair_1')
        self.db.execute("UPDATE appointments SET status='confirmed' WHERE id='one'")
        events = self.db.execute('SELECT event_key,state FROM crm_sync_events ORDER BY event_key').fetchall()
        self.assertEqual(events, [('one:created', 'pending'), ('one:status:confirmed', 'pending')])
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO crm_sync_events(event_key,business_id,appointment_id) VALUES('one:created','biz_demo','one')")


if __name__ == '__main__':
    unittest.main()
