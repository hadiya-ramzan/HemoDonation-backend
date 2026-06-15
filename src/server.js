const dotenv = require("dotenv");
dotenv.config();

const app = require("./app");
const { startEligibilityJob } = require("./jobs/eligibility.job");
const pool = require("./config/db");

const PORT = process.env.PORT || 8080;

async function startServer() {
  try {
    const conn = await pool.getConnection();

    console.log("✅ Connected to MySQL");
    console.log("Host:", process.env.MYSQLHOST || process.env.DB_HOST);
    console.log(
      "Database:",
      process.env.MYSQLDATABASE || process.env.DB_NAME
    );

    conn.release();
    app.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
      startEligibilityJob();
    });
  } catch (err) {
    console.error("❌ DB Connection Failed");
    console.error(err.message);

    app.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
    });
  }
}

startServer();
