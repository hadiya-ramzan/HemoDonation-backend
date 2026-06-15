const fs = require("fs");
const path = require("path");
const donorRepository = require("../repositories/donor.repository");
const pool = require("../config/db");
const { refreshEligibilityAndNotify } = require("../jobs/eligibility.job");

const hasValue = (value) => value !== null && value !== undefined && String(value).trim() !== "";

const calculateProfileCompleteness = (donor) => {
  const checks = [
    { ok: hasValue(donor.full_name), weight: 5 },
    { ok: hasValue(donor.phone), weight: 5 },
    { ok: hasValue(donor.blood_group), weight: 5 },
    { ok: hasValue(donor.gender), weight: 5 },
    { ok: hasValue(donor.city), weight: 5 },
    { ok: hasValue(donor.latitude) && hasValue(donor.longitude), weight: 8 },
    { ok: Number(donor.health_check_completed) === 1, weight: 10 },
    { ok: hasValue(donor.profile_photo), weight: 12 },
    { ok: hasValue(donor.whatsapp), weight: 8 },
    { ok: hasValue(donor.emergency_contact), weight: 8 },
    { ok: hasValue(donor.address), weight: 8 },
    { ok: hasValue(donor.preferred_area), weight: 7 },
    { ok: hasValue(donor.preferred_time) && donor.preferred_time !== "anytime", weight: 4 },
    { ok: Number(donor.can_travel) === 1, weight: 5 },
    { ok: hasValue(donor.bio), weight: 5 },
  ];

  return checks.reduce((total, item) => total + (item.ok ? item.weight : 0), 0);
};

const buildPublicFileUrl = (req, filePath) => {
  if (!filePath) return null;
  if (/^https?:\/\//i.test(filePath)) return filePath;
  const normalizedPath = String(filePath).startsWith("/") ? filePath : `/${filePath}`;
  return `${req.protocol}://${req.get("host")}${normalizedPath}`;
};

const sanitizeText = (value, maxLength = 255) => {
  if (value === null || value === undefined) return null;
  const clean = String(value).trim();
  if (!clean) return null;
  return clean.slice(0, maxLength);
};

const saveProfilePhotoFromDataUrl = (dataUrl, userId) => {
  if (!dataUrl) return null;
  const match = String(dataUrl).match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/i);

  if (!match) {
    throw new Error("Profile photo must be a PNG, JPG, JPEG or WEBP image.");
  }

  const extension = match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase();
  const imageBuffer = Buffer.from(match[2], "base64");
  const maxSizeBytes = 2 * 1024 * 1024;

  if (imageBuffer.length > maxSizeBytes) {
    throw new Error("Profile photo size must be less than 2MB.");
  }

  const uploadDir = path.join(__dirname, "..", "..", "uploads", "profiles");
  fs.mkdirSync(uploadDir, { recursive: true });

  const fileName = `donor_${userId}_${Date.now()}.${extension}`;
  const fullPath = path.join(uploadDir, fileName);
  fs.writeFileSync(fullPath, imageBuffer);

  return `/uploads/profiles/${fileName}`;
};

const getCooldownDays = (gender) => {
  return String(gender || "").toLowerCase() === "female" ? 120 : 90;
};

const getEligibilityByDate = (lastDonationDate, gender) => {
  if (!lastDonationDate) {
    return {
      eligible: true,
      cooldown_days: getCooldownDays(gender),
      remaining_days: 0,
      next_donation_date: null,
    };
  }

  const cooldownDays = getCooldownDays(gender);
  const lastDate = new Date(lastDonationDate);
  const today = new Date();

  if (Number.isNaN(lastDate.getTime())) {
    return {
      eligible: false,
      cooldown_days: cooldownDays,
      remaining_days: cooldownDays,
      next_donation_date: null,
    };
  }

  const elapsedDays = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));
  const remainingDays = Math.max(cooldownDays - elapsedDays, 0);

  const nextDate = new Date(lastDate);
  nextDate.setDate(nextDate.getDate() + cooldownDays);

  return {
    eligible: remainingDays === 0,
    cooldown_days: cooldownDays,
    remaining_days: remainingDays,
    next_donation_date: nextDate.toISOString().slice(0, 10),
  };
};

const refreshEligibleDonors = async () => {
  await pool.query(
    `UPDATE users
     SET is_eligible_donor = 1
     WHERE role IN ('donor', 'both')
       AND account_status = 'active'
       AND (
         last_donation_date IS NULL
         OR (
           LOWER(gender) = 'female'
           AND DATE_ADD(last_donation_date, INTERVAL 120 DAY) <= CURDATE()
         )
         OR (
           (LOWER(gender) <> 'female' OR gender IS NULL)
           AND DATE_ADD(last_donation_date, INTERVAL 90 DAY) <= CURDATE()
         )
       )`
  );
};

const refreshSingleDonorEligibility = async (userId) => {
  const [rows] = await pool.query(
    `SELECT id, gender, last_donation_date
     FROM users
     WHERE id = ? AND role IN ('donor', 'both')`,
    [userId]
  );

  const donor = rows[0];
  if (!donor) return null;

  const eligibility = getEligibilityByDate(donor.last_donation_date, donor.gender);

  await pool.query(
    `UPDATE users
     SET is_eligible_donor = ?
     WHERE id = ?`,
    [eligibility.eligible ? 1 : 0, userId]
  );

  return eligibility;
};

const calculateDistanceKm = (lat1, lon1, lat2, lon2) => {
  if (
    lat1 === null || lat1 === undefined ||
    lon1 === null || lon1 === undefined ||
    lat2 === null || lat2 === undefined ||
    lon2 === null || lon2 === undefined
  ) {
    return null;
  }

  const earthRadiusKm = 6371;
  const dLat = ((Number(lat2) - Number(lat1)) * Math.PI) / 180;
  const dLon = ((Number(lon2) - Number(lon1)) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((Number(lat1) * Math.PI) / 180) *
    Math.cos((Number(lat2) * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Number((earthRadiusKm * c).toFixed(2));
};

const getDistanceScore = (km) => {
  if (km === null) return 0;
  if (km <= 5) return 100;
  if (km <= 10) return 85;
  if (km <= 20) return 70;
  if (km <= 30) return 50;
  return 20;
};

const getDonationGapScore = (lastDonationDate, gender) => {
  return getEligibilityByDate(lastDonationDate, gender).eligible ? 20 : 0;
};

const calculateReliabilityScore = (donor) => {
  const completeness = calculateProfileCompleteness(donor);

  const profilePoints = completeness * 0.4;

  const donationPoints = Math.min(
    Number(donor.total_donations || 0) * 8,
    40
  );

  const verifiedPoints =
    Number(donor.is_verified_donor) === 1 ? 10 : 0;

  const healthPoints =
    Number(donor.health_check_completed) === 1 ? 10 : 0;

  return Math.round(
    profilePoints +
    donationPoints +
    verifiedPoints +
    healthPoints
  );
};

const getBadge = (totalDonations = 0) => {
  const n = Number(totalDonations || 0);

  if (n === 0) return "No badge";
  if (n <= 5) return "Bronze";
  if (n <= 10) return "Silver";
  if (n <= 15) return "Gold";
  return "Diamond";
};
const parseCoordinate = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};


const getDonorProfile = async (req, res) => {
  try {
      const userId = req.user.id || req.user.userId;
    const donor = await donorRepository.getDonorProfileById(userId);
    if (!donor) {
      return res.status(404).json({
        success: false,
        message: "Donor profile not found",
      });
    }

    const eligibility = await refreshSingleDonorEligibility(userId);
    const completeness = calculateProfileCompleteness(donor);

    const reliabilityScore =
      calculateReliabilityScore(donor);

    const reliabilityBadge =
      getBadge(Number(donor.total_donations || 0));


    return res.status(200).json({
      success: true,
      donor: {
        ...donor,
        total_donations: Number(donor.total_donations || 0),
        can_travel: Number(donor.can_travel) === 1,
        profile_photo_url: buildPublicFileUrl(req, donor.profile_photo),

        profile_strength: completeness,
        reliability_score_calculated: reliabilityScore,
        reliability_badge: reliabilityBadge,

        eligibility,
      },
      completeness,
      profile_strength: completeness,
    });

  } catch (error) {
    console.error("Get donor profile error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch donor profile",
    });
  }
};

const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;

    const {
      full_name,
      blood_group,
      gender,
      city,
      address,
      whatsapp,
      emergency_contact,
      preferred_area,
      preferred_time,
      can_travel,
      bio,
      profile_photo_data_url,
    } = req.body || {};

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Session expired. Please login again.",
      });
    }

    if (!full_name || !blood_group || !gender || !city) {
      return res.status(400).json({
        success: false,
        message: "Name, blood group, gender and city are required",
      });
    }

    const existingDonor = await donorRepository.getDonorProfileById(userId);
    if (!existingDonor) {
      return res.status(404).json({
        success: false,
        message: "Donor profile not found",
      });
    }

    const allowedBloodGroups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
    const allowedGenders = ["male", "female", "other"];

    if (!allowedBloodGroups.includes(String(blood_group).trim())) {
      return res.status(400).json({
        success: false,
        message: "Please select a valid blood group.",
      });
    }

    if (!allowedGenders.includes(String(gender).toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: "Please select a valid gender.",
      });
    }

    const allowedPreferredTimes = ["morning", "afternoon", "evening", "night", "anytime"];
    const normalizedPreferredTime = allowedPreferredTimes.includes(preferred_time)
      ? preferred_time
      : "anytime";

    const profilePhotoPath = profile_photo_data_url
      ? saveProfilePhotoFromDataUrl(profile_photo_data_url, userId)
      : null;

    await donorRepository.updateDonorProfile({
      userId,
      full_name: sanitizeText(full_name, 120),
      blood_group: String(blood_group).trim(),
      gender: String(gender).toLowerCase(),
      city: sanitizeText(city, 100),
      profile_photo: profilePhotoPath,
      address: sanitizeText(address, 255),
      whatsapp: sanitizeText(whatsapp, 20),
      emergency_contact: sanitizeText(emergency_contact, 20),
      preferred_area: sanitizeText(preferred_area, 120),
      preferred_time: normalizedPreferredTime,
      can_travel: toBoolean(can_travel),
      bio: sanitizeText(bio, 500),
    });

    await refreshSingleDonorEligibility(userId);

    return res.status(200).json({
      success: true,
      message: "Trust profile updated successfully",
    });
  } catch (error) {
    console.error("Update donor profile error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update profile",
    });
  }
};

const refreshMyEligibility = async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Invalid token. Donor id missing.",
      });
    }

    const eligibility = await refreshSingleDonorEligibility(userId);
    const notificationSummary = await refreshEligibilityAndNotify({ donorId: userId, silent: true });

    return res.status(200).json({
      success: true,
      eligibility,
      notification_summary: notificationSummary,
      message: eligibility?.eligible
        ? "Eligibility refreshed. You can donate again if you are healthy and available."
        : `Eligibility refreshed. ${eligibility?.remaining_days || 0} day(s) remaining.`,
    });
  } catch (error) {
    console.error("Refresh my eligibility error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to refresh eligibility",
    });
  }
};

const toggleAvailability = async (req, res) => {
  try {
    const userId = req.user.id;

    const eligibility = await refreshSingleDonorEligibility(userId);

    const [rows] = await pool.query(
      `SELECT donor_availability, is_eligible_donor
       FROM users
       WHERE id = ? AND role IN ('donor', 'both')`,
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Donor profile not found",
      });
    }

    const currentStatus = rows[0].donor_availability;
    const newStatus = currentStatus === "available" ? "not_available" : "available";

    if (newStatus === "available" && Number(rows[0].is_eligible_donor) !== 1) {
      return res.status(400).json({
        success: false,
        message: `You are not eligible yet. ${eligibility?.remaining_days || 0} day(s) remaining.`,
      });
    }

    await pool.query(
      "UPDATE users SET donor_availability = ? WHERE id = ?",
      [newStatus, userId]
    );

    return res.status(200).json({
      success: true,
      message: "Availability updated",
      availability: newStatus,
    });
  } catch (error) {
    console.error("Toggle availability error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update availability",
    });
  }
};


const toBoolean = (value) => {
  return value === true || value === 1 || value === "1" || value === "true" || value === "yes";
};

const submitHealthCheck = async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const {
      feeling_healthy,
      has_fever,
      taking_antibiotics,
      recent_surgery,
      chronic_disease,
    } = req.body;

    const answers = {
      feeling_healthy: toBoolean(feeling_healthy),
      has_fever: toBoolean(has_fever),
      taking_antibiotics: toBoolean(taking_antibiotics),
      recent_surgery: toBoolean(recent_surgery),
      chronic_disease: toBoolean(chronic_disease),
    };

    const isPassed =
      answers.feeling_healthy &&
      !answers.has_fever &&
      !answers.taking_antibiotics &&
      !answers.recent_surgery &&
      !answers.chronic_disease;

    await pool.query(
      `INSERT INTO donor_health_checks
       (donor_id, feeling_healthy, has_fever, taking_antibiotics, recent_surgery, chronic_disease, is_passed)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        answers.feeling_healthy ? 1 : 0,
        answers.has_fever ? 1 : 0,
        answers.taking_antibiotics ? 1 : 0,
        answers.recent_surgery ? 1 : 0,
        answers.chronic_disease ? 1 : 0,
        isPassed ? 1 : 0,
      ]
    );

    await pool.query(
      `UPDATE users
       SET health_check_completed = ?,
           donor_availability = CASE WHEN ? = 1 THEN donor_availability ELSE 'not_available' END
       WHERE id = ? AND role IN ('donor', 'both')`,
      [isPassed ? 1 : 0, isPassed ? 1 : 0, userId]
    );

    return res.status(200).json({
      success: true,
      passed: isPassed,
      message: isPassed
        ? "Health check passed. Your donor profile reliability has improved."
        : "Health check failed. Your availability has been paused for safety.",
    });
  } catch (error) {
    console.error("Submit health check error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to submit health check",
    });
  }
};

const submitPreHealthCheck = async (req, res) => {
  try {
    const userId = req.user.id;

    const {
      feeling_healthy,
      has_fever,
      taking_antibiotics,
      recent_surgery,
      chronic_disease,
    } = req.body;

    const isPassed =
      feeling_healthy &&
      !has_fever &&
      !taking_antibiotics &&
      !recent_surgery &&
      !chronic_disease;

    await pool.query(
      `INSERT INTO donor_health_checks
       (donor_id, type, feeling_healthy, has_fever, taking_antibiotics, recent_surgery, chronic_disease, is_passed)
       VALUES (?, 'pre', ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        feeling_healthy ? 1 : 0,
        has_fever ? 1 : 0,
        taking_antibiotics ? 1 : 0,
        recent_surgery ? 1 : 0,
        chronic_disease ? 1 : 0,
        isPassed ? 1 : 0,
      ]
    );

    return res.status(200).json({
      success: true,
      passed: isPassed,
      message: isPassed
        ? "You are eligible to proceed with donation."
        : "You are not eligible for donation right now.",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Pre health check failed",
    });
  }
};

const submitPostHealthCheck = async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;

    const {
      feeling_weak,
      dizziness,
      infection
    } = req.body;

    const hasIssue =
      feeling_weak ||
      dizziness ||
      infection;

await pool.query(
  `UPDATE users
   SET post_donation_pending = 0
   WHERE id = ?`,
  [userId]
);

return res.status(200).json({
  success: true,
  pendingCleared: true,
  message: hasIssue
    ? "Recovery issues recorded."
    : "Post donation health check submitted successfully."
});

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Failed to submit post donation check"
    });
  }
};

const clearPostDonationFlag = async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;

    await pool.query(
      `UPDATE users
       SET post_donation_pending = 0
       WHERE id = ?`,
      [userId]
    );

    return res.json({
      success: true,
      message: "Post donation flag cleared"
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to clear flag"
    });
  }
};

const normalizeSearchText = (value) => String(value || "").trim().replace(/\s+/g, " ");

const buildSearchMessage = ({ bloodGroup, city, debug }) => {
  const searchLabel = `${bloodGroup} in ${city}`;

  if (!debug.total_candidates) {
    return `No donor is registered for ${searchLabel} yet. Please try another city or create an emergency request.`;
  }

  if (!debug.available_candidates) {
    return `Matching donor profiles exist for ${searchLabel}, but no donor is available right now.`;
  }

  if (!debug.eligible_candidates) {
    return `Matching donors exist for ${searchLabel}, but they are currently not eligible to donate.`;
  }

  return `No available donor found for ${searchLabel} right now. Please try a nearby city or create an emergency request.`;
};

const searchDonors = async (req, res) => {
  try {
    const bloodGroup = normalizeSearchText(req.query.blood_group).toUpperCase();
    const city = normalizeSearchText(req.query.city);

    if (!bloodGroup || !city) {
      return res.status(400).json({
        success: false,
        message: "Blood group and city are required",
      });
    }

    const allowedBloodGroups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
    if (!allowedBloodGroups.includes(bloodGroup)) {
      return res.status(400).json({
        success: false,
        message: "Please select a valid blood group.",
      });
    }

    await refreshEligibleDonors();

    let userLat = parseCoordinate(req.query.lat);
    let userLng = parseCoordinate(req.query.lng);

    if (userLat === null || userLng === null) {
      const [recipientRows] = await pool.query(
        "SELECT latitude, longitude FROM users WHERE id = ?",
        [req.user.id]
      );

      userLat = parseCoordinate(recipientRows[0]?.latitude);
      userLng = parseCoordinate(recipientRows[0]?.longitude);
    }

    const cityLike = `%${city.toLowerCase()}%`;

    const [candidates] = await pool.query(
      `SELECT
        id,
        full_name,
        phone,
        email,
        blood_group,
        gender,
        TRIM(city) AS city,
        latitude,
        longitude,
        donor_availability,
        is_eligible_donor,
        health_check_completed,
        last_donation_date,
        reliability_score,
        account_status,
        is_verified_donor,
        verification_status,
        profile_photo,
        address,
        whatsapp,
        emergency_contact,
        preferred_area,
        preferred_time,
        can_travel,
        bio
      FROM users
      WHERE role IN ('donor', 'both')
        AND UPPER(TRIM(blood_group)) = ?
        AND (
          LOWER(TRIM(city)) = LOWER(?)
          OR LOWER(TRIM(city)) LIKE ?
          OR LOWER(?) LIKE CONCAT('%', LOWER(TRIM(city)), '%')
        )
        AND id <> ?`,
      [bloodGroup, city, cityLike, city, req.user.id]
    );

    const debug = candidates.reduce(
      (summary, donor) => {
        summary.total_candidates += 1;

        const isActive = donor.account_status === "active";
        const isVerified = Number(donor.is_verified_donor) === 1;
        const isAvailable = donor.donor_availability === "available";
        const isEligible = Number(donor.is_eligible_donor) === 1;
        const hasLocation = donor.latitude !== null && donor.longitude !== null;

        if (isActive) summary.active_candidates += 1;
        if (isVerified) summary.verified_candidates += 1;
        if (isAvailable) summary.available_candidates += 1;
        if (isEligible) summary.eligible_candidates += 1;
        if (hasLocation) summary.with_location += 1;
        if (isActive && isVerified && isAvailable && isEligible) summary.ready_candidates += 1;

        if (!isActive || !isVerified) summary.blockers.inactive_or_unverified += 1;
        if (!isAvailable) summary.blockers.not_available += 1;
        if (!isEligible) summary.blockers.not_eligible += 1;
        if (!hasLocation) summary.blockers.location_missing += 1;

        return summary;
      },
      {
        blood_group: bloodGroup,
        city,
        total_candidates: 0,
        active_candidates: 0,
        available_candidates: 0,
        eligible_candidates: 0,
        verified_candidates: 0,
        ready_candidates: 0,
        with_location: 0,
        blockers: {
          inactive_or_unverified: 0,
          not_available: 0,
          not_eligible: 0,
          location_missing: 0,
        },
      }
    );

    const rankedDonors = candidates

      .filter(donor =>
        donor.account_status === "active" &&
        Number(donor.is_verified_donor) === 1 &&
        Number(donor.is_eligible_donor) === 1 &&
        donor.donor_availability === "available"
      )
      .map((donor) => {
        const distanceKm = calculateDistanceKm(
          userLat,
          userLng,
          parseCoordinate(donor.latitude),
          parseCoordinate(donor.longitude)
        );

        const reliabilityScore = calculateReliabilityScore(donor);
        const distanceScore = getDistanceScore(distanceKm);
        const profileStrength = calculateProfileCompleteness(donor);
        const matchingScore = Math.round(
          reliabilityScore * 0.6 + distanceScore * 0.25 + profileStrength * 0.15
        );

        return {
          ...donor,
          can_travel: Number(donor.can_travel) === 1,
          profile_photo_url: buildPublicFileUrl(req, donor.profile_photo),
          profile_strength: profileStrength,
          distance_km: distanceKm,
          reliability_score: reliabilityScore,
          reliability_badge: getBadge(reliabilityScore),
          matching_score: matchingScore,
        };
      })
      .sort((a, b) => {
        if (b.matching_score !== a.matching_score) return b.matching_score - a.matching_score;
        return (a.distance_km ?? 9999) - (b.distance_km ?? 9999);
      });

    return res.status(200).json({
      success: true,
      count: rankedDonors.length,
      donors: rankedDonors,
      debug_summary: process.env.NODE_ENV === "development" ? debug : undefined,
      message:
        rankedDonors.length > 0
          ? `${rankedDonors.length} available donor(s) found.`
          : buildSearchMessage({ bloodGroup, city, debug }),
    });
  } catch (error) {
    console.error("Search donors error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to search donors",
    });
  }
};

module.exports = {
  getDonorProfile,
  updateProfile,
  toggleAvailability,
  submitHealthCheck,
  submitPreHealthCheck,
  submitPostHealthCheck,
  clearPostDonationFlag,
  refreshMyEligibility,
  searchDonors,
};
