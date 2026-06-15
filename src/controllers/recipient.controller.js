const recipientRepository = require("../repositories/recipient.repository");

const calculateProfileCompleteness = (recipient) => {
  const fields = [
    recipient.full_name,
    recipient.phone,
    recipient.blood_group,
    recipient.gender,
    recipient.city,
  ];

  const filled = fields.filter(Boolean).length;
  return Math.round((filled / fields.length) * 100);
};

const getRecipientProfile = async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Invalid token. User id missing.",
      });
    }

    const recipient = await recipientRepository.getRecipientProfileById(userId);

    if (!recipient) {
      return res.status(404).json({
        success: false,
        message: "Recipient profile not found",
      });
    }

    return res.status(200).json({
      success: true,
      recipient,
      completeness: calculateProfileCompleteness(recipient),
    });
  } catch (error) {
    console.error("Get recipient profile error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch recipient profile",
    });
  }
};

const updateRecipientProfile = async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Invalid token. User id missing.",
      });
    }

    const { full_name, blood_group, gender, city } = req.body;

    if (!full_name || !blood_group || !gender || !city) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    const affectedRows = await recipientRepository.updateRecipientProfile({
      userId,
      full_name,
      blood_group,
      gender,
      city,
    });

    if (affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Recipient profile not found or update not allowed",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
    });
  } catch (error) {
    console.error("Update recipient profile error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update recipient profile",
    });
  }
};

module.exports = {
  getRecipientProfile,
  updateRecipientProfile,
};