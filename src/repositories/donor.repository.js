const pool = require("../config/db");

const getDonorProfileById = async (userId) => {
  const [rows] = await pool.query(
    `SELECT id, full_name, email, phone, role, preferred_mode, blood_group, gender, city,
            latitude, longitude, location_updated_at,
            donor_availability, is_eligible_donor, health_check_completed,post_donation_pending,
            last_donation_date, reliability_score, account_status,
            is_verified_donor, verification_status, verification_notes, verified_at, created_at,
            profile_photo, address, whatsapp, emergency_contact,
            preferred_area, preferred_time, can_travel, bio,
            (
    SELECT COUNT(*)
    FROM donations d
    WHERE d.donor_id = users.id
  ) AS total_donations
   
     FROM users
     WHERE id = ? AND role IN ('donor', 'both')`,
    [userId]
  );

  return rows[0];
};

const updateDonorProfile = async ({
  userId,
  full_name,
  blood_group,
  gender,
  city,
  profile_photo,
  address,
  whatsapp,
  emergency_contact,
  preferred_area,
  preferred_time,
  can_travel,
  bio,
}) => {
  const [result] = await pool.query(
    `UPDATE users
     SET full_name = ?,
         blood_group = ?,
         gender = ?,
         city = ?,
         profile_photo = COALESCE(?, profile_photo),
         address = ?,
         whatsapp = ?,
         emergency_contact = ?,
         preferred_area = ?,
         preferred_time = ?,
         can_travel = ?,
         bio = ?
     WHERE id = ? AND role IN ('donor', 'both')`,
    [
      full_name,
      blood_group,
      gender,
      city,
      profile_photo || null,
      address || null,
      whatsapp || null,
      emergency_contact || null,
      preferred_area || null,
      preferred_time || "anytime",
      can_travel ? 1 : 0,
      bio || null,
      userId,
    ]
  );

  return {
    affectedRows: result.affectedRows,
    changedRows: result.changedRows,
  };
};

module.exports = {
  getDonorProfileById,
  updateDonorProfile,
};
