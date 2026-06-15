const express = require("express");
const recipientController = require("../controllers/recipient.controller");
const { verifyToken } = require("../middlewares/auth.middleware");
const { allowRoles } = require("../middlewares/role.middleware");

const router = express.Router();

router.get(
  "/profile",
  verifyToken,
  allowRoles("recipient", "both"),
  recipientController.getRecipientProfile
);

router.put(
  "/profile",
  verifyToken,
  allowRoles("recipient", "both"),
  recipientController.updateRecipientProfile
);

module.exports = router;