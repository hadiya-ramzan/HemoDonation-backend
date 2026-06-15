const pool = require("../config/db");

const getRecipientProfileById = async (userId) => {
  const [rows] = await pool.query(
    `SELECT id, full_name, email, phone, role, blood_group, gender, city
     FROM users
     WHERE id = ? AND role IN ('recipient', 'both')`,
    [userId]
  );

  return rows[0];
};

const updateRecipientProfile = async ({
  userId,
  full_name,
  blood_group,
  gender,
  city,
}) => {
  const [result] = await pool.query(
    `UPDATE users 
     SET full_name = ?, blood_group = ?, gender = ?, city = ?
     WHERE id = ? AND role IN ('recipient', 'both')`,
    [full_name, blood_group, gender, city, userId]
  );

  return result.affectedRows;
};

module.exports = {
  getRecipientProfileById,
  updateRecipientProfile,
};