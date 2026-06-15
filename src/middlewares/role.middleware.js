const allowRoles = (...allowedRoles) => {
  return (req, res, next) => {
    const userRole = req.user.role;

    if (userRole === "both") {
      const canAccess =
        allowedRoles.includes("donor") || allowedRoles.includes("recipient");

      if (canAccess) {
        return next();
      }
    }

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You are not allowed to access this route.",
      });
    }

    next();
  };
};

module.exports = { allowRoles };