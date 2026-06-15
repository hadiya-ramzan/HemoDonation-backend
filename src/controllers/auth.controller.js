const authService = require("../services/auth.service");
const {
  isValidPakistaniPhone,
  validatePassword,
  validateSignupPayload,
} = require("../utils/validation.util");

// signup
const signup = async (req, res) => {
  try {
    const validation = validateSignupPayload(req.body);

    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: validation.message,
        password_checks: validation.checks,
      });
    }

    const {
      full_name,
      email,
      phone,
      password,
      role,
      blood_group,
      gender,
      city,
      latitude,
      longitude,
    } = validation.sanitized;

    const user = await authService.signupUser({
      full_name,
      email,
      phone,
      password,
      role: "both",
      preferred_mode: role,
      blood_group,
      gender,
      city,
      latitude,
      longitude,
    });

    return res.status(201).json({
      success: true,
      message: "Signup successful",
      user,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// login
const login = async (req, res) => {
  try {
    const { login, password } = req.body;

    if (!login || !password) {
      return res.status(400).json({
        success: false,
        message: "Email/phone and password are required",
      });
    }

    const result = await authService.loginUser({
      login: String(login).trim().toLowerCase(),
      password,
    });

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token: result.token,
      user: result.user,
    });
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: error.message,
    });
  }
};

// verify OTP
const verifyOTP = async (req, res) => {
  try {
    const { phone, otp_code } = req.body;

    if (!phone || !otp_code) {
      return res.status(400).json({
        success: false,
        message: "Phone and OTP are required",
      });
    }

    if (!isValidPakistaniPhone(phone)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid Pakistani phone number: 03XXXXXXXXX.",
      });
    }

    if (!/^\d{6}$/.test(String(otp_code))) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid 6-digit OTP.",
      });
    }

    const result = await authService.verifyOTP({
      phone: String(phone).trim(),
      otp_code: String(otp_code).trim(),
    });

    return res.status(200).json({
      success: true,
      message: "Phone number verified successfully",
      token: result.token,
      user: result.user,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// resend OTP
const resendOTP = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required",
      });
    }

    if (!isValidPakistaniPhone(phone)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid Pakistani phone number: 03XXXXXXXXX.",
      });
    }

    const result = await authService.resendOTP({ phone: String(phone).trim() });

    return res.status(200).json({
      success: true,
      message: "New OTP generated successfully",
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// forgot password (send OTP)
const forgotPassword = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required",
      });
    }

    if (!isValidPakistaniPhone(phone)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid Pakistani phone number: 03XXXXXXXXX.",
      });
    }

    const result = await authService.forgotPassword({ phone: String(phone).trim() });

    return res.status(200).json({
      success: true,
      message: "OTP sent successfully",
      data: result, // for testing (OTP)
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// reset password
const resetPassword = async (req, res) => {
  try {
    const { phone, otp_code, new_password } = req.body;

    if (!phone || !otp_code || !new_password) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    if (!isValidPakistaniPhone(phone)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid Pakistani phone number: 03XXXXXXXXX.",
      });
    }

    if (!/^\d{6}$/.test(String(otp_code))) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid 6-digit OTP.",
      });
    }

    const passwordValidation = validatePassword(new_password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: passwordValidation.message,
        password_checks: passwordValidation.checks,
      });
    }

    await authService.resetPassword({
      phone: String(phone).trim(),
      otp_code: String(otp_code).trim(),
      new_password,
    });

    return res.status(200).json({
      success: true,
      message: "Password reset successful",
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  signup,
  login,
  verifyOTP,
  resendOTP,
  forgotPassword,
  resetPassword,
};
