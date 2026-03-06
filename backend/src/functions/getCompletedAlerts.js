const { app } = require("@azure/functions");
const { listCompletedAlerts } = require("../shared");

app.http("getCompletedAlerts", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "completed-alerts",
  handler: async (request, context) => {
    try {
      const allCompletedAlerts = await listCompletedAlerts();
      return { jsonBody: allCompletedAlerts };
    } catch (err) {
      context.error("Error fetching completed alerts:", err);
      return { status: 500, body: "Failed to fetch completed alerts." };
    }
  },
});
