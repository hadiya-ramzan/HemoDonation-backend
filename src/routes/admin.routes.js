const express = require("express");
const adminController = require("../controllers/admin.controller");
const { verifyToken } = require("../middlewares/auth.middleware");
const { allowRoles } = require("../middlewares/role.middleware");

const router = express.Router();

router.use(verifyToken, allowRoles("admin"));

router.get("/stats", adminController.getStats);
router.get("/users", adminController.getUsers);
router.get("/requests", adminController.getRequests);
router.get("/donations", adminController.getDonations);

router.patch("/users/:id/status", adminController.updateUserStatus);
router.patch("/users/:id/verification", adminController.updateDonorVerification);
router.patch("/requests/:id/status", adminController.updateRequestStatus);
router.patch("/donations/:id/approval", adminController.updateDonationApproval);

module.exports = router;
