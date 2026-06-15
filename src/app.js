const express = require("express");
const cors = require("cors");
const path = require("path");
const pool = require("./config/db");



const authRoutes = require("./routes/auth.routes");
const donorRoutes = require("./routes/donor.routes");
const { verifyToken } = require("./middlewares/auth.middleware");
const { allowRoles } = require("./middlewares/role.middleware");
const requestRoutes = require("./routes/request.routes");
const recipientRoutes = require("./routes/recipient.routes");
const adminRoutes = require("./routes/admin.routes");
const notificationRoutes = require("./routes/notification.routes");
const app = express();

app.use(
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Public static files for profile photos.
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

// Main routes
app.use("/api/auth", authRoutes);
app.use("/api/donor", donorRoutes);
app.use("/api/requests", requestRoutes);
app.use("/api/recipient", recipientRoutes);
app.use("/api/user", require("./routes/user.routes"));
app.use("/api/admin", adminRoutes);
app.use("/api/notifications", notificationRoutes);

// Test route
app.get("/api/test", (req, res) => {
  res.json({
    success: true,
    message: "Frontend connected successfully",
  });
});

// DB test route
app.get("/api/db-test", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT 1 + 1 AS result");

    res.json({
      success: true,
      message: "Database connected successfully!",
      result: rows[0].result,
    });
  } catch (error) {
    console.error("Database connection error:", error.message);

    res.status(500).json({
      success: false,
      message: "Database connection failed",
      error: error.message,
    });
  }
});

// Protected test route
app.get("/api/protected", verifyToken, (req, res) => {
  res.json({
    success: true,
    message: "You have accessed a protected route",
    user: req.user,
  });
});

// Role test routes
app.get("/api/donor-only", verifyToken, allowRoles("donor"), (req, res) => {
  res.json({
    success: true,
    message: "Welcome donor. You can access donor-only route.",
    user: req.user,
  });
});

app.get(
  "/api/recipient-only",
  verifyToken,
  allowRoles("recipient"),
  (req, res) => {
    res.json({
      success: true,
      message: "Welcome recipient. You can access recipient-only route.",
      user: req.user,
    });
  }
);

app.get("/api/admin-only", verifyToken, allowRoles("admin"), (req, res) => {
  res.json({
    success: true,
    message: "Welcome admin. You can access admin-only route.",
    user: req.user,
  });
});

// JSON/body parser error handler
app.use((err, req, res, next) => {
  if (err?.type === "entity.too.large") {
    return res.status(413).json({
      success: false,
      message: "Request payload is too large. Please use a smaller profile photo under 2MB.",
    });
  }

  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({
      success: false,
      message: "Invalid JSON request body.",
    });
  }

  return next(err);
});

// 404 fallback
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

module.exports = app;