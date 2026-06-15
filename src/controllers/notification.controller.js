const notificationRepository = require("../repositories/notification.repository");

const getUserId = (req) => req.user?.id || req.user?.userId || req.user?.user_id;

const listNotifications = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({ success: false, message: "Invalid token" });
    }

    const notifications = await notificationRepository.getNotificationsByUser(userId, req.query.limit);
    const unread_count = await notificationRepository.getUnreadCount(userId);

    return res.status(200).json({
      success: true,
      unread_count,
      notifications,
    });
  } catch (error) {
    console.error("List notifications error:", error);
    return res.status(500).json({ success: false, message: "Failed to load notifications" });
  }
};

const getUnreadCount = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({ success: false, message: "Invalid token" });
    }

    const unread_count = await notificationRepository.getUnreadCount(userId);
    return res.status(200).json({ success: true, unread_count });
  } catch (error) {
    console.error("Unread count error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch unread count" });
  }
};

const markRead = async (req, res) => {
  try {
    const userId = getUserId(req);
    const notificationId = req.params.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Invalid token" });
    }

    const affectedRows = await notificationRepository.markOneRead(userId, notificationId);

    if (!affectedRows) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }

    return res.status(200).json({ success: true, message: "Notification marked as read" });
  } catch (error) {
    console.error("Mark notification read error:", error);
    return res.status(500).json({ success: false, message: "Failed to update notification" });
  }
};

const markAllRead = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({ success: false, message: "Invalid token" });
    }

    const affectedRows = await notificationRepository.markAllRead(userId);
    return res.status(200).json({
      success: true,
      message: "All notifications marked as read",
      affected_rows: affectedRows,
    });
  } catch (error) {
    console.error("Mark all notifications read error:", error);
    return res.status(500).json({ success: false, message: "Failed to update notifications" });
  }
};

module.exports = {
  listNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
};
