# Premium Android UI/UX Redesign Prompt Pack

## Purpose

Use these prompts to transform a migrated React Native application from
a web-like experience into a polished Android application comparable to
Google Pay, PhonePe, CRED, Groww, or Zerodha Kite.

------------------------------------------------------------------------

# Prompt 1 --- Global Mobile UI Redesign

``` text
You are a Senior Android UX Engineer, Senior React Native Architect, and Material Design 3 Expert.

Our React Native app is currently a direct migration of our React web application.

Although all functionality works, many screens still look like a responsive website instead of a premium Android application.

Your task is NOT to preserve the web layout.

Your task is to redesign every screen for Android-first UX while preserving all business logic.

Follow these principles:

DO NOT:
- Copy desktop layouts.
- Place too many cards on one screen.
- Use web tables.
- Use desktop sidebars.
- Use desktop dialogs.
- Use hover interactions.
- Use tiny touch targets.
- Create web-like forms.

Instead:

Design every screen like a native Android application.

Follow Material Design 3.

Each screen should feel comparable to:
- Google Pay
- PhonePe
- CRED
- Groww
- Zerodha Kite

Requirements:
- Native spacing
- Native typography
- Native touch targets
- Native ripple effects
- Native navigation
- Bottom sheets instead of dialogs
- Floating Action Buttons
- Swipe gestures
- Pull to refresh
- Sticky headers
- Native loading skeletons
- Native empty states
- Native error states
- Native search experience

Business logic must remain unchanged.
Only redesign UI and UX.
```

------------------------------------------------------------------------

# Prompt 2 --- Component Audit

``` text
Audit the entire mobile application.

Find every UI element that still looks like a web application.

Examples include:
- Desktop cards
- Desktop spacing
- Large horizontal layouts
- Multi-column grids
- Tables
- Desktop modals
- Hover assumptions
- Tiny buttons
- Tiny icons
- Desktop typography
- Web navigation
- Desktop forms
- Desktop filters

For every issue:
1. Explain why it feels like a website.
2. Explain how Android apps solve it.
3. Replace it with a premium Android solution.

Do this for every screen.
```

------------------------------------------------------------------------

# Prompt 3 --- Android Navigation

``` text
Redesign navigation for Android.

Requirements:
- Bottom Navigation
- Dashboard
- Transactions
- Analytics
- Nutrition
- Settings

Rules:
- Use Expo Router.
- Use native transitions.
- Maintain Android back behavior.
- No web routing patterns.
- Support deep linking.
- Support state restoration.
- Follow Material Design 3 navigation guidance.
```

------------------------------------------------------------------------

# Prompt 4 --- Premium Motion & Animations

``` text
Make the application feel premium.

Use:
- React Native Reanimated
- Gesture Handler
- Moti

Implement:
- Screen transitions
- Shared element transitions
- Card animations
- FAB animations
- Button press animations
- Swipe actions
- Bottom sheet transitions
- Skeleton loading
- Animated counters
- Progress animations
- Chart animations

Use Android motion guidelines.
Animation duration: 200–300ms.
Target 60 FPS.
Avoid flashy animations.
```

------------------------------------------------------------------------

# Prompt 5 --- Android Forms

``` text
Redesign every form.

Requirements:
- Material Text Fields
- Floating labels
- Validation animations
- Numeric keypad
- Date picker
- Bottom sheet pickers
- Category chips
- Account selector
- Large touch targets
- Primary action fixed at bottom
- Keyboard avoidance
- Native scrolling

No desktop forms.
```

------------------------------------------------------------------------

# Prompt 6 --- Launch Experience

``` text
Design a premium application launch experience.

Sequence:
1. Android Splash Screen with centered logo.
2. Animated logo:
   - Scale
   - Fade
   - Small bounce
   - Duration: ~800ms
3. Load:
   - Firebase Auth
   - Theme
   - Settings
   - Cached data
4. If authenticated → Dashboard.
5. Otherwise → Authentication.
6. On first launch → Onboarding carousel.

Requirements:
- Never show blank white screens.
- Never flash layouts.
- Use skeletons while loading.

Reference quality:
- Google Pay
- PhonePe
- CRED
- Spotify
- Instagram
```

------------------------------------------------------------------------

# Prompt 7 --- Premium Design System

``` text
Create a complete Android Design System.

Include:
- Typography
- Spacing
- Elevation
- Corner Radius
- Buttons
- Cards
- Dialogs
- Bottom Sheets
- Snackbars
- FAB
- Icons
- Charts
- Lists
- Empty States
- Loading States
- Error States
- Success States
- Animation Tokens
- Dark Mode
- Light Mode
- Color Tokens

Use:
- Material Design 3
- Inter font
- 8-point spacing system
- Large touch targets
- 12–20dp corner radius
- Consistent elevation

Generate reusable components only.
```

------------------------------------------------------------------------

# Prompt 8 --- Final Polish Pass

``` text
Perform a complete UX polish pass.

Assume this application will compete with:
- Google Pay
- PhonePe
- Groww
- CRED

Find everything that feels:
- Cheap
- Unfinished
- Web-like
- Desktop-inspired
- Generic

Replace it with premium Android UX.

Improve:
- Spacing
- Padding
- Animations
- Icons
- Typography
- Button hierarchy
- Navigation
- Micro-interactions
- Loading states
- Empty states
- Error states
- Success states
- Gesture interactions

Deliver a polished Android experience while preserving all functionality and backend integration.
```

------------------------------------------------------------------------

# Recommended Implementation Order

1.  Dashboard
2.  Add Expense
3.  Ledger
4.  Analytics
5.  Accounts
6.  Nutrition
7.  Settings

Complete one screen at a time instead of redesigning the entire
application in a single pass.
