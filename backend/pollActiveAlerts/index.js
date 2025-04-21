// pollAlerts/index.js

const fetch = require("node-fetch");

const {
  listActiveAlerts,
  isValidAlert,
  marketExists,
  fetchPrice,
  upsertCompletedAlert,
  deleteActiveAlert,
} = require("../shared");

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const sendTelegramAlert = async (message) => {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const body = {
    chat_id: TELEGRAM_CHAT_ID,
    text: message,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.error("Telegram send failed", await res.text());
  }
};

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
        // Notify the user on Telegram
        await sendTelegramAlert(
          `Alert triggered for market ${a.marketId} at price ${price}`
        );

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
