const { app } = require("@azure/functions");
const { getCachedMarkets } = require("../shared");

app.http("getMarkets", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "markets",
  handler: async (request, context) => {
    try {
      const q = (request.query.get("q") || "").toLowerCase();
      let markets = getCachedMarkets();
      if (q) {
        markets = markets.filter((m) => m.question.toLowerCase().includes(q));
      }
      return { jsonBody: markets.slice(0, 20) };
    } catch (err) {
      context.error("Error fetching markets:", err);
      return { status: 500, body: "Failed to fetch markets." };
    }
  },
});
