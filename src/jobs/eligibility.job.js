const pool = require("../config/db");
const notificationRepository = require("../repositories/notification.repository");
const emailService = require("../services/email.service");

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
let eligibilityJobTimer = null;
let isRunning = false;

const isMissingNotificationsTable = (error) =>
  error?.code === "ER_NO_SUCH_TABLE" && /notifications/i.test(error?.message || "");

const cooldownDateExpression = `
  CASE
    WHEN LOWER(COALESCE(gender, '')) = 'female'
      THEN DATE_ADD(last_donation_date, INTERVAL 120 DAY)
    ELSE DATE_ADD(last_donation_date, INTERVAL 90 DAY)
  END
`;

const cooldownPassedCondition = `
  last_donation_date IS NOT NULL
  AND (
    (
      LOWER(COALESCE(gender, '')) = 'female'
      AND DATE_ADD(last_donation_date, INTERVAL 120 DAY) <= CURDATE()
    )
    OR (
      LOWER(COALESCE(gender, '')) <> 'female'
      AND DATE_ADD(last_donation_date, INTERVAL 90 DAY) <= CURDATE()
    )
  )
`;

const refreshEligibilityAndNotify = async ({ donorId = null, silent = false } = {}) => {
  if (isRunning) {
    return { skipped: true, reason: "Eligibility refresh is already running" };
  }

  isRunning = true;

  try {
    const donorFilter = donorId ? "AND id = ?" : "";
    const updateParams = donorId ? [donorId] : [];

    const [updateResult] = await pool.query(
      `UPDATE users
       SET is_eligible_donor = 1
       WHERE role IN ('donor', 'both')
         AND account_status = 'active'
         ${donorFilter}
         AND ${cooldownPassedCondition}`,
      updateParams
    );

    let eligibleDonors = [];

    try {
      const selectParams = donorId ? [donorId] : [];

      const [rows] = await pool.query(
        `SELECT
           u.id,
           u.full_name,
           u.gender,
           u.email,
           u.donor_availability,
           u.last_donation_date,
           ${cooldownDateExpression} AS next_eligible_date
         FROM users u
         WHERE u.role IN ('donor', 'both')
           AND u.account_status = 'active'
           ${donorId ? "AND u.id = ?" : ""}
           AND ${cooldownPassedCondition.replaceAll("last_donation_date", "u.last_donation_date").replaceAll("gender", "u.gender")}
           AND NOT EXISTS (
             SELECT 1
             FROM notifications n
             WHERE n.user_id = u.id
               AND n.type = 'eligibility'
               AND DATE(n.created_at) >= DATE(${cooldownDateExpression.replaceAll("last_donation_date", "u.last_donation_date").replaceAll("gender", "u.gender")})
           )
         ORDER BY next_eligible_date ASC
         LIMIT 100`,
        selectParams
      );

      eligibleDonors = rows;
    } catch (error) {
      if (isMissingNotificationsTable(error)) {
        if (!silent) {
          console.warn("Notifications table is missing. Eligibility was refreshed without notifications.");
        }
        eligibleDonors = [];
      } else {
        throw error;
      }
    }

    let notified = 0;
    let emailsSent = 0;

    for (const donor of eligibleDonors) {
      const isAvailable = donor.donor_availability === "available";
      const message = isAvailable
        ? "Your cooldown period is complete. You are eligible and currently visible as available for matching."
        : "Your cooldown period is complete. You are eligible again. Turn availability ON when you are ready to donate.";

      try {
        const insertedId = await notificationRepository.createNotification({
          userId: donor.id,
          title: "You are eligible to donate again",
          message,
          type: "eligibility",
          link: "/donor",
          priorityScore: 85,
        });

        if (insertedId) notified += 1;
      } catch (notificationError) {
        if (!silent) {
          console.error(
            `Eligibility notification failed for donor ${donor.id}:`,
            notificationError.message
          );
        }
      }

      try {
        const emailResult = await emailService.sendEligibilityEmail(donor);
        if (emailResult.sent) emailsSent += 1;
      } catch (emailError) {
        if (!silent) {
          console.error(
            `Eligibility email failed for donor ${donor.id}:`,
            emailError.message
          );
        }
      }
    }

    const summary = {
      success: true,
      donors_refreshed: Number(updateResult?.affectedRows || 0),
      notifications_sent: notified,
      emails_sent: emailsSent,
    };

    if (!silent && (summary.donors_refreshed > 0 || summary.notifications_sent > 0 || summary.emails_sent > 0)) {
      console.log("Eligibility refresh:", summary);
    }

    return summary;
  } catch (error) {
    if (!silent) {
      console.error("Eligibility refresh job failed:", error.message);
    }

    return {
      success: false,
      message: error.message,
    };
  } finally {
    isRunning = false;
  }
};

const startEligibilityJob = () => {
  if (eligibilityJobTimer) return eligibilityJobTimer;

  const intervalMs = Number(process.env.ELIGIBILITY_JOB_INTERVAL_MS || DEFAULT_INTERVAL_MS);
  const safeIntervalMs = Number.isFinite(intervalMs) && intervalMs >= 60000 ? intervalMs : DEFAULT_INTERVAL_MS;

  // Run once shortly after server boot, then repeat.
  setTimeout(() => {
    refreshEligibilityAndNotify().catch((error) => {
      console.error("Initial eligibility refresh failed:", error.message);
    });
  }, 5000);

  eligibilityJobTimer = setInterval(() => {
    refreshEligibilityAndNotify().catch((error) => {
      console.error("Scheduled eligibility refresh failed:", error.message);
    });
  }, safeIntervalMs);

  if (typeof eligibilityJobTimer.unref === "function") {
    eligibilityJobTimer.unref();
  }

  // console.log(`Eligibility notification job scheduled every ${Math.round(safeIntervalMs / 60000)} minute(s).`);
  return eligibilityJobTimer;
};

module.exports = {
  refreshEligibilityAndNotify,
  startEligibilityJob,
};
