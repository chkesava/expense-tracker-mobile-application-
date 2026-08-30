const path = require("path");
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

// "landing" mirrors app.config.js's web-only pseudo-product: the bare-root
// chooser build. Only accepted when EXPO_WEB_BUILD=1 (set only by
// scripts/build-web.js), so it can never be selected for a native build.
const WEB_TARGETS = [...PRODUCTS, "landing"];
const isWebBuild = process.env.EXPO_WEB_BUILD === "1";

// Route-group directories/files (relative to app/) owned by each product.
const PRODUCT_ROUTES = {
  expense: ["(app)"],
  nutrition: ["(nutrition)"],
  ganesh: ["(ganesh)", "(ganesh-auth)", "ganesh-phone-auth.tsx"],
  landing: [],
};

// The landing build owns no product routes, but also has no use for the
// generic combined-build screens (workspace picker, onboarding, generic
// login) — those stay reachable only from a combined (unset-product) build.
const LANDING_EXTRA_BLOCKS = ["(auth)", "welcome.tsx", "onboarding.tsx"];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Matches .../app/(nutrition)/... or .../app/ganesh-phone-auth.tsx on either path separator. */
function routeBlockPattern(routeName) {
  return new RegExp(`[\\\\/]app[\\\\/]${escapeRegExp(routeName)}([\\\\/]|$)`);
}

const activeProduct = (process.env.EXPO_PUBLIC_PRODUCT || "").trim();
const allowedProducts = isWebBuild ? WEB_TARGETS : PRODUCTS;

if (activeProduct && !allowedProducts.includes(activeProduct)) {
  throw new Error(
    `Unknown EXPO_PUBLIC_PRODUCT "${activeProduct}". Expected one of: ${allowedProducts.join(", ")}.`
  );
}

if (activeProduct) {
  const excludedRoutes = allowedProducts
    .filter((p) => p !== activeProduct)
    .flatMap((p) => PRODUCT_ROUTES[p]);
  if (activeProduct === "landing") {
    excludedRoutes.push(...LANDING_EXTRA_BLOCKS);
  }
  const existingBlockList = config.resolver.blockList;
  const existingList = Array.isArray(existingBlockList)
    ? existingBlockList
    : existingBlockList
      ? [existingBlockList]
      : [];

  config.resolver.blockList = [...existingList, ...excludedRoutes.map(routeBlockPattern)];
}

/**
 * Product-specific JS splash overlay. A static import of both overlays would
 * pull the Expense `splash-logo.png` into a Ganesh bundle. Metro resolves the
 * `product-splash-overlay` package name to one file per EXPO_PUBLIC_PRODUCT.
 */
const splashOverlayFile =
  activeProduct === "ganesh"
    ? path.resolve(__dirname, "components/ganesh/splash/GaneshSplashOverlay.tsx")
    : activeProduct === null
      ? path.resolve(__dirname, "components/splash/WorkspaceSplashOverlay.tsx")
      : path.resolve(__dirname, "components/splash/DefaultSplashOverlay.tsx");

config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  "product-splash-overlay": splashOverlayFile,
};

const previousResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "product-splash-overlay") {
    return { type: "sourceFile", filePath: splashOverlayFile };
  }
  if (previousResolveRequest) {
    return previousResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

if (activeProduct === "ganesh") {
  const currentBlockList = config.resolver.blockList;
  const currentList = Array.isArray(currentBlockList)
    ? currentBlockList
    : currentBlockList
      ? [currentBlockList]
      : [];
  config.resolver.blockList = [
    ...currentList,
    /[\\/]assets[\\/]branding[\\/]splash-logo\.png$/,
  ];
}

module.exports = config;
