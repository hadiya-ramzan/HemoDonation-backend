const express = require("express");
const authController = require("../controllers/auth.controller");
const {
    forgotPassword,
    resetPassword,
} = require("../controllers/auth.controller");

const router = express.Router();

router.post("/signup", authController.signup);
router.post("/login", authController.login);
router.post("/verify-otp", authController.verifyOTP);
router.post("/resend-otp", authController.resendOTP);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);

module.exports = router;