const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const getOTPExpiry = () => {
  const expiryTime = new Date();
  expiryTime.setMinutes(expiryTime.getMinutes() + 1);
  return expiryTime;
};

module.exports = {
  generateOTP,
  getOTPExpiry,
};