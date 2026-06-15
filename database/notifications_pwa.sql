USE hemodonation_db;

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
