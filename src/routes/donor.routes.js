const express = require("express");
const donorController = require("../controllers/donor.controller");
const { verifyToken } = require("../middlewares/auth.middleware");
const { allowRoles } = require("../middlewares/role.middleware");

const router = express.Router();

router.get(
  "/search",
  verifyToken,
  allowRoles("recipient", "both", "admin"),
  donorController.searchDonors
);

router.get(
  "/profile",
  verifyToken,
  allowRoles("donor", "both"),
  donorController.getDonorProfile
);

router.put(
  "/profile",
  verifyToken,
  allowRoles("donor", "both"),
  donorController.updateProfile
);

router.patch(
  "/toggle-availability",
  verifyToken,
  allowRoles("donor", "both"),
  donorController.toggleAvailability
);

router.post(
  "/eligibility-refresh",
  verifyToken,
  allowRoles("donor", "both"),
  donorController.refreshMyEligibility
);

router.post(
  "/health-check",
  verifyToken,
  allowRoles("donor", "both"),
  donorController.submitHealthCheck
);

router.post("/pre-health-check", async (req, res) => {
  try {
    const answers = req.body;

    const failed =
      !answers.feeling_healthy ||
      answers.has_fever ||
      answers.taking_antibiotics ||
      answers.recent_surgery ||
      answers.chronic_disease;

    return res.json({
      success: true,
      passed: !failed,
      message: failed
        ? "You are temporarily not eligible for donation."
        : "Pre donation check passed.",
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.post(
  "/post-health-check",
  verifyToken,
  allowRoles("donor", "both"),
  donorController.submitPostHealthCheck
);

router.patch(
  "/clear-post-donation-flag",
  verifyToken,
  allowRoles("donor", "both"),
  donorController.clearPostDonationFlag
);

module.exports = router;
