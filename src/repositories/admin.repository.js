const pool = require("../config/db");

const normalizeNumber = (value) => Number(value || 0);

const getDashboardStats = async () => {
  const [summaryRows] = await pool.query(
    `SELECT
       COUNT(*) AS total_users,
       SUM(CASE WHEN role IN ('donor', 'both') THEN 1 ELSE 0 END) AS total_donors,
       SUM(CASE WHEN role IN ('recipient', 'both') THEN 1 ELSE 0 END) AS total_recipients,
       SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) AS total_admins,
       SUM(CASE WHEN account_status = 'active' THEN 1 ELSE 0 END) AS active_users,
       SUM(CASE WHEN account_status = 'pending' THEN 1 ELSE 0 END) AS pending_users,
       SUM(CASE WHEN account_status = 'blocked' THEN 1 ELSE 0 END) AS blocked_users,
       SUM(CASE WHEN role IN ('donor', 'both') AND is_verified_donor = 1 THEN 1 ELSE 0 END) AS verified_donors,
       SUM(CASE WHEN role IN ('donor', 'both') AND COALESCE(is_verified_donor, 0) = 0 THEN 1 ELSE 0 END) AS unverified_donors,
       SUM(CASE WHEN role IN ('donor', 'both') AND donor_availability = 'available' AND is_eligible_donor = 1 AND account_status = 'active' AND is_verified_donor = 1 THEN 1 ELSE 0 END) AS available_donors
     FROM users`
  );

  const [requestRows] = await pool.query(
    `SELECT
       COUNT(*) AS total_requests,
       SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open_requests,
       SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) AS accepted_requests,
       SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_requests,
       SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_requests,
       SUM(CASE WHEN urgency = 'critical' AND status IN ('open', 'accepted') THEN 1 ELSE 0 END) AS critical_active_requests
     FROM blood_requests`
  );

  const [donationRows] = await pool.query(
    `SELECT
       COUNT(*) AS total_donations,
       COALESCE(SUM(units_donated), 0) AS total_units_donated,
       SUM(CASE WHEN approval_status = 'pending' THEN 1 ELSE 0 END) AS pending_donations,
       SUM(CASE WHEN approval_status = 'approved' THEN 1 ELSE 0 END) AS approved_donations,
       SUM(CASE WHEN approval_status = 'rejected' THEN 1 ELSE 0 END) AS rejected_donations
     FROM donations`
  );

  const [bloodGroupRows] = await pool.query(
    `SELECT blood_group, COUNT(*) AS count
     FROM users
     WHERE role IN ('donor', 'both')
       AND account_status = 'active'
       AND is_verified_donor = 1
       AND blood_group IS NOT NULL
     GROUP BY blood_group
     ORDER BY blood_group`
  );

  const [cityRows] = await pool.query(
    `SELECT city, COUNT(*) AS donors
     FROM users
     WHERE role IN ('donor', 'both')
       AND account_status = 'active'
       AND is_verified_donor = 1
       AND city IS NOT NULL
     GROUP BY city
     ORDER BY donors DESC, city ASC
     LIMIT 8`
  );

  const summary = summaryRows[0] || {};
  const requests = requestRows[0] || {};
  const donations = donationRows[0] || {};

  return {
    users: {
      total: normalizeNumber(summary.total_users),
      donors: normalizeNumber(summary.total_donors),
      recipients: normalizeNumber(summary.total_recipients),
      admins: normalizeNumber(summary.total_admins),
      active: normalizeNumber(summary.active_users),
      pending: normalizeNumber(summary.pending_users),
      blocked: normalizeNumber(summary.blocked_users),
      verified_donors: normalizeNumber(summary.verified_donors),
      unverified_donors: normalizeNumber(summary.unverified_donors),
      available_donors: normalizeNumber(summary.available_donors),
    },
    requests: {
      total: normalizeNumber(requests.total_requests),
      open: normalizeNumber(requests.open_requests),
      accepted: normalizeNumber(requests.accepted_requests),
      completed: normalizeNumber(requests.completed_requests),
      cancelled: normalizeNumber(requests.cancelled_requests),
      critical_active: normalizeNumber(requests.critical_active_requests),
    },
    donations: {
      total: normalizeNumber(donations.total_donations),
      units: normalizeNumber(donations.total_units_donated),
      pending: normalizeNumber(donations.pending_donations),
      approved: normalizeNumber(donations.approved_donations),
      rejected: normalizeNumber(donations.rejected_donations),
    },
    blood_groups: bloodGroupRows,
    cities: cityRows,
  };
};

const getUsers = async ({ search = "", role = "all", status = "all", verification = "all" }) => {
  const conditions = [];
  const params = [];

  if (search) {
    conditions.push(`(full_name LIKE ? OR email LIKE ? OR phone LIKE ? OR city LIKE ?)`);
    const term = `%${search}%`;
    params.push(term, term, term, term);
  }

  if (["donor", "recipient", "both", "admin"].includes(role)) {
    conditions.push(`role = ?`);
    params.push(role);
  }

  if (["pending", "active", "blocked"].includes(status)) {
    conditions.push(`account_status = ?`);
    params.push(status);
  }

  if (["verified", "unverified", "rejected"].includes(verification)) {
    conditions.push(`verification_status = ?`);
    params.push(verification);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const [rows] = await pool.query(
    `SELECT id, full_name, email, phone, role, preferred_mode, blood_group, gender, city,
            donor_availability, is_eligible_donor, health_check_completed, last_donation_date,
            is_phone_verified, account_status, is_verified_donor, verification_status,
            verification_notes, verified_at, verified_by, created_at, updated_at
     FROM users
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT 250`,
    params
  );

  return rows;
};

const getRequests = async ({ status = "all" }) => {
  const params = [];
  let whereClause = "";

  if (["open", "accepted", "rejected", "completed", "cancelled"].includes(status)) {
    whereClause = "WHERE br.status = ?";
    params.push(status);
  }

  const [rows] = await pool.query(
    `SELECT
       br.*,
       r.full_name AS recipient_name,
       r.phone AS recipient_phone,
       r.email AS recipient_email,
       d.full_name AS donor_name,
       d.phone AS donor_phone,
       d.email AS donor_email,
       dn.id AS donation_id,
       dn.approval_status AS donation_approval_status
     FROM blood_requests br
     JOIN users r ON br.recipient_id = r.id
     LEFT JOIN users d ON br.donor_id = d.id
     LEFT JOIN donations dn ON dn.request_id = br.id
     ${whereClause}
     ORDER BY br.created_at DESC
     LIMIT 250`,
    params
  );

  return rows;
};

const getDonations = async ({ status = "all" }) => {
  const params = [];
  let whereClause = "";

  if (["pending", "approved", "rejected"].includes(status)) {
    whereClause = "WHERE dn.approval_status = ?";
    params.push(status);
  }

  const [rows] = await pool.query(
    `SELECT
       dn.id,
       dn.request_id,
       dn.donor_id,
       dn.recipient_id,
       dn.donation_date,
       dn.units_donated,
       dn.notes,
       dn.approval_status,
       dn.approval_notes,
       dn.approved_at,
       dn.approved_by,
       dn.created_at,
       donor.full_name AS donor_name,
       donor.phone AS donor_phone,
       donor.email AS donor_email,
       donor.blood_group AS donor_blood_group,
       recipient.full_name AS recipient_name,
       recipient.phone AS recipient_phone,
       recipient.email AS recipient_email,
       br.hospital_name,
       br.patient_name,
       br.city,
       br.urgency,
       approver.full_name AS approved_by_name
     FROM donations dn
     JOIN users donor ON donor.id = dn.donor_id
     JOIN users recipient ON recipient.id = dn.recipient_id
     LEFT JOIN blood_requests br ON br.id = dn.request_id
     LEFT JOIN users approver ON approver.id = dn.approved_by
     ${whereClause}
     ORDER BY
       CASE dn.approval_status WHEN 'pending' THEN 1 WHEN 'approved' THEN 2 ELSE 3 END,
       dn.created_at DESC
     LIMIT 250`,
    params
  );

  return rows;
};

const updateUserStatus = async ({ userId, status }) => {
  const [result] = await pool.query(
    `UPDATE users
     SET account_status = ?
     WHERE id = ?`,
    [status, userId]
  );

  return result.affectedRows;
};

const updateDonorVerification = async ({ userId, verified, adminId, notes = null }) => {
  const status = verified ? "verified" : "unverified";
  const [result] = await pool.query(
    `UPDATE users
     SET is_verified_donor = ?,
         verification_status = ?,
         verification_notes = ?,
         verified_at = CASE WHEN ? = 1 THEN NOW() ELSE NULL END,
         verified_by = CASE WHEN ? = 1 THEN ? ELSE NULL END
     WHERE id = ?
       AND role IN ('donor', 'both')`,
    [verified ? 1 : 0, status, notes || null, verified ? 1 : 0, verified ? 1 : 0, adminId || null, userId]
  );

  return result.affectedRows;
};

const rejectDonorVerification = async ({ userId, adminId, notes = null }) => {
  const [result] = await pool.query(
    `UPDATE users
     SET is_verified_donor = 0,
         verification_status = 'rejected',
         verification_notes = ?,
         verified_at = NULL,
         verified_by = ?
     WHERE id = ?
       AND role IN ('donor', 'both')`,
    [notes || "Verification rejected by admin.", adminId || null, userId]
  );

  return result.affectedRows;
};

const updateRequestStatus = async ({ requestId, status }) => {
  const [result] = await pool.query(
    `UPDATE blood_requests
     SET status = ?,
         completed_at = CASE WHEN ? = 'completed' THEN COALESCE(completed_at, NOW()) ELSE completed_at END
     WHERE id = ?`,
    [status, status, requestId]
  );

  return result.affectedRows;
};

const updateDonationApproval = async ({ donationId, approvalStatus, adminId, notes = null }) => {
  const [result] = await pool.query(
    `UPDATE donations
     SET approval_status = ?,
         approval_notes = ?,
         approved_at = CASE WHEN ? IN ('approved', 'rejected') THEN NOW() ELSE NULL END,
         approved_by = CASE WHEN ? IN ('approved', 'rejected') THEN ? ELSE NULL END
     WHERE id = ?`,
    [approvalStatus, notes || null, approvalStatus, approvalStatus, adminId || null, donationId]
  );

  return result.affectedRows;
};

const getUserById = async (userId) => {
  const [rows] = await pool.query(
    `SELECT id, full_name, email, role, preferred_mode, is_verified_donor, verification_status
     FROM users
     WHERE id = ?`,
    [userId]
  );
  return rows[0] || null;
};

const getDonationById = async (donationId) => {
  const [rows] = await pool.query(
    `SELECT
       dn.*,
       donor.full_name AS donor_name,
       donor.email AS donor_email,
       recipient.full_name AS recipient_name,
       recipient.email AS recipient_email
     FROM donations dn
     JOIN users donor ON donor.id = dn.donor_id
     JOIN users recipient ON recipient.id = dn.recipient_id
     WHERE dn.id = ?`,
    [donationId]
  );
  return rows[0] || null;
};

module.exports = {
  getDashboardStats,
  getUsers,
  getRequests,
  getDonations,
  updateUserStatus,
  updateDonorVerification,
  rejectDonorVerification,
  updateRequestStatus,
  updateDonationApproval,
  getUserById,
  getDonationById,
};
