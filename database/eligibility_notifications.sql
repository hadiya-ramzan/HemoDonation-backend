-- Patch 11: Phase 5 eligibility refresh + donation tracking polish
-- If your database name is different, change the next line before running.
USE hemodonation_db;

CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(150) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(50) DEFAULT 'system',
  link VARCHAR(255) NULL,
  is_read TINYINT(1) DEFAULT 0,
  priority_score INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notifications_user_read (user_id, is_read),
  CONSTRAINT fk_notifications_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
);

DROP PROCEDURE IF EXISTS add_index_if_missing;
DELIMITER $$
CREATE PROCEDURE add_index_if_missing(
  IN p_table_name VARCHAR(64),
  IN p_index_name VARCHAR(64),
  IN p_index_sql TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table_name
      AND INDEX_NAME = p_index_name
  ) THEN
    SET @ddl = p_index_sql;
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

CALL add_index_if_missing(
  'notifications',
  'idx_notifications_user_type_created',
  'CREATE INDEX idx_notifications_user_type_created ON notifications(user_id, type, created_at)'
);

CALL add_index_if_missing(
  'donations',
  'idx_donations_donor_date',
  'CREATE INDEX idx_donations_donor_date ON donations(donor_id, donation_date)'
);

CALL add_index_if_missing(
  'blood_requests',
  'idx_blood_requests_donor_status',
  'CREATE INDEX idx_blood_requests_donor_status ON blood_requests(donor_id, status)'
);

DROP PROCEDURE IF EXISTS add_index_if_missing;

-- Verification summary: this does not change existing records.
SELECT
  COUNT(*) AS completed_donation_rows
FROM donations;

SELECT
  COUNT(*) AS cooldown_completed_not_yet_notified
FROM users u
WHERE u.role IN ('donor', 'both')
  AND u.account_status = 'active'
  AND u.last_donation_date IS NOT NULL
  AND (
    (
      LOWER(COALESCE(u.gender, '')) = 'female'
      AND DATE_ADD(u.last_donation_date, INTERVAL 120 DAY) <= CURDATE()
    )
    OR (
      LOWER(COALESCE(u.gender, '')) <> 'female'
      AND DATE_ADD(u.last_donation_date, INTERVAL 90 DAY) <= CURDATE()
    )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM notifications n
    WHERE n.user_id = u.id
      AND n.type = 'eligibility'
      AND DATE(n.created_at) >= DATE(
        CASE
          WHEN LOWER(COALESCE(u.gender, '')) = 'female'
            THEN DATE_ADD(u.last_donation_date, INTERVAL 120 DAY)
          ELSE DATE_ADD(u.last_donation_date, INTERVAL 90 DAY)
        END
      )
  );

-- Optional manual test for one demo donor only. Run separately if you want to test eligibility notification quickly:
-- UPDATE users
-- SET last_donation_date = DATE_SUB(CURDATE(), INTERVAL 91 DAY), is_eligible_donor = 0, donor_availability = 'not_available'
-- WHERE email = 'ali.donor@gmail.com';
-- Then restart backend and open /notifications from that donor account after 5-10 seconds.
