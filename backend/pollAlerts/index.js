// pollAlerts/index.js
const {
  listAlerts,
  fetchPrice,
  isValidAlert,
  marketExists,
} = require("../shared");
const ioClients = {}; // you’ll need a SignalR or other push mechanism

module.exports = async function (context, myTimer) {
  const allAlerts = await listAlerts();

  // 1) schema + existence validation
  for (const a of allAlerts) {
    if (!isValidAlert(a)) {
      context.log.warn(`Skipping invalid alert ${a.id}`);
      continue;
    }
    if (!(await marketExists(a.marketId))) {
      context.log.warn(
        `Skipping alert ${a.id} for unknown market ${a.marketId}`
      );
      continue;
    }
    try {
      const price = await fetchPrice(a.marketId, a.outcomeIndex);
      const hit =
        a.direction === "below" ? price <= a.threshold : price >= a.threshold;
      if (hit) {
        // TODO: wire up your real push mechanism (SignalR, etc.)
        context.log(`Alert ${a.id} triggered at price ${price}`);
      }
    } catch (err) {
      context.log.error(`Error checking alert ${a.id}:`, err);
    }
  }
};
