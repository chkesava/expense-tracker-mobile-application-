# Spendly Dashboard Design Assets

## Runtime backgrounds
- `dashboard-morning.webp` — sunrise / teal mountains
- `dashboard-afternoon.webp` — bright sky / mountain lake
- `dashboard-evening.webp` — orange sunset
- `dashboard-night.webp` — moonlit starry mountains

Copy `assets/` into the app repository root. These are local assets; do not load them from remote URLs. Import each image using static `require(...)` paths in React Native.

## Design-only references
- `design/references/spendly-dashboard-reference.png` — approved Visual First dashboard mockup
- `design/references/spendly-dashboard-moodboard.png` — design moodboard only; never render in the app

The amounts and transactions in the dashboard reference are placeholders. Always render actual data from the existing app services.
