import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

/**
 * SPENDLY-558 AC 4: chart history comes from the market endpoint and its
 * caches only. Changing range must never read (or write) Firestore, so no
 * module on the chart path may import Firebase.
 */
const CHART_PATH = [
  "components/portfolio/stockChart/StockChartCard.tsx",
  "components/portfolio/stockChart/StockChartPlot.tsx",
  "hooks/useStockHistory.ts",
  "lib/stockHistoryCache.ts",
  "services/marketDataService.ts",
  "shared/utils/stockHistory.ts",
  "shared/utils/stockChartGeometry.ts",
  "netlify/functions/stock-history.ts",
  "netlify/functions/_stockHistoryProvider.ts",
  "netlify/functions/_historyCache.ts",
  // SPENDLY-642: market overview.
  "shared/utils/marketOverview.ts",
  // SPENDLY-643: NIFTY 50 movers.
  "shared/utils/marketMovers.ts",
  "shared/data/nifty50.ts",
  "netlify/functions/market-overview.ts",
];

const FIREBASE_IMPORT = /from\s+["'](firebase(\/[^"']*)?|firebase-admin(\/[^"']*)?|@\/lib\/firebase[^"']*|@react-native-firebase\/[^"']*|@\/lib\/commitMutations)["']/;

describe("stock chart path is Firebase-free", () => {
  it.each(CHART_PATH)("%s imports no Firebase module", (file) => {
    const source = readFileSync(path.resolve(__dirname, "..", file), "utf8");
    expect(source).not.toMatch(FIREBASE_IMPORT);
  });
});
