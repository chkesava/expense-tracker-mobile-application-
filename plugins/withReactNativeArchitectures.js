const { withGradleProperties } = require("@expo/config-plugins");

/**
 * Drops x86/x86_64 from the release APK's native libraries. Expo's default
 * template builds all four ABIs (arm64-v8a, armeabi-v7a, x86, x86_64) into
 * every APK, but x86/x86_64 exist only for emulators — no real Android
 * phone uses them. On this app they alone accounted for ~55MB of a ~140MB
 * release APK (measured on the combined build; verified with `unzip -l` /
 * a per-ABI size breakdown of lib/**), with zero effect on real users.
 *
 * Applies to every product (this isn't part of the multi-app split) —
 * registered as a shared plugin in app.config.js.
 */
module.exports = function withReactNativeArchitectures(config) {
  return withGradleProperties(config, (config) => {
    const key = "reactNativeArchitectures";
    const value = "armeabi-v7a,arm64-v8a";
    const existing = config.modResults.find(
      (item) => item.type === "property" && item.key === key
    );
    if (existing) {
      existing.value = value;
    } else {
      config.modResults.push({ type: "property", key, value });
    }
    return config;
  });
};
