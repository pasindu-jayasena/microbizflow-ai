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


if __name__ == '__main__':
    unittest.main()
