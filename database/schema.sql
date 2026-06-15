
CREATE DATABASE IF NOT EXISTS hemodonation_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE hemodonation_db;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  password VARCHAR(255) NOT NULL,

  role ENUM('donor', 'recipient', 'both', 'admin') NOT NULL DEFAULT 'both',
  preferred_mode ENUM('donor', 'recipient') DEFAULT 'donor',

  blood_group ENUM('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-') DEFAULT NULL,
  gender ENUM('male', 'female', 'other') DEFAULT NULL,
  city VARCHAR(100) DEFAULT NULL,

  latitude DECIMAL(10, 7) DEFAULT NULL,
  longitude DECIMAL(10, 7) DEFAULT NULL,
  location_updated_at DATETIME DEFAULT NULL,

  donor_availability ENUM('available', 'not_available') NOT NULL DEFAULT 'available',
  is_eligible_donor TINYINT(1) NOT NULL DEFAULT 1,
  health_check_completed TINYINT(1) NOT NULL DEFAULT 0,
  last_donation_date DATE DEFAULT NULL,
  reliability_score INT NOT NULL DEFAULT 0,

  is_phone_verified TINYINT(1) NOT NULL DEFAULT 0,
  account_status ENUM('pending', 'active', 'blocked') NOT NULL DEFAULT 'pending',

  otp_code VARCHAR(10) DEFAULT NULL,
  otp_expiry DATETIME DEFAULT NULL,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_phone (phone),
  KEY idx_users_role (role),
  KEY idx_users_blood_city (blood_group, city),
  KEY idx_users_location (latitude, longitude),
  KEY idx_users_donor_status (donor_availability, is_eligible_donor, account_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS blood_requests (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  recipient_id INT UNSIGNED NOT NULL,
  donor_id INT UNSIGNED DEFAULT NULL,

  blood_group ENUM('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-') NOT NULL,
  city VARCHAR(100) NOT NULL,
  hospital_name VARCHAR(180) NOT NULL,
  patient_name VARCHAR(120) NOT NULL,
  units_needed INT UNSIGNED NOT NULL DEFAULT 1,
  urgency ENUM('normal', 'urgent', 'critical') NOT NULL DEFAULT 'urgent',
  notes TEXT DEFAULT NULL,

  status ENUM('open', 'accepted', 'rejected', 'completed', 'cancelled') NOT NULL DEFAULT 'open',
  completed_at DATETIME DEFAULT NULL,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_requests_recipient (recipient_id),
  KEY idx_requests_donor (donor_id),
  KEY idx_requests_matching (blood_group, city, status, urgency),
  CONSTRAINT fk_requests_recipient
    FOREIGN KEY (recipient_id) REFERENCES users(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_requests_donor
    FOREIGN KEY (donor_id) REFERENCES users(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS donor_health_checks (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  donor_id INT UNSIGNED NOT NULL,
  feeling_healthy TINYINT(1) NOT NULL,
  has_fever TINYINT(1) NOT NULL,
  taking_antibiotics TINYINT(1) NOT NULL,
  recent_surgery TINYINT(1) NOT NULL,
  chronic_disease TINYINT(1) NOT NULL,
  is_passed TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_health_donor (donor_id),
  CONSTRAINT fk_health_donor
    FOREIGN KEY (donor_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS donations (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  request_id INT UNSIGNED DEFAULT NULL,
  donor_id INT UNSIGNED NOT NULL,
  recipient_id INT UNSIGNED NOT NULL,
  donation_date DATE NOT NULL,
  units_donated INT UNSIGNED NOT NULL DEFAULT 1,
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_donations_request (request_id),
  KEY idx_donations_donor (donor_id),
  KEY idx_donations_recipient (recipient_id),
  CONSTRAINT fk_donations_request
    FOREIGN KEY (request_id) REFERENCES blood_requests(id)
    ON DELETE SET NULL,
  CONSTRAINT fk_donations_donor
    FOREIGN KEY (donor_id) REFERENCES users(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_donations_recipient
    FOREIGN KEY (recipient_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS request_responses (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  request_id INT UNSIGNED NOT NULL,
  donor_id INT UNSIGNED NOT NULL,
  response_status ENUM('accepted', 'rejected') NOT NULL,
  responded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_request_donor_response (request_id, donor_id),
  KEY idx_response_donor_status (donor_id, response_status),
  CONSTRAINT fk_response_request
    FOREIGN KEY (request_id) REFERENCES blood_requests(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_response_donor
    FOREIGN KEY (donor_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  title VARCHAR(160) NOT NULL,
  message TEXT NOT NULL,
  type ENUM('system', 'request', 'donation', 'admin') NOT NULL DEFAULT 'system',
  link VARCHAR(255) DEFAULT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_notifications_user_read (user_id, is_read, created_at),
  CONSTRAINT fk_notifications_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SHOW CREATE TABLE donations;