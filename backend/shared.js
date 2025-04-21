// shared.js
const fetch = require("node-fetch");
const { CosmosClient } = require("@azure/cosmos");

const GAMMA = {
  API: "https://gamma-api.polymarket.com",
  PAGE: 500,
  MAXPG: 10,
};

const cosmos = new CosmosClient({
  endpoint: process.env.COSMOS_ENDPOINT,
  key: process.env.COSMOS_KEY,
});
let container;

(async () => {
  const { database } = await cosmos.databases.createIfNotExists({
    id: "AlertsDB",
  });
  ({ container } = await database.containers.createIfNotExists({
    id: "Alerts",
    partitionKey: { kind: "Hash", paths: ["/marketId"] },
  }));
})();

async function fetchMarketsPage(limit = GAMMA.PAGE, offset = 0) {
  const u = new URL(`${GAMMA.API}/markets`);
  u.searchParams.set("active", "true");
  u.searchParams.set("closed", "false");
  u.searchParams.set("archived", "false");
  u.searchParams.set("limit", limit);
  u.searchParams.set("offset", offset);
  const r = await fetch(u);
  if (!r.ok) throw new Error(`Gamma → ${r.status}`);
  return r.json();
}

async function getAllActiveMarkets() {
  let all = [],
    batch;
  for (let i = 0; i < GAMMA.MAXPG; i++) {
    batch = await fetchMarketsPage(GAMMA.PAGE, i * GAMMA.PAGE);
    if (!batch.length) break;
    all.push(...batch);
    if (batch.length < GAMMA.PAGE) break;
  }
  return all.map((m) => ({ id: m.id, question: m.question }));
}

async function listAlerts() {
  const { resources } = await container.items
    .query("SELECT * FROM c")
    .fetchAll();
  return resources;
}

async function upsertAlert(a) {
  await container.items.upsert(a);
}

module.exports = {
  fetchMarketsPage,
  getAllActiveMarkets,
  listAlerts,
  upsertAlert,
};
