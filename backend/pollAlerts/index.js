// pollAlerts/index.js
const { listAlerts } = require("../shared");
const fetchPrice = require("../shared").fetchPrice;
const ioClients = {}; // you’ll need a SignalR or other push mechanism

module.exports = async function (context, myTimer) {
  const alerts = await listAlerts();
  for (const a of alerts) {
    const price = await fetchPrice(a.marketId, a.outcomeIndex);
    const hit =
      a.direction === "below" ? price <= a.threshold : price >= a.threshold;
    if (hit) {
      // send notification via SignalR or another channel
      await ioClients[a.id].send(/* ... */);
    }
  }
};
