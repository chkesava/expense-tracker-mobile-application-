# SPENDLY-493: AOT-compile the app after sideload installs

**Epic:** SPENDLY-488 (Android lag fixes).

## Problem
`adb install`, and a sideload through the system package installer, leaves the app at dexopt filter `verify`. Its Java/Kotlin code (React Native, Reanimated, Fabric mounting) then runs interpreted or JIT until Android's idle-time dexopt runs, usually overnight on a charger. That is why every fresh build felt laggiest on day one.

On the CPH2661, compiling the installed app cut UI-thread CPU from 21.0 s to 13.0 s and took p95/p99 frame times from 31/121 ms to 19/57 ms (`docs/PERF_DIAGNOSIS_2026-10-10.md`).

## Fix
`scripts/install-apk.js` (`npm run android:install`) does the following:
1. Runs `adb install -r <apk>`. The default is `dist/Spendly-Test.apk`, whose package id is known.
2. Runs `cmd package compile -m speed -f <package>`. A fresh install has no usage profile yet, so `speed-profile` would compile almost nothing; `speed` is full AOT.
3. Force-stops the app, so the next launch runs the compiled code.
4. Prints the dexopt status before and after.

`--compile-only --package=<id>` skips the install. Use it for an app installed some other way, such as the real Spendly after an in-app update.

`build-test-apk.js`'s closing hint and `docs/LOCAL_TEST_MODE.md` step 4 now point to `npm run android:install`.

## Not covered
- **Real users:** they get the in-app updater's sideload and still wait for idle dexopt. Fixing that would need a baseline profile (androidx.profileinstaller), which is a possible follow-up.
- **Tests:** none added. The script is a thin adb wrapper. Its argument parsing was checked by hand: the default test APK, `--compile-only`, and a missing `--package` error.
- **Device run:** pending, because the phone was disconnected.
