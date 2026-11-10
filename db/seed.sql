-- All records in this seed file are fictional demonstration data.
INSERT OR IGNORE INTO businesses (id, slug, name, description, timezone, currency, address, phone)
VALUES ('biz_demo', 'harbour-cut', 'Harbour Cut Studio', 'Thoughtful cuts and grooming, right on your schedule.', 'Asia/Colombo', 'LKR', '42 Galle Road, Colombo 03', '+94 11 000 0000');

INSERT OR IGNORE INTO services (id, business_id, name, description, duration_min, price_minor, sort_order) VALUES
('svc_cut', 'biz_demo', 'Signature haircut', 'A precise cut and finish tailored to your style.', 45, 250000, 1),
('svc_beard', 'biz_demo', 'Beard shaping', 'Clean lines and a considered finish.', 30, 150000, 2),
('svc_combo', 'biz_demo', 'Cut + beard', 'The full refresh in one visit.', 75, 350000, 3);

INSERT OR IGNORE INTO resources (id, business_id, name) VALUES
('chair_1', 'biz_demo', 'Chair 1'),
('chair_2', 'biz_demo', 'Chair 2');

INSERT OR IGNORE INTO working_hours (business_id, weekday, open_min, close_min) VALUES
('biz_demo', 1, 540, 1080), ('biz_demo', 2, 540, 1080),
('biz_demo', 3, 540, 1080), ('biz_demo', 4, 540, 1080),
('biz_demo', 5, 540, 1080), ('biz_demo', 6, 540, 1020);
