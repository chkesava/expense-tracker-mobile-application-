#!/usr/bin/env bash
# Cloud Agent install step for the Spendly / Ganesh Seva Expo app.
#
# Idempotent: safe to run repeatedly. It installs JS dependencies and, when a
# local .env is absent, generates one from the *non-secret* Firebase config
# that is already committed in google-services.json (the README states these
# EXPO_PUBLIC_FIREBASE_* values are embedded in every APK and are not secrets).
# This lets the Expo web app boot with a real Firebase project in the sandbox
# without committing a .env (which stays gitignored) or requiring a secret.
#
# It deliberately does NOT write any signing keystore passwords or server-only
# secrets. Native Google Sign-In still needs a dev/native build and SHA-1
# registration (see README) and is not required for the web dev server.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Installing npm dependencies"
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

if [ -f .env ]; then
  echo "==> .env already present; leaving it untouched"
else
  echo "==> Generating .env from .env.example + google-services.json"
  node .cursor/generate-env.js
fi

echo "==> Install complete"
