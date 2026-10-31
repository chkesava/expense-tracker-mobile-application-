#!/usr/bin/env node
/**
 * Dev-only: serves the bundled market functions on http://localhost:8888 so
 * local Expo web can show real market data (SPENDLY-645 review).
 *
 *   npm run build:netlify-fns
 *   node scripts/dev-market-api.js
 *   # in another terminal (PowerShell):
 *   $env:EXPO_PUBLIC_MARKET_API_URL="http://localhost:8888"; npx expo start --web
 *
 * Serves /api/stock, /api/mutual-funds, /api/crypto, /api/stock-history and
 * /api/market-overview from netlify/functions-dist/. Public market data only:
 * no Firebase, no user data, no secrets. Never deployed.
 */

const http = require("http");
const path = require("path");

const PORT = Number(process.env.PORT) || 8888;
const FUNCTIONS = ["stock", "mutual-funds", "crypto", "stock-history", "market-overview"];
const dist = path.join(__dirname, "..", "netlify", "functions-dist");

const handlers = {};
for (const name of FUNCTIONS) {
  try {
    handlers[name] = require(path.join(dist, `${name}.js`)).handler;
  } catch (error) {
    console.warn(`dev-market-api: ${name} not bundled (${error.message}). Run npm run build:netlify-fns.`);
  }
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS);
      return res.end();
    }
    const name = url.pathname.replace(/^\/api\//, "");
    const handler = handlers[name];
    if (!handler) {
      res.writeHead(404, { "Content-Type": "application/json", ...CORS });
      return res.end(JSON.stringify({ success: false, message: `No function ${name}` }));
    }
    try {
      const result = await handler({
        httpMethod: req.method,
        queryStringParameters: Object.fromEntries(url.searchParams),
        headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), String(v)])),
      });
      res.writeHead(result.statusCode, { ...result.headers, ...CORS });
      res.end(result.body);
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json", ...CORS });
      res.end(JSON.stringify({ success: false, message: String(error && error.message) }));
    }
  })
  .listen(PORT, () => console.log(`dev-market-api: http://localhost:${PORT}/api/{${Object.keys(handlers).join(",")}}`));
