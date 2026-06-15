const normalize = (value = "") => String(value).trim();

const isValidGmail = (email = "") => {
  const normalizedEmail = normalize(email).toLowerCase();
  return /^[a-zA-Z0-9._%+-]+@gmail\.com$/.test(normalizedEmail);
};

const isValidPakistaniPhone = (phone = "") => /^03\d{9}$/.test(normalize(phone));

const validatePassword = (password = "", userContext = {}) => {
  const value = String(password);
  const fullName = normalize(userContext.full_name).toLowerCase();
  const emailPrefix = normalize(userContext.email).toLowerCase().split("@")[0];
  const phone = normalize(userContext.phone);

  const checks = [
    {
      key: "length",
      label: "At least 8 characters",
      valid: value.length >= 8,
    },
    {
      key: "uppercase",
      label: "One uppercase letter",
      valid: /[A-Z]/.test(value),
    },
    {
      key: "lowercase",
      label: "One lowercase letter",
      valid: /[a-z]/.test(value),
    },
    {
      key: "number",
      label: "One number",
      valid: /\d/.test(value),
    },
    {
      key: "special",
      label: "One special character",
      valid: /[^A-Za-z0-9]/.test(value),
    },
    {
      key: "no_spaces",
      label: "No spaces",
      valid: !/\s/.test(value),
    },
  ];

  if (fullName && fullName.length >= 3) {
    const nameParts = fullName.split(/\s+/).filter((part) => part.length >= 3);
    const containsName = nameParts.some((part) => value.toLowerCase().includes(part));
    checks.push({
      key: "not_name",
      label: "Does not include your name",
      valid: !containsName,
    });
  }

  if (emailPrefix && emailPrefix.length >= 3) {
    checks.push({
      key: "not_email",
      label: "Does not include your email name",
      valid: !value.toLowerCase().includes(emailPrefix),
    });
  }

  if (phone && phone.length >= 6) {
    checks.push({
      key: "not_phone",
      label: "Does not include your phone number",
      valid: !value.includes(phone),
    });
  }

  const failedCheck = checks.find((check) => !check.valid);

  return {
    isValid: !failedCheck,
    message: failedCheck
      ? `Password is weak. Requirement missing: ${failedCheck.label}.`
      : "Password is strong.",
    checks,
  };
};

const validateSignupPayload = (payload = {}) => {
  const full_name = normalize(payload.full_name);
  const email = normalize(payload.email).toLowerCase();
  const phone = normalize(payload.phone);
  const role = normalize(payload.role);
  const blood_group = normalize(payload.blood_group);
  const gender = normalize(payload.gender);
  const city = normalize(payload.city);
  const latitude = payload.latitude;
  const longitude = payload.longitude;

  if (
    !full_name ||
    !email ||
    !phone ||
    !payload.password ||
    !role ||
    !blood_group ||
    !gender ||
    !city ||
    latitude === undefined ||
    longitude === undefined
  ) {
    return { isValid: false, message: "All fields are required" };
  }

  if (full_name.length < 3 || !/^[a-zA-Z\s.'-]+$/.test(full_name)) {
    return {
      isValid: false,
      message: "Full name must be at least 3 letters and contain only alphabets.",
    };
  }

  if (!isValidGmail(email)) {
    return { isValid: false, message: "Only valid Gmail addresses are allowed." };
  }

  if (!isValidPakistaniPhone(phone)) {
    return {
      isValid: false,
      message: "Enter a valid Pakistani phone number: 03XXXXXXXXX.",
    };
  }

  const allowedModes = ["donor", "recipient"];
  if (!allowedModes.includes(role)) {
    return { isValid: false, message: "Invalid role. Choose donor or recipient." };
  }

  const allowedBloodGroups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
  if (!allowedBloodGroups.includes(blood_group)) {
    return { isValid: false, message: "Invalid blood group selected." };
  }

  const allowedGenders = ["male", "female", "other"];
  if (!allowedGenders.includes(gender)) {
    return { isValid: false, message: "Invalid gender selected." };
  }

  const lat = Number(latitude);
  const lng = Number(longitude);

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return { isValid: false, message: "Valid latitude and longitude are required." };
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { isValid: false, message: "Location coordinates are out of range." };
  }

  const passwordValidation = validatePassword(payload.password, {
    full_name,
    email,
    phone,
  });

  if (!passwordValidation.isValid) {
    return passwordValidation;
  }

  return {
    isValid: true,
    sanitized: {
      full_name,
      email,
      phone,
      password: String(payload.password),
      role,
      blood_group,
      gender,
      city,
      latitude: lat,
      longitude: lng,
    },
  };
};

module.exports = {
  isValidGmail,
  isValidPakistaniPhone,
  validatePassword,
  validateSignupPayload,
};
