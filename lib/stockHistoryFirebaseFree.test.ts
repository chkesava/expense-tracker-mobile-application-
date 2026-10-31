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
  // SPENDLY-644: market overview client.
  "lib/marketOverviewCache.ts",
  "hooks/useMarketOverview.ts",
  // SPENDLY-645: Markets tab.
  "shared/utils/marketsView.ts",
  "components/markets/MarketsDashboard.tsx",
  "components/markets/MarketParts.tsx",
  // SPENDLY-646: read-only instrument sheet.
  "components/markets/InstrumentSheet.tsx",
  // SPENDLY-647: stock screener universe.
  "shared/data/nifty500.ts",
  "shared/utils/screenerUniverse.ts",
  "netlify/functions/screener-universe.ts",
  // SPENDLY-648: screener filter and sort engine.
  "shared/utils/screener.ts",
  // SPENDLY-649: saved screens, on the device only.
  "shared/utils/savedScreens.ts",
  "lib/screenerSavedScreens.ts",
  "netlify/functions/market-overview.ts",
];

const FIREBASE_IMPORT = /from\s+["'](firebase(\/[^"']*)?|firebase-admin(\/[^"']*)?|@\/lib\/firebase[^"']*|@react-native-firebase\/[^"']*|@\/lib\/commitMutations)["']/;

describe("stock chart path is Firebase-free", () => {
  it.each(CHART_PATH)("%s imports no Firebase module", (file) => {
    const source = readFileSync(path.resolve(__dirname, "..", file), "utf8");
    expect(source).not.toMatch(FIREBASE_IMPORT);
  });
});

/**
 * SPENDLY-646: the Markets tab's instrument sheet is read-only. It may not
 * reach the portfolio (holdings, trades, watchlist writes) at all.
 */
const PORTFOLIO_ACCESS = /\busePortfolio\(|PortfolioDataProvider|@\/services\/portfolio|@\/hooks\/usePortfolio["\']|addToWatchlist|MockTradeModal/;

describe("Markets tab is read-only", () => {
  it.each(["components/markets/InstrumentSheet.tsx", "components/markets/MarketsDashboard.tsx", "components/markets/MarketParts.tsx"])(
    "%s does not touch the portfolio",
    (file) => {
      const source = readFileSync(path.resolve(__dirname, "..", file), "utf8");
      expect(source).not.toMatch(PORTFOLIO_ACCESS);
    }
  );
});
