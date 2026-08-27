const { getDefaultConfig } = require("expo/metro-config");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

/**
 * Firebase Auth RN entry (getReactNativePersistence / AsyncStorage) depends on
 * the package.json "react-native" field. With package exports enabled (Expo
 * default), Metro can resolve the web Auth build and emit the persistence warning.
 * @see https://docs.expo.dev/guides/using-firebase/
 */
config.resolver.unstable_enablePackageExports = false;

/**
 * Per-product route exclusion.
 *
 * Expo Router discovers every route file under app/ regardless of whether
 * it's registered in a <Stack.Screen> — a <Stack.Screen> list only gates
 * navigation, not what Metro bundles. To keep a single-product build from
 * shipping the other two products' route code (and everything only they
 * import — components/ganesh, hooks/useGanesh*, etc. — which Metro then
 * drops as unreachable), block their route-group directories/files from
 * Metro's file crawler entirely. An unset EXPO_PUBLIC_PRODUCT applies no
 * blockList changes, so the existing combined build is unaffected.
 * See docs/MULTI_APP_SEPARATION_ANALYSIS.md §11/§22.
 */
const PRODUCTS = ["expense", "nutrition", "ganesh"];

// Route-group directories/files (relative to app/) owned by each product.
const PRODUCT_ROUTES = {
  expense: ["(app)"],
  nutrition: ["(nutrition)"],
  ganesh: ["(ganesh)", "(ganesh-auth)", "ganesh-phone-auth.tsx"],
};

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Matches .../app/(nutrition)/... or .../app/ganesh-phone-auth.tsx on either path separator. */
function routeBlockPattern(routeName) {
  return new RegExp(`[\\\\/]app[\\\\/]${escapeRegExp(routeName)}([\\\\/]|$)`);
}

const activeProduct = (process.env.EXPO_PUBLIC_PRODUCT || "").trim();

if (activeProduct && !PRODUCTS.includes(activeProduct)) {
  throw new Error(
    `Unknown EXPO_PUBLIC_PRODUCT "${activeProduct}". Expected one of: ${PRODUCTS.join(", ")}.`
  );
}

if (activeProduct) {
  const excludedRoutes = PRODUCTS.filter((p) => p !== activeProduct).flatMap(
    (p) => PRODUCT_ROUTES[p]
  );
  const existingBlockList = config.resolver.blockList;
  const existingList = Array.isArray(existingBlockList)
    ? existingBlockList
    : existingBlockList
      ? [existingBlockList]
      : [];

  config.resolver.blockList = [...existingList, ...excludedRoutes.map(routeBlockPattern)];
}

module.exports = config;
