# UI Library Evaluation: Gluestack UI vs React Native Paper (SPENDLY-148)

## Overview
As part of Epic **SPENDLY-122**, we need to select a canonical UI library to replace the fragmented, custom-built UI primitives currently in use. The target stack is Expo SDK 57 and React Native 0.86.2. 

The primary candidates are **Gluestack UI** (v2) and **React Native Paper** (v5+).

## Current Stack Context
*   **React Native / Expo**: RN 0.86.2 / Expo 57
*   **Styling**: `StyleSheet` is heavily used. `nativewind` (v4.2.6) and `tailwindcss` are installed but **unused** in production components.
*   **Icons**: `lucide-react-native`
*   **Animation/Gestures**: `react-native-reanimated` and `react-native-gesture-handler` are heavily utilized.
*   **Design Goal**: A premium, custom financial UI with floating capsule navigation, glassmorphism, and translucent surfaces. NOT standard Material Design.

---

## 1. React Native Paper

React Native Paper is the industry standard for Material Design in React Native.

**Pros:**
*   **Stability**: Extremely mature, battle-tested, and fully compatible with React Native 0.86.2.
*   **Accessibility**: Best-in-class out-of-the-box accessibility support (ARIA roles, screen reader support, touch targets).
*   **Components**: Offers a massive library of ready-to-use components including Sheets, Dialogs, Menus, and inputs.
*   **No Native Impact**: Pure JS/React implementation; adds zero native build requirements.

**Cons:**
*   **Design Rigidity**: It is strictly tied to Material Design (MD3). Achieving a "premium custom glassmorphic" iOS-leaning UI requires heavily fighting the framework and overriding internal styles.
*   **Styling System**: Relies on a rigid JS object theme provider. It doesn't integrate natively with Tailwind/NativeWind without wrappers.
*   **Bundle Size**: Large base bundle, though tree-shaking mitigates this.

---

## 2. Gluestack UI (v2)

Gluestack UI is the spiritual successor to NativeBase, built specifically around universal design and NativeWind v4.

**Pros:**
*   **Design Flexibility**: It uses an "unstyled" headless architecture under the hood, allowing complete control over the visual identity. Perfect for custom premium UI, glassmorphism, and custom capsule navigation.
*   **NativeWind Integration**: Built natively on NativeWind v4 (which is already installed in `package.json`). This allows using utility classes for styling while keeping performance high.
*   **Interoperability**: Plays exceptionally well with `react-native-reanimated` (which it uses internally for some components).
*   **Accessibility**: Headless components (via `@gluestack-ui/react-native-aria`) handle complex accessibility state.

**Cons:**
*   **Learning Curve**: The team is used to `StyleSheet`. Migrating to Gluestack requires adopting the `className` utility-first approach (NativeWind).
*   **Setup Overhead**: Requires setting up `gluestack-ui.config.ts` and configuring the babel/metro plugins for NativeWind v4 correctly in Expo 57.

---

## 3. The "Premium Glassmorphism" Requirement

The Epic mandates a transition to a premium visual direction featuring:
*   Floating capsule navigation containers
*   Translucent/glass surfaces with blur
*   Soft glow and subtle borders

**React Native Paper** fails this requirement fundamentally. Its components (like BottomNavigation, Cards, and AppBars) assume opaque Material surfaces with standard MD3 elevation shadows. Implementing a `BlurView` backdrop requires ejecting from the standard component API.

**Gluestack UI** supports this inherently because components are composed of standard Views that can be swapped or customized with utility classes. We can easily define a `glass` variant in the theme configuration that utilizes `expo-blur` or absolute positioned transparent backgrounds.

---

## Recommendation: Proceed with Gluestack UI

**Gluestack UI** is the clear winner for Spendly. 
1.  It supports the required custom premium visual identity.
2.  It utilizes NativeWind v4, which is already in our dependency graph but underutilized.
3.  It integrates well with our heavy usage of Reanimated and Lucide icons.
4.  It prevents Spendly from looking like a generic Android Material app.

### Next Steps for SPENDLY-144 (Integration)
*   Install `@gluestack-ui/themed` (or v2 equivalent via `@gluestack-ui/nativewind-utils`).
*   Verify Metro configuration for NativeWind v4 in Expo 57.
*   Create the Spendly token configuration mapped to Gluestack.
*   Keep `react-native-reanimated` as the primary engine for complex glass effects where static blur isn't enough.
