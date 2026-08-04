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

module.exports = config;
