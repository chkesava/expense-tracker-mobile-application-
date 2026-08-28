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

// "landing" is a 4th, web-only pseudo-product: the bare-root chooser screen
// deployed to spendly-share.netlify.app/. It owns no Android package/permissions
// and must never be selectable outside a web build (see isWebBuild below) —
// scripts/build-web.js is the only thing that ever sets EXPO_WEB_BUILD.
const WEB_TARGETS = [...PRODUCTS, "landing"];

// Plugins that are identical for every product. Anything product-specific
// (currently the splash image and expo-image-picker's permission copy)
// lives in products/<product>.json's "splashImage" / "extraPlugins" instead.
const SHARED_PLUGINS = [
  ["expo-router", { sitemap: false }],
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
  // Drops x86/x86_64 native libs (emulator-only, ~55MB of a ~140MB APK) —
  // see plugins/withReactNativeArchitectures.js. Kept in sync with the
  // same entry in app.json's plugins array (the combined build's config,
  // which app.config.js returns unmodified when no product is set).
  "./plugins/withReactNativeArchitectures",
];

function splashScreenPlugin(image) {
  return [
    "expo-splash-screen",
    {
      image: image || "./assets/branding/splash-logo.png",
      resizeMode: "contain",
      backgroundColor: "#071A2B",
    },
  ];
}

/**
 * True only for the dedicated web export path (scripts/build-web.js). Never
 * set for an Android build (npx expo prebuild / gradlew), so `landing` and
 * `experiments.baseUrl` below can never leak into a native build.
 */
const isWebBuild = process.env.EXPO_WEB_BUILD === "1";

/** Returns null for "combined, no override" (today's default), or a validated product id. */
function resolveProduct() {
  const raw = (process.env.EXPO_PUBLIC_PRODUCT || "").trim();
  if (raw === "") return null;
  const allowed = isWebBuild ? WEB_TARGETS : PRODUCTS;
  if (!allowed.includes(raw)) {
    throw new Error(
      `Unknown EXPO_PUBLIC_PRODUCT "${raw}". Expected one of: ${allowed.join(", ")}.`
    );
  }
  return raw;
}

module.exports = ({ config }) => {
  const product = resolveProduct();
  if (!product) return config;

  // eslint-disable-next-line global-require, import/no-dynamic-require
  const override = require(path.join(__dirname, "products", `${product}.json`));

  if (override.webOnly && !isWebBuild) {
    throw new Error(
      `products/${product}.json is web-only and cannot be used for a native build.`
    );
  }

  const base = {
    ...config,
    name: override.name,
    slug: override.slug,
    scheme: override.scheme,
    // Each product has its own version/versionCode stream (see
    // products/<product>.json and scripts/common.js's per-product
    // getCurrentVersion/updateVersion), independent of app.json's — which
    // remains the combined build's own stream, untouched by product builds.
    version: override.version,
    // Falls back to the shared Spendly assets when a product doesn't
    // supply its own (currently only Expense — it keeps the original
    // branding it already shipped with).
    icon: override.icon || config.icon,
    extra: {
      ...config.extra,
      product,
    },
  };

  if (isWebBuild) {
    // Sub-path hosting (spendly-share.netlify.app/<basePath>) via Expo's
    // experiments.baseUrl — see scripts/build-web.js for how each product is
    // exported into its own output directory with this set. Deliberately
    // gated behind isWebBuild: getBaseUrlFromExpoConfig() in @expo/cli is not
    // platform-scoped, so setting this unconditionally would also prefix
    // Android bundle/asset paths.
    return {
      ...base,
      experiments: { ...config.experiments, baseUrl: override.web.basePath || "" },
      web: {
        ...config.web,
        name: override.name,
        themeColor: override.web.themeColor,
        description: override.web.description,
        lang: "en",
      },
      // "landing" has no android/permissions/plugins of its own — plugins
      // are inert for `expo export` anyway, so keep the shared list rather
      // than diverging behavior for a build that never runs them.
      plugins: [
        ...SHARED_PLUGINS,
        splashScreenPlugin(override.splashImage),
        ...(override.extraPlugins || []),
      ],
    };
  }

  return {
    ...base,
    android: {
      ...config.android,
      package: override.package,
      permissions: override.permissions,
      versionCode: override.versionCode,
      adaptiveIcon: {
        ...config.android?.adaptiveIcon,
        foregroundImage: override.adaptiveIconForeground || config.android?.adaptiveIcon?.foregroundImage,
      },
    },
    plugins: [
      ...SHARED_PLUGINS,
      splashScreenPlugin(override.splashImage),
      ...(override.extraPlugins || []),
    ],
  };
};
