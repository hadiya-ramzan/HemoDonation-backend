
USE hemodonation_db;
SELECT DATABASE() AS selected_database;

DROP PROCEDURE IF EXISTS add_user_column_if_missing;
DELIMITER $$
CREATE PROCEDURE add_user_column_if_missing(
  IN p_column_name VARCHAR(64),
  IN p_column_definition TEXT
)
BEGIN
  IF DATABASE() IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'No database selected. Select the hemodonation database in MySQL Workbench, then run this script again.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'users'
      AND COLUMN_NAME = p_column_name
  ) THEN
    SET @ddl = CONCAT('ALTER TABLE users ADD COLUMN `', p_column_name, '` ', p_column_definition);
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

CALL add_user_column_if_missing('profile_photo', 'VARCHAR(255) DEFAULT NULL AFTER reliability_score');
CALL add_user_column_if_missing('address', 'VARCHAR(255) DEFAULT NULL AFTER profile_photo');
CALL add_user_column_if_missing('whatsapp', 'VARCHAR(20) DEFAULT NULL AFTER address');
CALL add_user_column_if_missing('emergency_contact', 'VARCHAR(20) DEFAULT NULL AFTER whatsapp');
CALL add_user_column_if_missing('preferred_area', 'VARCHAR(120) DEFAULT NULL AFTER emergency_contact');
CALL add_user_column_if_missing('preferred_time', "ENUM('morning','afternoon','evening','night','anytime') DEFAULT 'anytime' AFTER preferred_area");
CALL add_user_column_if_missing('can_travel', 'TINYINT(1) NOT NULL DEFAULT 0 AFTER preferred_time');
CALL add_user_column_if_missing('bio', 'TEXT DEFAULT NULL AFTER can_travel');

DROP PROCEDURE IF EXISTS add_user_column_if_missing;

DROP PROCEDURE IF EXISTS add_user_index_if_missing;
DELIMITER $$
CREATE PROCEDURE add_user_index_if_missing()
BEGIN
  IF DATABASE() IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'No database selected. Select the hemodonation database in MySQL Workbench, then run this script again.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'users'
      AND INDEX_NAME = 'idx_users_trust_profile'
  ) THEN
    ALTER TABLE users ADD INDEX idx_users_trust_profile (can_travel, preferred_time);
  END IF;
END$$
DELIMITER ;

CALL add_user_index_if_missing();
DROP PROCEDURE IF EXISTS add_user_index_if_missing;

-- Verification: these columns must appear below.
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'users'
  AND COLUMN_NAME IN (
    'profile_photo', 'address', 'whatsapp', 'emergency_contact',
    'preferred_area', 'preferred_time', 'can_travel', 'bio'
  )
ORDER BY FIELD(
  COLUMN_NAME,
  'profile_photo', 'address', 'whatsapp', 'emergency_contact',
  'preferred_area', 'preferred_time', 'can_travel', 'bio'
);
