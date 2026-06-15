const pool = require("../config/db");
const notificationRepository = require("./notification.repository");
const emailService = require("../services/email.service");

const parseCoordinate = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const calculateDistanceKm = (lat1, lon1, lat2, lon2) => {
  const aLat = parseCoordinate(lat1);
  const aLon = parseCoordinate(lon1);
  const bLat = parseCoordinate(lat2);
  const bLon = parseCoordinate(lon2);

  if (aLat === null || aLon === null || bLat === null || bLon === null) return null;

  const earthRadiusKm = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) *
    Math.cos((bLat * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((earthRadiusKm * c).toFixed(2));
};

const getDistanceScore = (km) => {
  if (km === null || km === undefined) return 0;
  if (km <= 5) return 100;
  if (km <= 10) return 90;
  if (km <= 20) return 75;
  if (km <= 35) return 55;
  if (km <= 50) return 35;
  return 10;
};

const getUrgencyRadiusKm = (urgency) => {
  const normalized = String(urgency || "urgent").toLowerCase();
  if (normalized === "critical") return 50;
  if (normalized === "urgent") return 35;
  return 25;
};

const getUrgencyBoost = (urgency) => {
  const normalized = String(urgency || "urgent").toLowerCase();
  if (normalized === "critical") return 25;
  if (normalized === "urgent") return 15;
  return 5;
};

const calculateDonorReliability = (donor) => {
  let score = 0;

  if (donor.donor_availability === "available") score += 30;
  if (Number(donor.is_eligible_donor) === 1) score += 25;
  if (Number(donor.health_check_completed) === 1) score += 15;
  if (donor.account_status === "active") score += 10;
  if (Number(donor.is_verified_donor) === 1) score += 10;

  score += Math.min(Number(donor.reliability_score || 0), 20);
  return Math.min(score, 100);
};

const calculateProfileStrengthLite = (donor) => {
  const checks = [
    donor.profile_photo,
    donor.whatsapp,
    donor.emergency_contact,
    donor.address,
    donor.preferred_area,
    donor.preferred_time && donor.preferred_time !== "anytime",
    Number(donor.can_travel) === 1,
    donor.bio,
  ];

  const completed = checks.filter(Boolean).length;
  return Math.round((completed / checks.length) * 100);
};

const buildDonorNotificationCandidates = ({ donors, request, recipient }) => {
  const recipientLat = parseCoordinate(recipient?.latitude);
  const recipientLng = parseCoordinate(recipient?.longitude);
  const hasRecipientCoords = recipientLat !== null && recipientLng !== null;
  const requestCity = String(request.city || "").trim().toLowerCase();
  const radiusKm = getUrgencyRadiusKm(request.urgency);

  return donors
    .map((donor) => {
      const donorCity = String(donor.city || "").trim().toLowerCase();
      const sameCity = donorCity === requestCity;
      const distanceKm = calculateDistanceKm(recipientLat, recipientLng, donor.latitude, donor.longitude);
      const isNearby = distanceKm !== null && distanceKm <= radiusKm;

      const shouldNotify = hasRecipientCoords ? sameCity || isNearby : sameCity;
      const reliabilityScore = calculateDonorReliability(donor);
      const distanceScore = getDistanceScore(distanceKm);
      const profileStrength = calculateProfileStrengthLite(donor);

      const priorityScore = Math.min(
        100,
        Math.round(
          reliabilityScore * 0.55 +
          distanceScore * 0.25 +
          profileStrength * 0.1 +
          getUrgencyBoost(request.urgency) +
          (sameCity ? 5 : 0)
        )
      );

      return {
        ...donor,
        same_city: sameCity,
        distance_km: distanceKm,
        is_nearby: isNearby,
        should_notify: shouldNotify,
        reliability_score_calculated: reliabilityScore,
        priority_score: priorityScore,
      };
    })
    .filter((donor) => donor.should_notify)
    .sort((a, b) => {
      if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score;
      return (a.distance_km ?? 9999) - (b.distance_km ?? 9999);
    })
    .slice(0, 25);
};

/* ================= CREATE BLOOD REQUEST ================= */
const createBloodRequest = async ({
  recipient_id,
  blood_group,
  city,
  hospital_name,
  patient_name,
  units_needed,
  urgency,
  notes,
}) => {
  const [result] = await pool.query(
    `INSERT INTO blood_requests 
     (recipient_id, blood_group, city, hospital_name, patient_name, units_needed, urgency, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      recipient_id,
      blood_group,
      city,
      hospital_name,
      patient_name,
      units_needed,
      urgency,
      notes || null,
    ]
  );

  const requestId = result.insertId;

  const [recipientRows] = await pool.query(
    `SELECT id, full_name, city, latitude, longitude
     FROM users
     WHERE id = ?`,
    [recipient_id]
  );

  const recipient = recipientRows[0] || {};

  const [donors] = await pool.query(
    `SELECT *
     FROM users
     WHERE role IN ('donor', 'both')
       AND account_status = 'active'
       AND is_verified_donor = 1
       AND donor_availability = 'available'
       AND is_eligible_donor = 1
       AND blood_group = ?
       AND id <> ?`,
    [blood_group, recipient_id]
  );

  const request = {
    id: requestId,
    blood_group,
    city,
    hospital_name,
    patient_name,
    units_needed,
    urgency,
  };

  const candidates = buildDonorNotificationCandidates({ donors, request, recipient });

  let notifiedDonors = 0;
  let emailNotificationsSent = 0;

  if (candidates.length > 0) {
    try {
      notifiedDonors = await notificationRepository.createBulkNotifications(
        candidates.map((donor, index) => ({
          userId: donor.id,
          title: `${String(urgency || "urgent").toUpperCase()} ${blood_group} blood request`,
          message: `${units_needed} unit(s) needed at ${hospital_name} in ${city}. ${donor.distance_km !== null ? `Approx. ${donor.distance_km} km away. ` : ""
            }Priority match #${index + 1} based on availability, reliability and location.`,
          type: "request",
          link: "/donor",
          priorityScore: donor.priority_score,
        }))
      );
    } catch (notificationError) {
      console.error("Request created, but donor notifications failed:", notificationError.message);
      notifiedDonors = 0;
    }

    try {
      const emailResult = await emailService.sendEmergencyRequestEmails({
        donors: candidates,
        request,
        recipient,
      });
      emailNotificationsSent = emailResult.sent || 0;
    } catch (emailError) {
      console.error("Request created, but donor email notifications failed:", emailError.message);
      emailNotificationsSent = 0;
    }
  }

  return {
    requestId,
    notifiedDonors,
    emailNotificationsSent,
  };
};

/* ================= GET REQUESTS BY RECIPIENT ================= */
const getRequestsByRecipient = async (recipient_id) => {
  const [rows] = await pool.query(
    `SELECT 
       br.*,
       CASE
         WHEN br.status = 'open' THEN 'pending'
         WHEN br.status IN ('completed', 'cancelled', 'rejected') THEN 'closed'
         ELSE br.status
       END AS display_status,
       d.full_name AS donor_name,
       d.phone AS donor_phone,
       d.email AS donor_email,
       d.blood_group AS donor_blood_group,
       d.city AS donor_city,
       dn.units_donated,
       dn.donation_date
     FROM blood_requests br
     LEFT JOIN users d ON br.donor_id = d.id
     LEFT JOIN donations dn ON dn.request_id = br.id
     WHERE br.recipient_id = ?
     ORDER BY br.created_at DESC`,
    [recipient_id]
  );

  return rows;
};

/* ================= MATCHING REQUESTS FOR DONOR ================= */
const getMatchingRequests = async (blood_group, city, donorId) => {
  const [rows] = await pool.query(
    `SELECT 
       br.*,
       CASE
         WHEN br.status = 'open' THEN 'pending'
         WHEN br.status IN ('completed', 'cancelled', 'rejected') THEN 'closed'
         ELSE br.status
       END AS display_status,
       r.full_name AS recipient_name,
       r.phone AS recipient_phone
     FROM blood_requests br
     JOIN users r ON br.recipient_id = r.id
     LEFT JOIN request_responses rr
       ON rr.request_id = br.id
      AND rr.donor_id = ?
     WHERE br.blood_group = ?
       AND LOWER(br.city) = LOWER(?)
       AND br.status = 'open'
       AND br.recipient_id <> ?
       AND rr.id IS NULL
     ORDER BY 
       CASE br.urgency
         WHEN 'critical' THEN 1
         WHEN 'urgent' THEN 2
         ELSE 3
       END,
       br.created_at DESC`,
    [donorId, blood_group, city, donorId]
  );

  return rows;
};

/* ================= RESPOND (ACCEPT / REJECT) ================= */
const respondToRequest = async ({ requestId, donorId, status }) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [donorRows] = await connection.query(
      `SELECT id, role, account_status, is_verified_donor, donor_availability, is_eligible_donor, blood_group, city
       FROM users
       WHERE id = ?
         AND role IN ('donor', 'both')
       FOR UPDATE`,
      [donorId]
    );

    if (!donorRows.length) {
      await connection.rollback();
      return { affectedRows: 0, reason: "Donor profile not found" };
    }

    const donor = donorRows[0];

    if (donor.account_status !== "active") {
      await connection.rollback();
      return { affectedRows: 0, reason: "Your account is not active" };
    }

    if (Number(donor.is_verified_donor) !== 1) {
      await connection.rollback();
      return { affectedRows: 0, reason: "Your donor profile is not verified by admin yet" };
    }

    if (Number(donor.is_eligible_donor) !== 1 || donor.donor_availability !== "available") {
      await connection.rollback();
      return { affectedRows: 0, reason: "You are currently not available or not eligible to donate" };
    }

    const [requestRows] = await connection.query(
      `SELECT id, blood_group, city, status, recipient_id, hospital_name, patient_name, units_needed, urgency
       FROM blood_requests
       WHERE id = ?
       FOR UPDATE`,
      [requestId]
    );

    if (!requestRows.length || requestRows[0].status !== "open") {
      await connection.rollback();
      return { affectedRows: 0, reason: "Request already processed or not found" };
    }

    const request = requestRows[0];

    if (request.recipient_id === donorId) {
      await connection.rollback();
      return { affectedRows: 0, reason: "You cannot respond to your own request" };
    }

    if (request.blood_group !== donor.blood_group || String(request.city).toLowerCase() !== String(donor.city).toLowerCase()) {
      await connection.rollback();
      return { affectedRows: 0, reason: "This request does not match your blood group or city" };
    }

    await connection.query(
      `INSERT INTO request_responses (request_id, donor_id, response_status)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE response_status = VALUES(response_status), responded_at = CURRENT_TIMESTAMP`,
      [requestId, donorId, status]
    );

    if (status === "rejected") {
      await connection.commit();
      return { affectedRows: 1 };
    }

    const [result] = await connection.query(
      `UPDATE blood_requests
       SET status = 'accepted', donor_id = ?
       WHERE id = ? AND status = 'open'`,
      [donorId, requestId]
    );

    if (!result.affectedRows) {
      await connection.rollback();
      return { affectedRows: 0, reason: "Request already accepted by another donor" };
    }

    await notificationRepository.createNotification(
      {
        userId: request.recipient_id,
        title: "Donor accepted your request",
        message: `A donor accepted your ${request.blood_group} request for ${request.patient_name} at ${request.hospital_name}.`,
        type: "request",
        link: "/recipient",
        priorityScore: request.urgency === "critical" ? 95 : 70,
      },
      connection
    );

    await connection.commit();
    return { affectedRows: result.affectedRows };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

/* ================= DONOR HISTORY ================= */
const getDonorHistory = async (donorId) => {
  const [rows] = await pool.query(
    `SELECT 
       br.*,
       r.full_name AS recipient_name,
       r.phone AS recipient_phone,
       dn.units_donated,
       dn.donation_date
     FROM blood_requests br
     JOIN users r ON br.recipient_id = r.id
     LEFT JOIN donations dn ON dn.request_id = br.id
     WHERE br.donor_id = ?
       AND br.status = 'completed'
     ORDER BY COALESCE(br.completed_at, br.created_at) DESC`,
    [donorId]
  );

  return rows;
};

/* ================= RECIPIENT HISTORY ================= */
const getRecipientHistory = async (recipientId) => {
  const [rows] = await pool.query(
    `SELECT 
       br.*,
       d.full_name AS donor_name,
       d.phone AS donor_phone,
       dn.units_donated,
       dn.donation_date
     FROM blood_requests br
     LEFT JOIN users d ON br.donor_id = d.id
     LEFT JOIN donations dn ON dn.request_id = br.id
     WHERE br.recipient_id = ?
       AND br.status = 'completed'
     ORDER BY COALESCE(br.completed_at, br.created_at) DESC`,
    [recipientId]
  );

  return rows;
};

/* ================= COMPLETE BLOOD REQUEST ================= */
const completeBloodRequest = async ({ requestId, recipientId }) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [requestRows] = await connection.query(
      `SELECT id, donor_id, recipient_id, units_needed, status
       FROM blood_requests
       WHERE id = ?
         AND recipient_id = ?
       FOR UPDATE`,
      [requestId, recipientId]
    );

    if (!requestRows.length || requestRows[0].status !== "accepted" || !requestRows[0].donor_id) {
      await connection.rollback();
      return 0;
    }

    const request = requestRows[0];

    const [result] = await connection.query(
      `UPDATE blood_requests
       SET status = 'completed',
           completed_at = NOW()
       WHERE id = ?
         AND recipient_id = ?
         AND status = 'accepted'`,
      [requestId, recipientId]
    );

    if (!result.affectedRows) {
      await connection.rollback();
      return 0;
    }

    await connection.query(
      `INSERT INTO donations
       (request_id, donor_id, recipient_id, donation_date, units_donated, notes)
       VALUES (?, ?, ?, CURDATE(), ?, 'Completed through HemoDonation request flow')`,
      [request.id, request.donor_id, request.recipient_id, request.units_needed || 1]
    );

    await connection.query(
      `UPDATE users
   SET last_donation_date = CURDATE(),
       donor_availability = 'not_available',
       is_eligible_donor = 0,
       reliability_score = LEAST(COALESCE(reliability_score, 0) + 15, 100),
       post_donation_pending = 1
   WHERE id = ?
     AND role IN ('donor', 'both')`,
      [request.donor_id]
    );

    await notificationRepository.createNotification(
      {
        userId: request.donor_id,
        title: "Donation completed",
        message: "Your donation has been confirmed. Your next eligibility date is calculated automatically.",
        type: "donation",
        link: "/donor",
        priorityScore: 80,
      },
      connection
    );

    await notificationRepository.createNotification(
      {
        userId: request.recipient_id,
        title: "Request completed",
        message: "Your blood request has been marked as completed successfully.",
        type: "donation",
        link: "/recipient",
        priorityScore: 70,
      },
      connection
    );

    await connection.query(
      `UPDATE users
   SET post_donation_pending = 1
   WHERE id = ?`,
      [request.donor_id]
    );

    await connection.commit();
    return result.affectedRows;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

module.exports = {
  createBloodRequest,
  getRequestsByRecipient,
  getMatchingRequests,
  respondToRequest,
  getDonorHistory,
  getRecipientHistory,
  completeBloodRequest,
};
