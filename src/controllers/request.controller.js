const requestRepository = require("../repositories/request.repository");
const donorRepository = require("../repositories/donor.repository");

const getUserId = (req) => {
  return req.user?.id || req.user?.userId || req.user?.user_id;
};

const createRequest = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Invalid token. User id missing.",
      });
    }

    const {
      blood_group,
      city,
      hospital_name,
      patient_name,
      units_needed,
      urgency,
      notes,
    } = req.body;

    if (
      !blood_group ||
      !city ||
      !hospital_name ||
      !patient_name ||
      !units_needed ||
      !urgency
    ) {
      return res.status(400).json({
        success: false,
        message: "All required fields must be filled",
      });
    }

    const result = await requestRepository.createBloodRequest({
      recipient_id: userId,
      blood_group,
      city,
      hospital_name,
      patient_name,
      units_needed,
      urgency,
      notes,
    });

    return res.status(201).json({
      success: true,
      message: result?.notifiedDonors
        ? `Blood request created successfully. ${result.notifiedDonors} matching donor(s) notified.`
        : "Blood request created successfully. No matching available donor found for instant notification.",
      request_id: result?.requestId || result,
      notified_donors: result?.notifiedDonors || 0,
      email_notifications_sent: result?.emailNotificationsSent || 0,
    });
  } catch (error) {
    console.error("Create request error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create blood request",
    });
  }
};

const getMyRequests = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Invalid token. User id missing.",
      });
    }

    const requests = await requestRepository.getRequestsByRecipient(userId);

    return res.status(200).json({
      success: true,
      requests,
    });
  } catch (error) {
    console.error("Get my requests error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch requests",
    });
  }
};
const getMatchingRequestsController = async (req, res) => {
  try {

    const userId = Number(getUserId(req));

    console.log("MATCHING CONTROLLER HIT");
    console.log("USER ID:", userId);

    const donor = await donorRepository.getDonorProfileById(userId);

    console.log("DONOR PROFILE:", donor);

    const requests = await requestRepository.getMatchingRequests(
      donor.blood_group,
      donor.city,
      userId
    );

    console.log("FINAL REQUESTS:", requests);

    return res.status(200).json({
      success: true,
      requests,
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false
    });
  }
};

const respondToRequest = async (req, res) => {
  try {
    const requestId = req.params.id;
    const donorId = getUserId(req);
    const { action } = req.body;

    if (!donorId) {
      return res.status(401).json({
        success: false,
        message: "Invalid token",
      });
    }

    if (!["accept", "reject"].includes(action)) {
      return res.status(400).json({
        success: false,
        message: "Action must be accept or reject",
      });
    }

    const status = action === "accept" ? "accepted" : "rejected";

    const result = await requestRepository.respondToRequest({
      requestId,
      donorId,
      status,
    });

    if (!result?.affectedRows) {
      return res.status(400).json({
        success: false,
        message: result?.reason || "Request already processed or not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: action === "accept"
        ? "Request accepted successfully. Please contact the recipient and donate safely."
        : "Request skipped successfully.",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

const completeRequest = async (req, res) => {
  try {
    const recipientId = getUserId(req);
    const requestId = req.params.requestId;

    if (!recipientId) {
      return res.status(401).json({
        success: false,
        message: "Invalid token. Recipient id missing.",
      });
    }

    const affectedRows = await requestRepository.completeBloodRequest({
      requestId,
      recipientId,
    });

    if (affectedRows === 0) {
      return res.status(400).json({
        success: false,
        message: "Request cannot be completed or is not accepted yet",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Request marked as completed successfully",
    });
  } catch (error) {
    console.error("Complete request error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to complete request",
    });
  }
};

const getDonorHistoryController = async (req, res) => {
  try {
    const donorId = getUserId(req);

    if (!donorId) {
      return res.status(401).json({
        success: false,
        message: "Invalid token. Donor id missing.",
      });
    }

    const history = await requestRepository.getDonorHistory(donorId);

    return res.status(200).json({
      success: true,
      history,
    });
  } catch (error) {
    console.error("Get donor history error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch donor history",
    });
  }
};

const getRecipientHistoryController = async (req, res) => {
  try {
    const recipientId = getUserId(req);

    if (!recipientId) {
      return res.status(401).json({
        success: false,
        message: "Invalid token. Recipient id missing.",
      });
    }

    const history = await requestRepository.getRecipientHistory(recipientId);

    return res.status(200).json({
      success: true,
      history,
    });
  } catch (error) {
    console.error("Get recipient history error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch recipient history",
    });
  }
};


module.exports = {
  createRequest,
  getMyRequests,
  getMatchingRequestsController,
  respondToRequest,
  completeRequest,
  getDonorHistoryController,
  getRecipientHistoryController,
};


