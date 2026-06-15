const pool = require("../config/db");

const clampPriority = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(Math.max(Math.round(parsed), 0), 100);
};

const isMissingNotificationTable = (error) =>
  error?.code === "ER_NO_SUCH_TABLE" || /notifications/i.test(error?.message || "") && /doesn't exist/i.test(error?.message || "");

const isMissingPriorityColumn = (error) =>
  error?.code === "ER_BAD_FIELD_ERROR" && /priority_score/i.test(error?.message || "");

let priorityColumnCache = null;

const hasPriorityScoreColumn = async () => {
  if (priorityColumnCache !== null) return priorityColumnCache;

  try {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS count
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'notifications'
         AND COLUMN_NAME = 'priority_score'`
    );

    priorityColumnCache = Number(rows[0]?.count || 0) > 0;
    return priorityColumnCache;
  } catch (error) {
    priorityColumnCache = false;
    return false;
  }
};

const createNotification = async (
  { userId, title, message, type = "system", link = null, priorityScore = 0 },
  connection = null
) => {
  const db = connection || pool;

  try {
    if (await hasPriorityScoreColumn()) {
      const [result] = await db.query(
        `INSERT INTO notifications (user_id, title, message, type, link, priority_score)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, title, message, type, link, clampPriority(priorityScore)]
      );
      return result.insertId;
    }

    const [result] = await db.query(
      `INSERT INTO notifications (user_id, title, message, type, link)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, title, message, type, link]
    );
    return result.insertId;
  } catch (error) {
    if (isMissingPriorityColumn(error)) {
      priorityColumnCache = false;
      const [result] = await db.query(
        `INSERT INTO notifications (user_id, title, message, type, link)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, title, message, type, link]
      );
      return result.insertId;
    }

    if (isMissingNotificationTable(error)) {
      console.warn("Notifications table is missing. Skipping notification insert.");
      return 0;
    }

    throw error;
  }
};

const createBulkNotifications = async (notifications = [], connection = null) => {
  if (!Array.isArray(notifications) || notifications.length === 0) return 0;

  const db = connection || pool;

  try {
    if (await hasPriorityScoreColumn()) {
      const values = notifications.map((item) => [
        item.userId,
        item.title,
        item.message,
        item.type || "system",
        item.link || null,
        clampPriority(item.priorityScore),
      ]);

      const [result] = await db.query(
        `INSERT INTO notifications (user_id, title, message, type, link, priority_score)
         VALUES ?`,
        [values]
      );
      return result.affectedRows;
    }

    const values = notifications.map((item) => [
      item.userId,
      item.title,
      item.message,
      item.type || "system",
      item.link || null,
    ]);

    const [result] = await db.query(
      `INSERT INTO notifications (user_id, title, message, type, link)
       VALUES ?`,
      [values]
    );
    return result.affectedRows;
  } catch (error) {
    if (isMissingPriorityColumn(error)) {
      priorityColumnCache = false;
      const values = notifications.map((item) => [
        item.userId,
        item.title,
        item.message,
        item.type || "system",
        item.link || null,
      ]);

      const [result] = await db.query(
        `INSERT INTO notifications (user_id, title, message, type, link)
         VALUES ?`,
        [values]
      );
      return result.affectedRows;
    }

    if (isMissingNotificationTable(error)) {
      console.warn("Notifications table is missing. Skipping bulk notification insert.");
      return 0;
    }

    throw error;
  }
};

const getNotificationsByUser = async (userId, limit = 50) => {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);

  try {
    if (await hasPriorityScoreColumn()) {
      const [rows] = await pool.query(
        `SELECT id, title, message, type, link, is_read, priority_score, created_at
         FROM notifications
         WHERE user_id = ?
         ORDER BY is_read ASC, priority_score DESC, created_at DESC
         LIMIT ?`,
        [userId, safeLimit]
      );
      return rows;
    }

    const [rows] = await pool.query(
      `SELECT id, title, message, type, link, is_read, 0 AS priority_score, created_at
       FROM notifications
       WHERE user_id = ?
       ORDER BY is_read ASC, created_at DESC
       LIMIT ?`,
      [userId, safeLimit]
    );
    return rows;
  } catch (error) {
    if (isMissingPriorityColumn(error)) {
      priorityColumnCache = false;
      const [rows] = await pool.query(
        `SELECT id, title, message, type, link, is_read, 0 AS priority_score, created_at
         FROM notifications
         WHERE user_id = ?
         ORDER BY is_read ASC, created_at DESC
         LIMIT ?`,
        [userId, safeLimit]
      );
      return rows;
    }

    if (isMissingNotificationTable(error)) {
      return [];
    }

    throw error;
  }
};

const getUnreadCount = async (userId) => {
  try {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS unread_count
       FROM notifications
       WHERE user_id = ? AND is_read = 0`,
      [userId]
    );

    return Number(rows[0]?.unread_count || 0);
  } catch (error) {
    if (isMissingNotificationTable(error)) return 0;
    throw error;
  }
};

const markOneRead = async (userId, notificationId) => {
  try {
    const [result] = await pool.query(
      `UPDATE notifications
       SET is_read = 1
       WHERE id = ? AND user_id = ?`,
      [notificationId, userId]
    );

    return result.affectedRows;
  } catch (error) {
    if (isMissingNotificationTable(error)) return 0;
    throw error;
  }
};

const markAllRead = async (userId) => {
  try {
    const [result] = await pool.query(
      `UPDATE notifications
       SET is_read = 1
       WHERE user_id = ? AND is_read = 0`,
      [userId]
    );

    return result.affectedRows;
  } catch (error) {
    if (isMissingNotificationTable(error)) return 0;
    throw error;
  }
};

module.exports = {
  createNotification,
  createBulkNotifications,
  getNotificationsByUser,
  getUnreadCount,
  markOneRead,
  markAllRead,
};
