const { app } = require("@azure/functions");
const fetch = require("node-fetch");

const GAMMA_API = "https://gamma-api.polymarket.com";

app.http("getMarketById", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "markets/{id}",
  handler: async (request, context) => {
    const id = request.params.id;
    const r = await fetch(`${GAMMA_API}/markets/${id}`);
    if (!r.ok) {
      return { status: 502, body: `Gamma /markets/${id} → ${r.status}` };
    }
    const m = await r.json();
    let { outcomes, outcomePrices } = m;
    if (typeof outcomes === "string") outcomes = JSON.parse(outcomes);
    if (typeof outcomePrices === "string") outcomePrices = JSON.parse(outcomePrices);
    return {
      jsonBody: {
        id: m.id,
        question: m.question,
        outcomes: outcomes.map((label, i) => ({
          id: i,
          label,
          price: outcomePrices[i],
        })),
      },
    };
  },
});
