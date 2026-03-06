// getAlerts/index.js
const { listCompletedAlerts } = require("../shared");

module.exports = async function (context) {
  try {
    const allCompletedAlerts = await listCompletedAlerts();
    context.res = { body: allCompletedAlerts };
  } catch (err) {
    context.log.error("Error fetching completed alerts:", err);
    context.res = { status: 500, body: "Failed to fetch completed alerts." };
  }
};
