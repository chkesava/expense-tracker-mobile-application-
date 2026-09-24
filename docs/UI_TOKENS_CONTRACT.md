# Canonical UI Tokens & Component Contract (SPENDLY-149)

This document defines the contract for migrating Spendly's custom React Native styling over to **Gluestack UI (v2) + NativeWind v4**.

## 1. Design Tokens Mapping

### 1.1 Typography
We will retain `@expo-google-fonts/inter`.
The NativeWind `tailwind.config.js` will map the fonts to `font-sans`:
```js
theme: {
  fontFamily: {
    sans: ['Inter', 'sans-serif'],
  },
}
```

### 1.2 Color Roles
Spendly's current `theme/tokens.ts` (light, dark, and custom themes like "cyberpunk") will be mapped to Tailwind CSS variables using the `nativewind` config.

**Base Mapping:**
*   `background` -> `bg-background`
*   `foreground` -> `text-foreground`
*   `card` -> `bg-card`
*   `primary` -> `bg-primary`, `text-primary`
*   `secondary` -> `bg-secondary`
*   `muted` -> `bg-muted`
*   `destructive` -> `bg-destructive`
*   `success` -> `bg-success`
*   `warning` -> `bg-warning`
*   `border` -> `border-border`
*   `scrim` -> `bg-black/70`

**Accent Colors (Indigo, Emerald, etc.):**
Spendly dynamically updates accent colors. We will update the CSS variables on the root `<View>` dynamically to allow Gluestack components to react instantly.

### 1.3 Space, Radius, and Borders
We will stick to standard Tailwind spacing (0, 1, 2, 4, 8) which aligns with Gluestack defaults.
*   `radius.sm` -> `rounded-sm`
*   `radius.md` -> `rounded-md`
*   `radius.lg` -> `rounded-lg`
*   `radius.xl` -> `rounded-xl`
*   `radius.full` -> `rounded-full` (capsule shapes)

### 1.4 Glassmorphism & Elevation (The Premium UI)
*   **Shadows:** `shadow-sm`, `shadow-md`, `shadow-lg` for standard elevation.
*   **Glass Surface:** We will define a custom utility class `glass-surface` in `global.css` that provides `bg-background/70 backdrop-blur-md border border-white/10`.
*   **Android Fallback:** Since Android backdrop blur is expensive, `glass-surface` will fallback to an opaque or high-opacity color `bg-background/95` on Android using platform-specific tailwind modifiers or React Native Platform checks.

---

## 2. Component Replacement Contract

This matrix dictates how existing primitives are replaced.

| Component | Current Implementation | Target Gluestack UI Component | Retention Criteria |
| :--- | :--- | :--- | :--- |
| **Button** | `components/ui/Button.tsx`, `<Pressable>` | `Button`, `ButtonText`, `ButtonIcon` | Replace immediately. |
| **Input** | `components/ui/Input.tsx`, `<TextInput>` | `Input`, `InputField`, `InputSlot` | Replace immediately. |
| **Card** | Dozens of `*Card.tsx` files | `Card` (Gluestack standard card) | Convert complex cards gradually. |
| **Dialog / Modal** | `components/common/Modal.tsx` | `AlertDialog` or `Modal` (Gluestack) | Keep `common/Modal` until all 70+ usages are migrated. |
| **Sheet** | `ActionMenuSheet.tsx` | `Actionsheet` (Gluestack) | Replace `ActionMenuSheet` immediately. |
| **Tabs / Segmented** | Custom implementations | `Tabs` (via `@gluestack-ui/tabs` or raw implementation) | Replace screen-level tabs first. |
| **Menu / Select** | Custom dropdowns | `Menu` or `Select` (Gluestack) | Replace where used. |
| **Switch** | Custom | `Switch` (Gluestack) | Replace immediately. |
| **Checkbox** | Custom | `Checkbox` (Gluestack) | Replace immediately. |
| **Badge / Chip** | Custom chips | `Badge` (Gluestack) | Replace immediately. |
| **Skeleton** | `components/common/Skeleton.tsx` | `Skeleton` (Gluestack) | Keep `common/Skeleton` until fully swapped. |
| **Toast** | Custom | `Toast` (Gluestack) | Replace immediately. |

---

## 3. Interaction & Accessibility Rules
*   **Haptics**: `expo-haptics` remains canonical for button presses and success actions.
*   **Motion**: We will continue using `react-native-reanimated` for custom page transitions and complex gestures, as Gluestack integrates with it perfectly.
*   **Touch Targets**: All interactive elements (Buttons, Icons) must maintain a minimum `48x48` bounding box for accessibility. This will be enforced via Gluestack padding tokens (`p-3` or `p-4`).
