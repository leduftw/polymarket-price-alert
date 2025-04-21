// getMarkets/index.js
const { getCachedMarkets } = require("../shared");

module.exports = async function (context, req) {
  // 1) grab the `q` query‐string (or default to empty)
  const q = (req.query.q || "").toLowerCase();

  // 2) pull the cached list
  let markets = getCachedMarkets();

  // 3) if a search term was provided, filter by question
  if (q) {
    markets = markets.filter((m) => m.question.toLowerCase().includes(q));
  }

  // 4) return at most 20 results
  context.res = {
    body: markets.slice(0, 20),
  };
};
