const pool = require("../config/db");

const findUserByEmailOrPhone = async (email, phone) => {
  const [rows] = await pool.query(
    "SELECT * FROM users WHERE email = ? OR phone = ?",
    [email, phone]
  );

  return rows[0];
};

const findUserByEmailOrPhoneForLogin = async (login) => {
  const [rows] = await pool.query(
    "SELECT * FROM users WHERE email = ? OR phone = ?",
    [login, login]
  );

  return rows[0];
};

const createUser = async ({
  full_name,
  email,
  phone,
  password,
  role,
  preferred_mode,
  blood_group,
  gender,
  city,
  latitude,
  longitude,
  otp_code,
  otp_expiry,
}) => {
  const [result] = await pool.query(
    `INSERT INTO users 
(full_name, email, phone, password, role, preferred_mode, blood_group, gender, city, latitude, longitude, otp_code, otp_expiry) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      full_name,
      email,
      phone,
      password,
      role,
      preferred_mode,
      blood_group,
      gender,
      city,
      latitude,
      longitude,
      otp_code,
      otp_expiry,
    ]
  );

  return result.insertId;
};

const findUserByPhone = async (phone) => {
  const [rows] = await pool.query(
    "SELECT * FROM users WHERE phone = ?",
    [phone]
  );

  return rows[0];
};

const verifyUserPhone = async (userId) => {
  const [result] = await pool.query(
    `UPDATE users 
     SET is_phone_verified = true,
         account_status = 'active',
         otp_code = NULL,
         otp_expiry = NULL
     WHERE id = ?`,
    [userId]
  );

  return result.affectedRows;
};

const updateUserOTP = async ({ userId, otp_code, otp_expiry }) => {
  const [result] = await pool.query(
    `UPDATE users 
     SET otp_code = ?, otp_expiry = ?
     WHERE id = ?`,
    [otp_code, otp_expiry, userId]
  );

  return result.affectedRows;
};

const updateOTP = async (phone, otp_code, otp_expiry) => {
  const [result] = await pool.query(
    "UPDATE users SET otp_code = ?, otp_expiry = ? WHERE phone = ?",
    [otp_code, otp_expiry, phone]
  );

  return result.affectedRows;
};

const updatePassword = async (phone, password) => {
  const [result] = await pool.query(
    "UPDATE users SET password = ? WHERE phone = ?",
    [password, phone]
  );

  return result.affectedRows;
};

const clearOTP = async (phone) => {
  const [result] = await pool.query(
    "UPDATE users SET otp_code = NULL, otp_expiry = NULL WHERE phone = ?",
    [phone]
  );

  return result.affectedRows;
};

module.exports = {
  findUserByEmailOrPhone,
  findUserByEmailOrPhoneForLogin,
  createUser,
  findUserByPhone,
  verifyUserPhone,
  updateUserOTP,
  updateOTP,
  updatePassword,
  clearOTP,
};