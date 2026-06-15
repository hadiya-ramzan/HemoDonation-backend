const adminRepository = require("../repositories/admin.repository");
const notificationRepository = require("../repositories/notification.repository");
const emailService = require("../services/email.service");

const getUserId = (req) => req.user?.id || req.user?.userId || req.user?.user_id;

const getStats = async (req, res) => {
  try {
    const stats = await adminRepository.getDashboardStats();

    return res.status(200).json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error("Admin stats error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch admin statistics",
    });
  }
};

const getUsers = async (req, res) => {
  try {
    const users = await adminRepository.getUsers({
      search: String(req.query.search || "").trim(),
      role: String(req.query.role || "all"),
      status: String(req.query.status || "all"),
      verification: String(req.query.verification || "all"),
    });

    return res.status(200).json({
      success: true,
      users,
    });
  } catch (error) {
    console.error("Admin users error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch users",
    });
  }
};

const getRequests = async (req, res) => {
  try {
    const requests = await adminRepository.getRequests({
      status: String(req.query.status || "all"),
    });

    return res.status(200).json({
      success: true,
      requests,
    });
  } catch (error) {
    console.error("Admin requests error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch blood requests",
    });
  }
};

const getDonations = async (req, res) => {
  try {
    const donations = await adminRepository.getDonations({
      status: String(req.query.status || "all"),
    });

    return res.status(200).json({
      success: true,
      donations,
    });
  } catch (error) {
    console.error("Admin donations error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch donation entries",
    });
  }
};

const updateUserStatus = async (req, res) => {
  try {
    const adminId = getUserId(req);
    const userId = Number(req.params.id);
    const { status } = req.body;

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid user id",
      });
    }

    if (!["pending", "active", "blocked"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be pending, active or blocked",
      });
    }

    if (adminId === userId && status === "blocked") {
      return res.status(400).json({
        success: false,
        message: "You cannot block your own admin account",
      });
    }

    const affectedRows = await adminRepository.updateUserStatus({ userId, status });

    if (affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "User status updated successfully",
    });
  } catch (error) {
    console.error("Admin update user status error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update user status",
    });
  }
};

const updateDonorVerification = async (req, res) => {
  try {
    const adminId = getUserId(req);
    const userId = Number(req.params.id);
    const { verified, notes, status } = req.body || {};

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ success: false, message: "Invalid user id" });
    }

    let affectedRows = 0;
    const normalizedStatus = String(status || "").toLowerCase();

    if (normalizedStatus === "rejected") {
      affectedRows = await adminRepository.rejectDonorVerification({
        userId,
        adminId,
        notes: String(notes || "").trim() || "Verification rejected by admin.",
      });
    } else {
      affectedRows = await adminRepository.updateDonorVerification({
        userId,
        verified: Boolean(verified),
        adminId,
        notes: String(notes || "").trim() || null,
      });
    }

    if (affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Donor account not found",
      });
    }

    const donor = await adminRepository.getUserById(userId);
    if (donor) {
      const isVerified = normalizedStatus !== "rejected" && Boolean(verified);
      const title = normalizedStatus === "rejected"
        ? "Donor verification rejected"
        : isVerified
          ? "Donor profile verified"
          : "Donor verification removed";
      const message = normalizedStatus === "rejected"
        ? "Your donor verification was rejected by admin. Please review your profile details and contact support if needed."
        : isVerified
          ? "Your donor profile has been verified by admin. Your profile can now be prioritized in donor search and emergency requests."
          : "Your donor verification has been removed by admin. Your donor profile may not appear in recipient search until verified again.";

      await notificationRepository.createNotification({
        userId,
        title,
        message,
        type: "admin",
        link: "/donor",
        priorityScore: isVerified ? 75 : 60,
      });

      await emailService.sendVerificationStatusEmail({
        donor,
        status: normalizedStatus === "rejected" ? "rejected" : isVerified ? "verified" : "unverified",
        notes: String(notes || "").trim() || null,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Donor verification updated successfully",
    });
  } catch (error) {
    console.error("Admin donor verification error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update donor verification",
    });
  }
};

const updateRequestStatus = async (req, res) => {
  try {
    const requestId = Number(req.params.id);
    const { status } = req.body;

    if (!Number.isInteger(requestId) || requestId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid request id",
      });
    }

    if (!["open", "accepted", "completed", "cancelled"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be open, accepted, completed or cancelled",
      });
    }

    const affectedRows = await adminRepository.updateRequestStatus({ requestId, status });

    if (affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Request not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Request status updated successfully",
    });
  } catch (error) {
    console.error("Admin update request status error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update request status",
    });
  }
};

const updateDonationApproval = async (req, res) => {
  try {
    const adminId = getUserId(req);
    const donationId = Number(req.params.id);
    const { approval_status, notes } = req.body || {};

    if (!Number.isInteger(donationId) || donationId <= 0) {
      return res.status(400).json({ success: false, message: "Invalid donation id" });
    }

    if (!["pending", "approved", "rejected"].includes(approval_status)) {
      return res.status(400).json({
        success: false,
        message: "Approval status must be pending, approved or rejected",
      });
    }

    const affectedRows = await adminRepository.updateDonationApproval({
      donationId,
      approvalStatus: approval_status,
      adminId,
      notes: String(notes || "").trim() || null,
    });

    if (affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Donation entry not found" });
    }

    const donation = await adminRepository.getDonationById(donationId);
    if (donation) {
      const title = approval_status === "approved"
        ? "Donation entry approved"
        : approval_status === "rejected"
          ? "Donation entry rejected"
          : "Donation approval reset";
      const message = approval_status === "approved"
        ? "Your donation entry has been approved by admin. Thank you for helping save lives."
        : approval_status === "rejected"
          ? "A donation entry linked to your profile was rejected by admin. Please contact admin if this looks incorrect."
          : "A donation entry linked to your profile has been moved back to pending review.";

      await notificationRepository.createNotification({
        userId: donation.donor_id,
        title,
        message,
        type: "admin",
        link: "/donor",
        priorityScore: approval_status === "approved" ? 70 : 55,
      });

      await emailService.sendDonationApprovalEmail({
        donation,
        approvalStatus: approval_status,
        notes: String(notes || "").trim() || null,
      });
    }

    return res.status(200).json({
      success: true,
      message: `Donation entry marked as ${approval_status}`,
    });
  } catch (error) {
    console.error("Admin donation approval error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update donation approval",
    });
  }
};

module.exports = {
  getStats,
  getUsers,
  getRequests,
  getDonations,
  updateUserStatus,
  updateDonorVerification,
  updateRequestStatus,
  updateDonationApproval,
};
