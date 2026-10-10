# SPENDLY-492: Enable R8 and resource shrinking for Android release builds

**Epic:** SPENDLY-488 (Android lag fixes).

## Problem
Expo's template reads `android.enableMinifyInReleaseBuilds` and `android.enableShrinkResourcesInReleaseBuilds` from `gradle.properties` and defaults both to `false`. The release APK therefore shipped about 51 MB of unshrunk, unoptimised dex.

## Fix
A new config plugin, `plugins/withAndroidReleaseShrinking.js`, follows the same pattern as `withReactNativeArchitectures` and sets both properties to `true`.
- It's registered in the shared plugin list in `app.config.js`, so it applies to every product.
- It's also registered in `app.json`'s `plugins`, for the combined build.
- `prebuild` writes the properties into `android/gradle.properties`, so CI release builds pick them up.

**Keep rules:** React Native, Hermes, Expo modules, Reanimated/Worklets, SVG, Screens, Gesture Handler, ML Kit and Google Sign-In ship consumer keep rules. `android/app/proguard-rules.pro` already keeps Reanimated. The Firebase SDK here is the JS SDK, so it has no native classes to keep.

## Result (Spendly Test, `assembleRelease`)

| | Before | After |
|---|---|---|
| APK | 90.4 MB | 78.6 MB |
| dex | 51.4 MB | 18.7 MB |
| res | 13.7 MB | 13.6 MB |
| R8 warnings (missing class) | n/a | 0 |

## Note for local builds
`scripts/build-test-apk.js` skips `prebuild` when `android/` is already the test variant. After changing config plugins, pass `--prebuild` (`npm run android:test-build -- --prebuild`) or the new properties won't be applied.

## Tests
- `npm test`: 352 test files pass. One perf-timing test, `feeDetection` "handles a large history quickly", failed once while Gradle was hogging the CPU and passed when re-run.
- **Pending:** a device smoke test of the R8 build (launch, sign-in, add/edit expense, charts, accounts, settings). R8 problems only show up at runtime.
