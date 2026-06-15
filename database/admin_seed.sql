-- Optional admin account seed for HemoDonation.
-- Run this only if admin@gmail.com / 12345678 login is missing.

USE hemodonation_db;

INSERT INTO users
(full_name, email, phone, password, role, preferred_mode, blood_group, gender, city, latitude, longitude, donor_availability, is_eligible_donor, health_check_completed, is_phone_verified, account_status)
VALUES
('Admin User', 'admin@gmail.com', '03000000000', '$2b$10$OsUjmpCvaX7HKJ9TcJ0p8OALTI9.1cHf2KtebMvmLsvfUexmsFXeS', 'admin', 'donor', 'O+', 'other', 'Kasur', 31.1167, 74.4500, 'not_available', 0, 0, 1, 'active')
ON DUPLICATE KEY UPDATE
  full_name = VALUES(full_name),
  role = VALUES(role),
  preferred_mode = VALUES(preferred_mode),
  account_status = VALUES(account_status),
  is_phone_verified = VALUES(is_phone_verified);
