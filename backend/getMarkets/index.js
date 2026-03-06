// getMarkets/index.js
const { getCachedMarkets } = require("../shared");

module.exports = async function (context, req) {
  try {
    const q = (req.query.q || "").toLowerCase();
    let markets = getCachedMarkets();

    if (q) {
      markets = markets.filter((m) => m.question.toLowerCase().includes(q));
    }

    context.res = {
      body: markets.slice(0, 20),
    };
  } catch (err) {
    context.log.error("Error fetching markets:", err);
    context.res = { status: 500, body: "Failed to fetch markets." };
  }
};
