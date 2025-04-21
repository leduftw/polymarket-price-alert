// getMarkets/index.js
const { getAllActiveMarkets } = require("../shared");

module.exports = async function (context) {
  const markets = await getAllActiveMarkets();
  context.res = { body: markets.slice(0, 20) };
};
