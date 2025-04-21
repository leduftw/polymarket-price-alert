// createAlert/index.js
const { upsertAlert, listAlerts } = require("../shared");

module.exports = async function (context, req) {
  const { marketId, outcomeIndex, threshold, direction } = req.body;

  // basic validation...
  if (!marketId || typeof threshold !== "number") {
    context.res = { status: 400, body: "Invalid payload" };
    return;
  }

  // duplicate check
  const existing = (await listAlerts()).some(
    (a) =>
      a.marketId === marketId &&
      a.outcomeIndex === outcomeIndex &&
      a.threshold === threshold &&
      a.direction === direction
  );
  if (existing) {
    context.res = { status: 409, body: "Duplicate alert" };
    return;
  }

  const id = Date.now().toString();
  const alert = { id, marketId, outcomeIndex, threshold, direction };
  await upsertAlert(alert);

  context.res = { status: 201, body: alert };
};
