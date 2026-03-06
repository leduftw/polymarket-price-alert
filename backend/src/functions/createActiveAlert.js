const { app } = require("@azure/functions");
const { isValidAlert, marketExists, listActiveAlerts, upsertActiveAlert } = require("../shared");

app.http("createActiveAlert", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "active-alerts",
  handler: async (request, context) => {
    const { marketId, outcomeIndex, threshold, direction } = await request.json();
    const probe = { id: "probe", marketId, outcomeIndex, threshold, direction };

    if (!isValidAlert(probe) || !marketExists(marketId)) {
      return {
        status: 400,
        body: !isValidAlert(probe) ? "Invalid alert payload." : `Market ${marketId} not found.`,
      };
    }

    const existing = (await listActiveAlerts()).some(
      (a) =>
        a.marketId === marketId &&
        a.outcomeIndex === outcomeIndex &&
        a.threshold === threshold &&
        a.direction === direction
    );
    if (existing) {
      return { status: 409, body: "Duplicate alert" };
    }

    const id = Date.now().toString();
    const alert = { id, marketId, outcomeIndex, threshold, direction };
    await upsertActiveAlert(alert);
    return { status: 201, jsonBody: alert };
  },
});
