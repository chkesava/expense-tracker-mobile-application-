# SPENDLY-556 (Phase 6i): Onboarding, welcome, sign-in and delete account

Story under epic SPENDLY-531. Branch: `feature/SPENDLY-556-onboarding-sign-in`, cut from the epic at `1fb5be75`, which includes SPENDLY-555.

UI only. **Sign-up and sign-in, the onboarding writes and account deletion are unchanged.** That is proven by the A/B check below.

## Multi-app scope
`/(auth)/login`, `/onboarding` (the first-run carousel) and `/delete-account` are shared:
- Expense and Nutrition both sign in on `/(auth)/login`.
- Every build shows the carousel.
- All three apps reach delete-account.

Ganesh signs in on its own `(ganesh-auth)` screen, which is untouched.

- **`lib/authLook.ts`** (new, pure) decides who gets the new look:
  - `usesExpenseLook(product)` is true for the Expense build and for the combined build. The combined build's chooser only offers Expense and Ganesh, and Ganesh has its own sign-in.
  - `authPalette` and `socialButtonPalette` return theme tokens for Expense. For the other products they return **the exact pre-556 colours**, including the old two-colour "is it dark?" test.
  - `legacyAuthBackground` holds the previous sign-in artwork colours.
- **Unit tests** (`lib/authLook.test.ts`) pin those legacy values, so Nutrition's sign-in can't drift by accident.
- **Delete-account** gets the theme scope only when it is used as Expense: an Expense build, or the combined build with the Expense workspace active.

## What changed (Expense)
- **Sign-in and sign-up** (`login.tsx`, `AuthBackground`, `SocialLoginButton`):
  - The background is the theme background with the app's `AuraBackground` glow, instead of the blue/teal blobs and dot grid.
  - The card uses the theme surface and border. The primary button is the solid accent with `primaryForeground` text, instead of the fixed blue→teal gradient.
  - Links use the accent.
  - The "Google" mark now has a colour; it was black, so invisible on dark.
  - **The screen sits outside the `(app)` `SpendlyUIScope`, so the shared `Input` fell back to the default Gluestack palette:** dark labels ("Email", "Full name") and white borders on Midnight Emerald. It is now wrapped in `SpendlyUIScope`.
  - The old dark test only recognised two old background colours, so Midnight Emerald was treated as light. It no longer decides anything for Expense.
- **First-run carousel:**
  - One theme accent, instead of four unrelated per-slide colours (indigo, green, pink, amber).
  - Theme background, text, surfaces and fonts; the Continue label uses `primaryForeground`.
- **Dashboard welcome card** (`components/onboarding/WelcomeScreen`, Expense only):
  - The scrim and `useSpendlyScopeVars()`, since it's an RN `Modal`.
  - The accent wash and border come from `surfaces`, and the button label and icons use `primaryForeground`.
- **Setup wizard** (`SetupWizardModal`, Expense only):
  - The step badges use semantic tokens: primary, success, info and warning washes.
  - Selected cards use the accent wash; the button label, icons and active preset use `primaryForeground`.
  - Scope vars on the `pageSheet` `Modal`, so the Gluestack inputs inside stay themed on web.
- **Delete account:**
  - The theme scope, as described above. Its outline "Keep my account" button was a white block on dark themes.
  - **A shared `Input` fix:** `{label && …}` became a ternary. Delete-account passes `label=""`, which rendered a bare `""` text node in a View. RN-web logged "Unexpected text node", and native can throw on raw strings. The rendered output is identical otherwise.
- **Left alone:** the product chooser (`app/welcome.tsx`, shared, with Ganesh's own orange identity), `SpendlyLogo` (already on tokens) and the card shadow colour (`#000`, intentionally black in both themes).

## Ticket estimate vs. what was there
The ticket counted 114 hardcoded colours. A line-based count found about 75, and all of the Expense-visible ones are gone. What remains:
- the other products' pre-556 values (now in `lib/authLook.ts` and the carousel's legacy branch);
- the slide data;
- one black shadow.

## QA
**Setup:** web, on an isolated emulator (`127.0.0.2`, Expo `:8093`), freshly seeded for each side.

**A/B write check.** The same first-run journey ran on a fresh browser on the epic code (A) and the 556 code (B):
1. The carousel, then Skip.
2. The product chooser, then Expense Tracker.
3. **Sign up** a new user (QA Five).
4. The welcome card, then Start Setup Wizard.
5. Wizard: the profile name, then the currency (INR).
6. Close the wizard, then open delete-account (without confirming).

| Compared | Result |
|---|---|
| Firebase Auth user (name, email, provider) | identical |
| `users/{uid}` document (profile, currency, onboarding state) | identical |
| Seeded categories for the new user (287) | identical |

**Visual:**
- Midnight Emerald 390 and 320, and Light 390 and 320: the carousel, sign-in, sign-up, the welcome card, the wizard and delete-account.
- No horizontal overflow and no page errors.

**Multi-app:** a Nutrition build (`EXPO_PUBLIC_PRODUCT=nutrition`) of the 556 code was compared with the pre-556 sign-in screenshot. They are **pixel-identical** (0 differing pixels). Its carousel keeps the per-slide colours.

**Checks run:**
- `npm test`: 385 files, 5,722 tests passed (4 new in `lib/authLook.test.ts`).
- `npm run typecheck:shared` and `npx tsc -p tsconfig.json --noEmit`: both passed.

## Found, not fixed (they exist on the epic code too)
1. **The setup wizard can't get past step 2 (Currency).** Its reset effect depends on `settings` and `userDoc`. Saving a step changes them, which resets the step to the initial one, and the `+1` then lands on Currency again. Budget, first account and first expense are unreachable. This is a logic bug, out of scope for a UI story.
2. **The onboarding flags revert after a full page reload.** `onboarding.currencyChosen`, `welcomeCompleted`, `setupStartedAt` and `completedSteps` were back to their defaults after reloading. This needs a closer look.
3. `components/onboarding/OnboardingCard.tsx` is not imported anywhere.

**Not done:** native device QA.
