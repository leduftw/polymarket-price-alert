// getAlerts/index.js
const { listActiveAlerts, isValidAlert, marketExists } = require("../shared");

module.exports = async function (context) {
  try {
    const allActiveAlerts = await listActiveAlerts();
    const validActiveAlerts = allActiveAlerts.filter(
      (a) => isValidAlert(a) && marketExists(a.marketId)
    );
    context.res = { body: validActiveAlerts };
  } catch (err) {
    context.log.error("Error fetching active alerts:", err);
    context.res = { status: 500, body: "Failed to fetch active alerts." };
  }
};
