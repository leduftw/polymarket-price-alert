// getMarketById/index.js
const fetch = require("node-fetch");
const { GAMMA_API } = { GAMMA_API: "https://gamma-api.polymarket.com" };

module.exports = async function (context, req) {
  const id = req.params.id;
  const r = await fetch(`${GAMMA_API}/markets/${id}`);
  if (!r.ok) {
    context.res = { status: 502, body: `Gamma /markets/${id} → ${r.status}` };
    return;
  }
  const m = await r.json();
  let { outcomes, outcomePrices } = m;
  if (typeof outcomes === "string") outcomes = JSON.parse(outcomes);
  if (typeof outcomePrices === "string")
    outcomePrices = JSON.parse(outcomePrices);

  context.res = {
    body: {
      id: m.id,
      question: m.question,
      outcomes: outcomes.map((label, i) => ({
        id: i,
        label,
        price: outcomePrices[i],
      })),
    },
  };
};
