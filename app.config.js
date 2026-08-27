// Dynamic Expo config. Extends the static app.json (still the source of truth
// for `version`/`android.versionCode`, which scripts/common.js and the
// android-release.yml workflow read and bump directly) with per-product
// overrides selected by EXPO_PUBLIC_PRODUCT. Unset/expense reproduces today's
// app.json values exactly, so the existing combined build and release
// pipeline are unaffected until a product-aware CI workflow opts in.
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

function resolveProduct() {
  const raw = (process.env.EXPO_PUBLIC_PRODUCT || "expense").trim();
  if (!PRODUCTS.includes(raw)) {
    throw new Error(
      `Unknown EXPO_PUBLIC_PRODUCT "${raw}". Expected one of: ${PRODUCTS.join(", ")}.`
    );
  }
  return raw;
}

module.exports = ({ config }) => {
  const product = resolveProduct();
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const override = require(path.join(__dirname, "products", `${product}.json`));

  return {
    ...config,
    name: override.name,
    slug: override.slug,
    scheme: override.scheme,
    android: {
      ...config.android,
      package: override.package,
      permissions: override.permissions,
    },
    plugins: [...SHARED_PLUGINS, ...(override.extraPlugins || [])],
    extra: {
      ...config.extra,
      product,
    },
  };
};
