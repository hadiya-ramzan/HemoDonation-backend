let nodemailer = null;
try {
  nodemailer = require("nodemailer");
} catch (error) {
  nodemailer = null;
}

const isTruthy = (value) => ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());

const isEmailEnabled = () => isTruthy(process.env.EMAIL_ENABLED);

const getSenderEmail = () => String(process.env.SMTP_USER || "").trim();

const getFromAddress = () => {
  const explicitFrom = String(process.env.EMAIL_FROM || "").trim();
  if (explicitFrom) return explicitFrom;

  const sender = getSenderEmail();
  return sender ? `HemoDonation <${sender}>` : "HemoDonation";
};

const getReplyToAddress = () => String(process.env.REPLY_TO_EMAIL || process.env.SMTP_USER || "").trim();

const getFrontendUrl = () => String(process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");

const isLocalUrl = (url = "") => /localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\./i.test(String(url));

const shouldIncludeActionLinks = () => {
  const frontEndUrl = getFrontendUrl();
  if (isTruthy(process.env.EMAIL_INCLUDE_LOCAL_LINKS)) return true;
  return !isLocalUrl(frontEndUrl);
};

const escapeHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const stripHtml = (html = "") =>
  String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const compactSubject = (subject = "") =>
  String(subject)
    .replace(/\bURGENT\b/gi, "Important")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

let transporter = null;

const getTransporter = () => {
  if (!isEmailEnabled()) return null;

  if (!nodemailer) {
    console.warn("Email notifications are enabled, but nodemailer is not installed. Run npm install in backend.");
    return null;
  }

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.warn("Email notifications are enabled, but SMTP_HOST, SMTP_USER or SMTP_PASS is missing.");
    return null;
  }

  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host,
    port: Number.isFinite(port) ? port : 587,
    secure: isTruthy(process.env.SMTP_SECURE) || port === 465,
    auth: { user, pass },
  });

  return transporter;
};

const buildTextEmail = ({ title, intro, lines = [], actionUrl }) => {
  const parts = ["HemoDonation", "", title, "", intro];
  const cleanLines = lines.filter(Boolean).map((line) => `- ${String(line).replace(/\s+/g, " ").trim()}`);
  if (cleanLines.length) parts.push("", ...cleanLines);
  if (actionUrl && shouldIncludeActionLinks()) parts.push("", `Open HemoDonation: ${actionUrl}`);
  parts.push("", "This is an automated notification from HemoDonation.");
  return parts.join("\n").trim();
};

const wrapEmail = ({ title, intro, lines = [], actionUrl, actionText = "Open HemoDonation" }) => {
  const safeTitle = escapeHtml(title);
  const safeIntro = escapeHtml(intro);
  const includeAction = actionUrl && shouldIncludeActionLinks();
  const listItems = lines
    .filter(Boolean)
    .map((line) => `<li style="margin:0 0 8px;">${escapeHtml(line)}</li>`)
    .join("");

  return `
    <div style="margin:0;padding:0;background:#f6f7fb;font-family:Arial,Helvetica,sans-serif;color:#111827;">
      <div style="max-width:620px;margin:0 auto;padding:24px 14px;">
        <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:24px;">
          <div style="font-size:14px;color:#b91c1c;font-weight:700;margin-bottom:12px;">HemoDonation</div>
          <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#111827;">${safeTitle}</h1>
          <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">${safeIntro}</p>
          ${listItems ? `<ul style="padding-left:20px;margin:0 0 18px;color:#374151;font-size:14px;line-height:1.6;">${listItems}</ul>` : ""}
          ${includeAction ? `<p style="margin:18px 0;"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#dc2626;color:#ffffff;text-decoration:none;padding:11px 16px;border-radius:8px;font-weight:700;">${escapeHtml(actionText)}</a></p>` : ""}
          <p style="margin:20px 0 0;color:#6b7280;font-size:12px;line-height:1.5;">This is an automated notification from HemoDonation. You received it because your profile or request matched an activity inside the app.</p>
        </div>
      </div>
    </div>`;
};

const sendEmail = async ({ to, subject, html, text }) => {
  const recipient = String(to || "").trim();

  if (!recipient || !recipient.includes("@")) {
    return { sent: false, skipped: true, reason: "missing-recipient" };
  }

  if (!isEmailEnabled()) {
    return { sent: false, skipped: true, reason: "email-disabled" };
  }

  const mailer = getTransporter();
  if (!mailer) {
    return { sent: false, skipped: true, reason: "smtp-not-configured" };
  }

  try {
    const info = await mailer.sendMail({
      from: getFromAddress(),
      to: recipient,
      replyTo: getReplyToAddress() || undefined,
      subject: compactSubject(subject),
      html,
      text: text || stripHtml(html),
      headers: {
        "X-Application": "HemoDonation",
        "X-Auto-Response-Suppress": "All",
      },
    });

    return { sent: true, messageId: info.messageId };
  } catch (error) {
    console.error("Email send failed:", error.message);
    return { sent: false, skipped: false, reason: error.message };
  }
};

const sendEmergencyRequestEmailToDonor = async ({ donor, request, recipient, rank }) => {
  const urgencyRaw = String(request?.urgency || "urgent").toLowerCase();
  const urgency = urgencyRaw === "critical" ? "Critical" : urgencyRaw === "urgent" ? "Important" : "Normal";
  const actionUrl = `${getFrontendUrl()}/donor`;
  const lines = [
    `Blood group: ${request?.blood_group || "Not specified"}`,
    `Hospital: ${request?.hospital_name || "Not specified"}`,
    `Patient: ${request?.patient_name || "Not specified"}`,
    `Units needed: ${request?.units_needed || "Not specified"}`,
    `City: ${request?.city || "Not specified"}`,
    `Match priority: ${rank || 1}`,
    donor?.distance_km !== null && donor?.distance_km !== undefined ? `Approx distance: ${donor.distance_km} km` : "",
  ];

  const title = `${urgency} blood request near ${request?.city || "your area"}`;
  const intro = `A ${request?.blood_group || "matching"} blood request is available near your registered area.`;
  const html = wrapEmail({ title, intro, lines, actionUrl, actionText: "View request" });
  const text = buildTextEmail({ title, intro, lines, actionUrl });

  return sendEmail({
    to: donor?.email,
    subject: `Blood request: ${request?.blood_group || "matching group"} in ${request?.city || "your area"}`,
    html,
    text,
  });
};

const sendEmergencyRequestEmails = async ({ donors = [], request, recipient }) => {
  let sent = 0;
  let skipped = 0;

  for (let index = 0; index < donors.length; index += 1) {
    const result = await sendEmergencyRequestEmailToDonor({
      donor: donors[index],
      request,
      recipient,
      rank: index + 1,
    });

    if (result.sent) sent += 1;
    else skipped += 1;
  }

  return { sent, skipped };
};

const sendEligibilityEmail = async (donor) => {
  const title = "You can donate again";
  const intro = "Your recovery cooldown period has completed.";
  const lines = [
    `Dear ${donor?.full_name || "donor"}, you can now donate blood again according to your cooldown record.`,
    "Turn your availability ON when you are ready to appear in recipient searches.",
  ];
  const actionUrl = `${getFrontendUrl()}/donor`;
  const html = wrapEmail({ title, intro, lines, actionUrl, actionText: "Open donor dashboard" });
  const text = buildTextEmail({ title, intro, lines, actionUrl });

  return sendEmail({
    to: donor?.email,
    subject: "HemoDonation: donation eligibility updated",
    html,
    text,
  });
};

const sendVerificationStatusEmail = async ({ donor, status, notes }) => {
  const normalized = String(status || "").toLowerCase();
  const title = normalized === "verified"
    ? "Donor profile verified"
    : normalized === "rejected"
      ? "Donor verification update"
      : "Donor verification status updated";

  const intro = normalized === "verified"
    ? "Your donor profile has been verified by admin."
    : normalized === "rejected"
      ? "Admin reviewed your profile and could not verify it yet."
      : "Your verification status has been updated by admin.";

  const lines = [
    `Dear ${donor?.full_name || "donor"}`,
    `Status: ${normalized || "updated"}`,
    notes ? `Admin note: ${notes}` : "",
  ];
  const actionUrl = `${getFrontendUrl()}/donor`;
  const html = wrapEmail({ title, intro, lines, actionUrl, actionText: "Open profile" });
  const text = buildTextEmail({ title, intro, lines, actionUrl });

  return sendEmail({
    to: donor?.email,
    subject: `HemoDonation: ${title}`,
    html,
    text,
  });
};

const sendDonationApprovalEmail = async ({ donation, approvalStatus, notes }) => {
  const status = String(approvalStatus || "pending").toLowerCase();
  const title = status === "approved"
    ? "Donation entry approved"
    : status === "rejected"
      ? "Donation entry reviewed"
      : "Donation entry status updated";

  const intro = "An admin has updated a donation entry linked to your donor profile.";
  const lines = [
    `Dear ${donation?.donor_name || "donor"}`,
    `Donation status: ${status}`,
    notes ? `Admin note: ${notes}` : "",
  ];
  const actionUrl = `${getFrontendUrl()}/donor`;
  const html = wrapEmail({ title, intro, lines, actionUrl, actionText: "Open donor dashboard" });
  const text = buildTextEmail({ title, intro, lines, actionUrl });

  return sendEmail({
    to: donation?.donor_email,
    subject: `HemoDonation: ${title}`,
    html,
    text,
  });
};

module.exports = {
  isEmailEnabled,
  sendEmail,
  sendEmergencyRequestEmails,
  sendEmergencyRequestEmailToDonor,
  sendEligibilityEmail,
  sendVerificationStatusEmail,
  sendDonationApprovalEmail,
};
