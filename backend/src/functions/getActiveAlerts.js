const { app } = require("@azure/functions");
const { listActiveAlerts, isValidAlert, marketExists } = require("../shared");

app.http("getActiveAlerts", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "active-alerts",
  handler: async (request, context) => {
    try {
      const allActiveAlerts = await listActiveAlerts();
      const validActiveAlerts = allActiveAlerts.filter(
        (a) => isValidAlert(a) && marketExists(a.marketId)
      );
      return { jsonBody: validActiveAlerts };
    } catch (err) {
      context.error("Error fetching active alerts:", err);
      return { status: 500, body: "Failed to fetch active alerts." };
    }
  },
});
