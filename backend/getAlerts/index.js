// getAlerts/index.js
const { listAlerts } = require("../shared");

module.exports = async function (context) {
  const alerts = await listAlerts();
  context.res = { body: alerts };
};
