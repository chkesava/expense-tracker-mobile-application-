// Dynamic Expo config. Extends the static app.json (still the source of truth
// for `version`/`android.versionCode`, which scripts/common.js and the
// android-release.yml workflow read and bump directly) with per-product
// overrides selected by EXPO_PUBLIC_PRODUCT.
//
// IMPORTANT: an unset EXPO_PUBLIC_PRODUCT must return `config` completely
// unchanged. The existing android-release.yml workflow never sets this var,
// and today's production app is the *combined* build (all three products'
// routes, Ganesh's image-picker plugin, single applicationId) — not
// "expense". Silently defaulting to the expense override here would ship a
// regressed combined app the next time the unmodified CI workflow runs.
// Only an explicit expense|nutrition|ganesh value opts into a single-product
// build (see app/_layout.tsx / metro.config.js, which key off the same var).
//
// See docs/MULTI_APP_SEPARATION_ANALYSIS.md (§14-16) for the full rationale.
const path = require("path");

const PRODUCTS = ["expense", "nutrition", "ganesh"];

// Plugins that are identical for every product. Anything product-specific
// (currently just expo-image-picker's permission copy) lives in
// products/<product>.json's "extraPlugins" instead.
const SHARED_PLUGINS = [
  ["expo-router", { sitemap: false }],
  [
    "expo-splash-screen",
    {
      image: "./assets/branding/splash-logo.png",
      resizeMode: "contain",
      backgroundColor: "#071A2B",
    },
  ],
  "expo-secure-store",
  "expo-local-authentication",
  "@react-native-google-signin/google-signin",
  [
    "expo-notifications",
    {
      icon: "./assets/branding/notification-icon.png",
      color: "#071A2B",
    },
  ],
];

/** Returns null for "combined, no override" (today's default), or a validated product id. */
function resolveProduct() {
  const raw = (process.env.EXPO_PUBLIC_PRODUCT || "").trim();
  if (raw === "") return null;
  if (!PRODUCTS.includes(raw)) {
    throw new Error(
      `Unknown EXPO_PUBLIC_PRODUCT "${raw}". Expected one of: ${PRODUCTS.join(", ")}.`
    );
  }
  return raw;
}

module.exports = ({ config }) => {
  const product = resolveProduct();
  if (!product) return config;

  // eslint-disable-next-line global-require, import/no-dynamic-require
  const override = require(path.join(__dirname, "products", `${product}.json`));

  return {
    ...config,
    name: override.name,
    slug: override.slug,
    scheme: override.scheme,
    // Each product has its own version/versionCode stream (see
    // products/<product>.json and scripts/common.js's per-product
    // getCurrentVersion/updateVersion), independent of app.json's — which
    // remains the combined build's own stream, untouched by product builds.
    version: override.version,
    android: {
      ...config.android,
      package: override.package,
      permissions: override.permissions,
      versionCode: override.versionCode,
    },
    plugins: [...SHARED_PLUGINS, ...(override.extraPlugins || [])],
    extra: {
      ...config.extra,
      product,
    },
  };
};
