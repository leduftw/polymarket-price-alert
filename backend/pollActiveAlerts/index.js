// pollAlerts/index.js

const {
  listActiveAlerts,
  isValidAlert,
  marketExists,
  fetchPrice,
  upsertCompletedAlert,
  deleteActiveAlert,
} = require("../shared");

module.exports = async function (context, myTimer) {
  const allActiveAlerts = await listActiveAlerts();
  context.log(`Active alerts count: ${allActiveAlerts.length}`);

  for (const a of allActiveAlerts) {
    if (!isValidAlert(a)) {
      context.log.warn(`Skipping invalid alert (id: ${a.id})`);
      continue;
    }
    if (!marketExists(a.marketId)) {
      context.log.warn(
        `Skipping alert (id: ${a.id}) for unknown market (id: ${a.marketId})`
      );
      continue;
    }

    try {
      const price = await fetchPrice(a.marketId, a.outcomeIndex);
      const hit =
        a.direction === "below" ? price <= a.threshold : price >= a.threshold;

      if (hit) {
        // Move to CompletedAlerts
        await upsertCompletedAlert({
          ...a,
          completedAt: new Date().toISOString(),
          completedPrice: price,
        });
        // Remove from ActiveAlerts
        await deleteActiveAlert(a.id, a.marketId);

        context.log(
          `Alert (id: ${a.id}) completed at ${price}, moved to CompletedAlerts`
        );
      }
    } catch (err) {
      context.log.error(`Error checking alert (id: ${a.id}):`, err);
    }
  }
};
