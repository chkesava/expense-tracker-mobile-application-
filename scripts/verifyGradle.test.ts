import { describe, expect, it } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { pointReleaseBuildTypeAtReleaseSigning } = require("./verify-gradle.js") as {
  pointReleaseBuildTypeAtReleaseSigning: (gradle: string) => string;
};

/** The shape Expo's prebuild writes (after the release signingConfig is added). */
const PREBUILT = `
android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        release {
            if (project.hasProperty('MYAPP_RELEASE_STORE_FILE')) {
                storeFile file(MYAPP_RELEASE_STORE_FILE)
            }
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            signingConfig signingConfigs.debug
            shrinkResources false
        }
    }
}
`;

function signingOf(gradle: string, buildType: "debug" | "release"): string | undefined {
  const types = gradle.slice(gradle.indexOf("buildTypes"));
  const block = types.slice(types.indexOf(`${buildType} {`));
  return /signingConfig\s+signingConfigs\.(\w+)/.exec(block)?.[1];
}

describe("pointReleaseBuildTypeAtReleaseSigning (SPENDLY-638)", () => {
  it("signs the release build type with the release key on the first pass", () => {
    const out = pointReleaseBuildTypeAtReleaseSigning(PREBUILT);
    expect(signingOf(out, "release")).toBe("release");
  });

  it("leaves the debug build type alone", () => {
    const out = pointReleaseBuildTypeAtReleaseSigning(PREBUILT);
    expect(signingOf(out, "debug")).toBe("debug");
  });

  it("is idempotent", () => {
    const once = pointReleaseBuildTypeAtReleaseSigning(PREBUILT);
    expect(pointReleaseBuildTypeAtReleaseSigning(once)).toBe(once);
  });
});
