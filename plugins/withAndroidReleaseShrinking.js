const { withGradleProperties } = require("@expo/config-plugins");

/**
 * Turns on R8 (code shrinking + optimisation) and resource shrinking for
 * Android release builds (SPENDLY-492). Expo's template reads both flags from
 * gradle.properties and defaults them to false, which left ~51MB of
 * unshrunk dex in a ~90MB APK.
 *
 * React Native, Hermes, Expo modules, Reanimated/Worklets, SVG, Screens,
 * Gesture Handler, ML Kit and Google Sign-In ship their own consumer keep
 * rules; android/app/proguard-rules.pro keeps Reanimated explicitly. The
 * Firebase SDK in this app is the JS SDK, so it has no native classes to keep.
 *
 * Applies to every product — registered as a shared plugin in app.config.js
 * and in app.json's plugins array, next to withReactNativeArchitectures.
 */
const PROPERTIES = {
  "android.enableMinifyInReleaseBuilds": "true",
  "android.enableShrinkResourcesInReleaseBuilds": "true",
};

module.exports = function withAndroidReleaseShrinking(config) {
  return withGradleProperties(config, (config) => {
    for (const [key, value] of Object.entries(PROPERTIES)) {
      const existing = config.modResults.find(
        (item) => item.type === "property" && item.key === key
      );
      if (existing) {
        existing.value = value;
      } else {
        config.modResults.push({ type: "property", key, value });
      }
    }
    return config;
  });
};
