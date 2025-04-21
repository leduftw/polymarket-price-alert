// getAlerts/index.js
const { listAlerts, isValidAlert, marketExists } = require("../shared");

module.exports = async function (context) {
  const allAlerts = await listAlerts();
  const validAlerts = allAlerts.filter(
    (a) => isValidAlert(a) && marketExists(a.marketId)
  );
  context.res = { body: validAlerts };
};
