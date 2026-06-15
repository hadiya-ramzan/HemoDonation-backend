USE hemodonation_db;

-- Patch 12: Phase 6 Admin Panel
-- Adds donor verification + donation approval fields safely.
-- Existing active donor-capable accounts are marked verified so current donor search keeps working.

SET @OLD_SQL_SAFE_UPDATES = @@SQL_SAFE_UPDATES;
SET SQL_SAFE_UPDATES = 0;

DROP PROCEDURE IF EXISTS add_column_if_missing;
DELIMITER $$
CREATE PROCEDURE add_column_if_missing(
  IN p_table_name VARCHAR(64),
  IN p_column_name VARCHAR(64),
  IN p_column_definition TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table_name
      AND COLUMN_NAME = p_column_name
  ) THEN
    SET @sql_stmt = CONCAT('ALTER TABLE `', p_table_name, '` ADD COLUMN `', p_column_name, '` ', p_column_definition);
    PREPARE stmt FROM @sql_stmt;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

CALL add_column_if_missing('users', 'is_verified_donor', 'TINYINT(1) NOT NULL DEFAULT 0 AFTER account_status');
CALL add_column_if_missing('users', 'verification_status', 'VARCHAR(30) NOT NULL DEFAULT ''unverified'' AFTER is_verified_donor');
CALL add_column_if_missing('users', 'verification_notes', 'VARCHAR(255) NULL AFTER verification_status');
CALL add_column_if_missing('users', 'verified_at', 'DATETIME NULL AFTER verification_notes');
CALL add_column_if_missing('users', 'verified_by', 'INT UNSIGNED NULL AFTER verified_at');

CALL add_column_if_missing('donations', 'approval_status', 'VARCHAR(30) NOT NULL DEFAULT ''pending'' AFTER notes');
CALL add_column_if_missing('donations', 'approval_notes', 'VARCHAR(255) NULL AFTER approval_status');
CALL add_column_if_missing('donations', 'approved_at', 'DATETIME NULL AFTER approval_notes');
CALL add_column_if_missing('donations', 'approved_by', 'INT UNSIGNED NULL AFTER approved_at');

DROP PROCEDURE IF EXISTS add_index_if_missing;
DELIMITER $$
CREATE PROCEDURE add_index_if_missing(
  IN p_table_name VARCHAR(64),
  IN p_index_name VARCHAR(64),
  IN p_index_definition TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table_name
      AND INDEX_NAME = p_index_name
  ) THEN
    SET @sql_stmt = CONCAT('ALTER TABLE `', p_table_name, '` ADD INDEX `', p_index_name, '` ', p_index_definition);
    PREPARE stmt FROM @sql_stmt;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

CALL add_index_if_missing('users', 'idx_users_verified_donor', '(is_verified_donor, verification_status)');
CALL add_index_if_missing('donations', 'idx_donations_approval_status', '(approval_status, created_at)');

-- Keep current demo/search working: active donor-capable users become verified.
UPDATE users
SET is_verified_donor = 1,
    verification_status = 'verified',
    verified_at = COALESCE(verified_at, NOW()),
    verification_notes = COALESCE(verification_notes, 'Auto-verified during Phase 6 migration for existing active donor records.')
WHERE role IN ('donor', 'both')
  AND account_status = 'active'
  AND COALESCE(is_verified_donor, 0) = 0;

-- Existing completed donations become approved so old tested records do not appear as unresolved.
UPDATE donations
SET approval_status = 'approved',
    approved_at = COALESCE(approved_at, created_at, NOW()),
    approval_notes = COALESCE(approval_notes, 'Auto-approved existing donation records during Phase 6 migration.')
WHERE COALESCE(approval_status, 'pending') = 'pending'
  AND created_at < NOW();

DROP PROCEDURE IF EXISTS add_column_if_missing;
DROP PROCEDURE IF EXISTS add_index_if_missing;

SET SQL_SAFE_UPDATES = @OLD_SQL_SAFE_UPDATES;

SELECT
  (SELECT COUNT(*) FROM users WHERE role IN ('donor', 'both')) AS total_donor_capable_users,
  (SELECT COUNT(*) FROM users WHERE role IN ('donor', 'both') AND is_verified_donor = 1) AS verified_donors,
  (SELECT COUNT(*) FROM donations WHERE approval_status = 'pending') AS pending_donation_approvals,
  (SELECT COUNT(*) FROM donations WHERE approval_status = 'approved') AS approved_donations;
