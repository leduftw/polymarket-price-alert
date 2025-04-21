// getAlerts/index.js
const { listCompletedAlerts } = require("../shared");

module.exports = async function (context) {
  const allCompletedAlerts = await listCompletedAlerts();
  context.res = { body: allCompletedAlerts };
};
