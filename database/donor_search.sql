USE hemodonation_db;

-- 1) Normalize common text fields that can break matching because of spaces.
UPDATE users
SET city = TRIM(city)
WHERE city IS NOT NULL;

-- 2) Refresh eligibility for donors whose cooldown has passed or who never donated.
UPDATE users
SET is_eligible_donor = 1
WHERE role IN ('donor', 'both')
  AND account_status = 'active'
  AND (
    last_donation_date IS NULL
    OR (
      LOWER(gender) = 'female'
      AND DATE_ADD(last_donation_date, INTERVAL 120 DAY) <= CURDATE()
    )
    OR (
      (LOWER(gender) <> 'female' OR gender IS NULL)
      AND DATE_ADD(last_donation_date, INTERVAL 90 DAY) <= CURDATE()
    )
  );

-- 3) For active + eligible donor demo profiles, turn availability ON.
-- In the real system, donors can still turn this OFF from their dashboard.
UPDATE users
SET donor_availability = 'available'
WHERE role IN ('donor', 'both')
  AND account_status = 'active'
  AND is_eligible_donor = 1;

-- 4) Diagnostic summary: check why donors may not appear in search.
SELECT
  blood_group,
  city,
  COUNT(*) AS total_donor_profiles,
  SUM(CASE WHEN account_status = 'active' THEN 1 ELSE 0 END) AS active_profiles,
  SUM(CASE WHEN donor_availability = 'available' THEN 1 ELSE 0 END) AS available_profiles,
  SUM(CASE WHEN is_eligible_donor = 1 THEN 1 ELSE 0 END) AS eligible_profiles,
  SUM(CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 1 ELSE 0 END) AS profiles_with_location,
  SUM(CASE WHEN account_status = 'active' AND donor_availability = 'available' AND is_eligible_donor = 1 THEN 1 ELSE 0 END) AS ready_for_search
FROM users
WHERE role IN ('donor', 'both')
GROUP BY blood_group, city
ORDER BY city, blood_group;
