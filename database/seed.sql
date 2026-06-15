-- Optional demo data for local testing.
-- Password for all sample accounts: 12345678

USE hemodonation_db;

INSERT INTO users
(full_name, email, phone, password, role, preferred_mode, blood_group, gender, city, latitude, longitude, donor_availability, is_eligible_donor, health_check_completed, is_phone_verified, account_status)
VALUES
('Admin User', 'admin@gmail.com', '03000000000', '$2b$10$OsUjmpCvaX7HKJ9TcJ0p8OALTI9.1cHf2KtebMvmLsvfUexmsFXeS', 'admin', 'donor', 'O+', 'other', 'Kasur', 31.1167, 74.4500, 'not_available', 0, 0, 1, 'active'),
('Ali Donor', 'ali.donor@gmail.com', '03000000001', '$2b$10$OsUjmpCvaX7HKJ9TcJ0p8OALTI9.1cHf2KtebMvmLsvfUexmsFXeS', 'both', 'donor', 'A+', 'male', 'Kasur', 31.1167, 74.4500, 'available', 1, 1, 1, 'active'),
('Sara Donor', 'sara.donor@gmail.com', '03000000002', '$2b$10$OsUjmpCvaX7HKJ9TcJ0p8OALTI9.1cHf2KtebMvmLsvfUexmsFXeS', 'both', 'donor', 'B+', 'female', 'Pattoki', 31.0167, 73.8500, 'available', 1, 1, 1, 'active'),
('Usman Donor', 'usman.donor@gmail.com', '03000000003', '$2b$10$OsUjmpCvaX7HKJ9TcJ0p8OALTI9.1cHf2KtebMvmLsvfUexmsFXeS', 'both', 'donor', 'O+', 'male', 'Phool Nagar', 31.2050, 73.9430, 'available', 1, 0, 1, 'active'),
('Demo Recipient', 'recipient@gmail.com', '03000000004', '$2b$10$OsUjmpCvaX7HKJ9TcJ0p8OALTI9.1cHf2KtebMvmLsvfUexmsFXeS', 'both', 'recipient', 'A+', 'male', 'Kasur', 31.1180, 74.4480, 'not_available', 0, 0, 1, 'active')
ON DUPLICATE KEY UPDATE
  full_name = VALUES(full_name),
  role = VALUES(role),
  preferred_mode = VALUES(preferred_mode),
  blood_group = VALUES(blood_group),
  gender = VALUES(gender),
  city = VALUES(city),
  latitude = VALUES(latitude),
  longitude = VALUES(longitude),
  donor_availability = VALUES(donor_availability),
  is_eligible_donor = VALUES(is_eligible_donor),
  health_check_completed = VALUES(health_check_completed),
  is_phone_verified = VALUES(is_phone_verified),
  account_status = VALUES(account_status);

INSERT INTO blood_requests
(recipient_id, blood_group, city, hospital_name, patient_name, units_needed, urgency, notes, status)
SELECT id, 'A+', 'Kasur', 'DHQ Hospital Kasur', 'Demo Patient', 1, 'urgent', 'Demo request for testing donor dashboard.', 'open'
FROM users
WHERE email = 'recipient@gmail.com'
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP;
