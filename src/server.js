const dotenv = require("dotenv");
const app = require("./app");
const { startEligibilityJob } = require("./jobs/eligibility.job");

dotenv.config();

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  startEligibilityJob();
});
