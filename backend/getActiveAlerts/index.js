// getAlerts/index.js
const { listActiveAlerts, isValidAlert, marketExists } = require("../shared");

module.exports = async function (context) {
  const allActiveAlerts = await listActiveAlerts();
  const validActiveAlerts = allActiveAlerts.filter(
    (a) => isValidAlert(a) && marketExists(a.marketId)
  );
  context.res = { body: validActiveAlerts };
};
