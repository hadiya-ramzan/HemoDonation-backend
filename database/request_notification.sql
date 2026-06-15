
CREATE DATABASE IF NOT EXISTS hemodonation_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE hemodonation_db;

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

DROP PROCEDURE IF EXISTS add_notification_column_if_missing;
DELIMITER $$
CREATE PROCEDURE add_notification_column_if_missing(
  IN column_name VARCHAR(64),
  IN column_definition TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'notifications'
      AND COLUMN_NAME = column_name
  ) THEN
    SET @ddl = CONCAT('ALTER TABLE notifications ADD COLUMN ', column_name, ' ', column_definition);
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

CALL add_notification_column_if_missing('priority_score', 'INT NOT NULL DEFAULT 0 AFTER is_read');
DROP PROCEDURE IF EXISTS add_notification_column_if_missing;

DROP PROCEDURE IF EXISTS add_notification_index_if_missing;
DELIMITER $$
CREATE PROCEDURE add_notification_index_if_missing()
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'notifications'
      AND INDEX_NAME = 'idx_notifications_priority'
  ) THEN
    CREATE INDEX idx_notifications_priority ON notifications (user_id, is_read, priority_score, created_at);
  END IF;
END$$
DELIMITER ;

CALL add_notification_index_if_missing();
DROP PROCEDURE IF EXISTS add_notification_index_if_missing;

SELECT 'Patch 09A applied successfully' AS status;
