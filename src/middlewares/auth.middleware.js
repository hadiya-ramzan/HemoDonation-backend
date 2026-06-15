const jwt = require("jsonwebtoken");

const verifyToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: "No token provided",
      });
    }

    const [scheme, token] = String(authHeader).split(" ");

    if (scheme !== "Bearer" || !token) {
      return res.status(401).json({
        success: false,
        message: "Invalid token format. Use: Bearer <token>",
      });
    }

    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
      return res.status(500).json({
        success: false,
        message: "Server authentication secret is not configured properly",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = {
      id: decoded.id || decoded.userId || decoded.user_id,
      role: decoded.role,
      preferred_mode: decoded.preferred_mode,
      email: decoded.email,
    };

    if (!req.user.id || !req.user.role) {
      return res.status(401).json({
        success: false,
        message: "Invalid token payload.",
      });
    }

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

module.exports = {
  verifyToken,
};
