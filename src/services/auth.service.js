const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const authRepository = require("../repositories/auth.repository");
const { generateOTP, getOTPExpiry } = require("../utils/otp.util");
const { validatePassword } = require("../utils/validation.util");

const createToken = (user) => {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
    throw new Error("JWT_SECRET is missing or too short in backend .env file");
  }

  return jwt.sign(
    {
      id: user.id,
      role: user.role,
      preferred_mode: user.preferred_mode,
      email: user.email,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "1d",
    }
  );
};

// signup user function
const signupUser = async (userData) => {
  const {
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
  } = userData;

  const passwordValidation = validatePassword(password, { full_name, email, phone });

  if (!passwordValidation.isValid) {
    throw new Error(passwordValidation.message);
  }

  const existingUser = await authRepository.findUserByEmailOrPhone(
    email,
    phone
  );

  if (existingUser) {
    throw new Error("User with this email or phone already exists");
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const otp_code = generateOTP();
  const otp_expiry = getOTPExpiry();

  const userId = await authRepository.createUser({
    full_name,
    email,
    phone,
    password: hashedPassword,
    role,
    preferred_mode,
    blood_group,
    gender,
    city,
    latitude,
    longitude,
    otp_code,
    otp_expiry,
  });

  return {
    id: userId,
    full_name,
    email,
    phone,
    role,
    preferred_mode,
    blood_group,
    gender,
    city,
    latitude,
    longitude,
    otp_code,
    otp_expiry,
  };
};

// login user
const loginUser = async ({ login, password }) => {
  const user = await authRepository.findUserByEmailOrPhoneForLogin(login);

  if (!user) {
    throw new Error("Invalid email/phone or password");
  }

  const isPasswordMatch = await bcrypt.compare(password, user.password);

  if (!isPasswordMatch) {
    throw new Error("Invalid email/phone or password");
  }

  if (!user.is_phone_verified) {
    throw new Error("Please verify your phone number before login");
  }

  if (user.account_status !== "active") {
    throw new Error("Your account is not active");
  }

  const token = createToken(user);

  return {
    token,
    user: {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      preferred_mode: user.preferred_mode,
      blood_group: user.blood_group,
      gender: user.gender,
      city: user.city,

      latitude: user.latitude,
      longitude: user.longitude,

      is_phone_verified: user.is_phone_verified,
      account_status: user.account_status,
    },
  };
};

// verify otp
const verifyOTP = async ({ phone, otp_code }) => {
  const user = await authRepository.findUserByPhone(phone);

  if (!user) {
    throw new Error("User not found");
  }

  if (user.is_phone_verified) {
    throw new Error("Phone number is already verified");
  }

  if (!user.otp_code || !user.otp_expiry) {
    throw new Error("OTP not found. Please request a new OTP");
  }

  if (user.otp_code !== otp_code) {
    throw new Error("Invalid OTP");
  }

  const currentTime = new Date();
  const otpExpiryTime = new Date(user.otp_expiry);

  if (currentTime > otpExpiryTime) {
    throw new Error("OTP expired. Please request a new OTP");
  }

  await authRepository.verifyUserPhone(user.id);

  const updatedUser = {
    ...user,
    is_phone_verified: true,
    account_status: "active",
  };

  const token = createToken(updatedUser);

  return {
    token,
    user: {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      preferred_mode: user.preferred_mode,
      blood_group: user.blood_group,
      gender: user.gender,
      city: user.city,
      latitude: user.latitude,
      longitude: user.longitude,
      is_phone_verified: true,
      account_status: "active",
    },
  };
};

// resend OTP
const resendOTP = async ({ phone }) => {
  const user = await authRepository.findUserByPhone(phone);

  if (!user) {
    throw new Error("User not found");
  }

  if (user.is_phone_verified) {
    throw new Error("Phone number is already verified");
  }

  const otp_code = generateOTP();
  const otp_expiry = getOTPExpiry();

  await authRepository.updateUserOTP({
    userId: user.id,
    otp_code,
    otp_expiry,
  });

  return {
    phone: user.phone,
    otp_code,
    otp_expiry,
  };
};

// forgot password
const forgotPassword = async ({ phone }) => {
  const user = await authRepository.findUserByPhone(phone);

  if (!user) {
    throw new Error("User not found");
  }

  const otp_code = Math.floor(100000 + Math.random() * 900000).toString();
  const otp_expiry = new Date(Date.now() + 2 * 60 * 1000);

  await authRepository.updateOTP(phone, otp_code, otp_expiry);

  return { otp_code };
};

// reset password
const resetPassword = async ({ phone, otp_code, new_password }) => {
  const user = await authRepository.findUserByPhone(phone);

  if (!user) {
    throw new Error("User not found");
  }

  if (user.otp_code !== otp_code) {
    throw new Error("Invalid OTP");
  }

  if (new Date() > new Date(user.otp_expiry)) {
    throw new Error("OTP expired");
  }

  const passwordValidation = validatePassword(new_password);

  if (!passwordValidation.isValid) {
    throw new Error(passwordValidation.message);
  }

  const hashedPassword = await bcrypt.hash(new_password, 10);

  await authRepository.updatePassword(phone, hashedPassword);
  await authRepository.clearOTP(phone);
};

module.exports = {
  signupUser,
  loginUser,
  verifyOTP,
  resendOTP,
  forgotPassword,
  resetPassword,
};