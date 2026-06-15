const express = require("express");
const router = express.Router();
const pool = require("../config/db");

const { verifyToken } = require("../middlewares/auth.middleware");
const { allowRoles } = require("../middlewares/role.middleware");

router.put(
  "/update-location",
  verifyToken,
  allowRoles("donor", "recipient", "both"),
  async (req, res) => {
    try {
      const userId = req.user.id;
      const latitude = Number(req.body.latitude);
      const longitude = Number(req.body.longitude);

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return res.status(400).json({
          success: false,
          message: "Valid latitude and longitude are required",
        });
      }

      await pool.query(
        `UPDATE users
         SET latitude = ?, longitude = ?, location_updated_at = NOW()
         WHERE id = ?`,
        [latitude, longitude, userId]
      );

      res.json({
        success: true,
        message: "Location updated successfully",
        latitude,
        longitude,
      });
    } catch (err) {
      console.error("Update location error:", err);
      res.status(500).json({
        success: false,
        message: "Server error",
      });
    }
  }
);

module.exports = router;
