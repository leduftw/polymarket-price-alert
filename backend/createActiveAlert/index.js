// createAlert/index.js
const {
  isValidAlert,
  marketExists,
  listActiveAlerts,
  upsertActiveAlert,
} = require("../shared");

module.exports = async function (context, req) {
  const { marketId, outcomeIndex, threshold, direction } = req.body;

  // alert validation
  const probe = {
    id: "probe",
    marketId,
    outcomeIndex,
    threshold,
    direction,
  };
  if (!isValidAlert(probe) || !marketExists(marketId)) {
    context.res = {
      status: 400,
      body: !isValidAlert(probe)
        ? "Invalid alert payload."
        : `Market ${marketId} not found.`,
    };
    return;
  }

  // duplicate check
  const existing = (await listActiveAlerts()).some(
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
  await upsertActiveAlert(alert);

  context.res = { status: 201, body: alert };
};
