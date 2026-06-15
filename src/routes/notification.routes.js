const express = require("express");
const notificationController = require("../controllers/notification.controller");
const { verifyToken } = require("../middlewares/auth.middleware");

const router = express.Router();

router.get("/", verifyToken, notificationController.listNotifications);
router.get("/unread-count", verifyToken, notificationController.getUnreadCount);
router.patch("/mark-all-read", verifyToken, notificationController.markAllRead);
router.patch("/:id/read", verifyToken, notificationController.markRead);

module.exports = router;
