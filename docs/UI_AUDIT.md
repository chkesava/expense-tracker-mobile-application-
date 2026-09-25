# UI Audit Report (SPENDLY-147)

## 1. Components Mapping
### `components/ui/*`
*   `AddFab.tsx`
*   `Button.tsx`
*   `Card.tsx`
*   `DashboardSkeleton.tsx`
*   `Input.tsx`

### `components/common/*`
*   `ActionMenuSheet.tsx`
*   `Amount.tsx`
*   `AnimatedCounter.tsx`
*   `AnimatedSuccessCheckmark.tsx`
*   `AppErrorBoundary.tsx`
*   `CelebrationOverlay.tsx`
*   `ConfettiCannon.tsx`
*   `DayOfMonthSelect.tsx`
*   `Dialog.tsx`
*   `EmptyState.tsx`
*   `EmptyStateIllustration.tsx`
*   `ErrorState.tsx`
*   `LazyMount.tsx`
*   `LiabilityAmount.tsx`
*   `ListItem.tsx`
*   `LoadingState.tsx`
*   `Modal.tsx`
*   `MonthYearSelect.tsx`
*   `OfflineBanner.tsx`
*   `SearchBar.tsx`
*   `Skeleton.tsx`
*   `SplashAnimationOverlay.tsx`
*   `SuccessState.tsx`
*   `SwipeableRow.tsx`
*   `WebWidthConstraint.tsx`

## 2. Direct React Native Controls Usage
Instead of using canonical `components/ui/*` wrappers, the following raw primitives are heavily used directly across the app:
*   **`<Pressable>`**: ~233 files use this directly instead of `Button` or a generic interactive surface.
*   **`<TouchableOpacity>`**: 4 files use this.
*   **`<TextInput>`**: ~27 files use this directly instead of `Input.tsx` (e.g., in `AccountActivityFilterModal.tsx`, `CreateSplitModal.tsx`, etc.).
*   **`<Modal>`**: Raw `Modal` from `react-native` is used directly in ~10 files instead of `components/common/Modal.tsx` (e.g., `UpdateAvailableSheet.tsx`, `SipPlanFormModal.tsx`).

## 3. NativeWind Usage
*   **Inventory:** NativeWind is installed (`nativewind`, `tailwindcss`) but essentially **unused** for component styling. 
*   **Configuration:** There are no `className` props found across `app/` and `components/`. It only appears as a reference in `useColorScheme.web.ts`.

## 4. UI Library Inventory
*   **`lucide-react-native`**: Heavily utilized (296 files). Must be retained as the primary icon set.
*   **`react-native-reanimated`**: Used in 48 files for custom animations and transitions. Must be preserved.
*   **`react-native-gesture-handler`**: Present in `package.json` (`~2.32.0`) and used for swipeable rows. Must be preserved.
*   **`@shopify/flash-list`**: Used in 35 files for performant lists. Must be preserved.
*   **`@gorhom/bottom-sheet`**: Installed (`^5.2.14`) in `package.json` but **completely unused** in the actual codebase (0 imports). Currently, developers use `Modal` for bottom sheets (e.g., `ActionMenuSheet.tsx`). 

## 5. Duplicated Implementations
*   **Modals/Dialogs:** Extreme duplication. There are over **70+ distinct screen-level Modal components** (e.g., `CreateTripModal.tsx`, `EditSplitModal.tsx`, `VaultDetailModal.tsx`) built on top of `components/common/Modal.tsx`. 
*   **Buttons:** `AccountEditButton`, `SocialLoginButton`, and `Button`. Plus hundreds of inline `<Pressable>` elements styling text as buttons.
*   **Cards:** Distinct card implementations live in feature folders (e.g., `VaultCard`, `SpaceCard`, `InvestmentCard`, `HoldingCard`, `ReceivableCard`, `SplitPayQrCard`) instead of using variants of `components/ui/Card.tsx`.
*   **Tabs/Segments:** Feature folders have their own tabs (e.g., `LedgerSectionTabs`, `AlertsTab`, `OrdersTab`) without a shared primitive.

## 6. Native Android UI Modules (Do Not Affect)
The following native integrations must be untouched during the UI layer migration:
*   `@react-native-google-signin/google-signin`
*   `expo-local-authentication`
*   `expo-haptics`
*   `expo-camera`
*   `react-native-safe-area-context`
*   `react-native-screens`
*   `@react-native-async-storage/async-storage`

## 7. Migration Matrix & Risk List

| UI Component | Current State | Target (Library to decide) | Risk Level |
| :--- | :--- | :--- | :--- |
| **Button** | `components/ui/Button` + 233 `<Pressable>` | Canonical Library Button | Low - High volume but simple refactor |
| **Input** | `components/ui/Input` + 27 `<TextInput>` | Canonical Library Input | Medium - Form state/validation must not break |
| **Card** | Dozens of custom `*Card.tsx` files | Canonical Library Card | Medium - Layout regressions in complex feature cards |
| **Dialog/Modal**| `components/common/Modal`, `Dialog` + 70 custom modals | Canonical Library Modal/Dialog or robust Gorhom Bottom Sheet | High - Z-index, keyboard handling, and navigation issues on Android |
| **Tabs** | Custom tab components per feature | Canonical Library Tabs | Low |
| **Bottom Nav** | Custom Expo Router Tabs | **Premium Capsule / Glass** | High - Requires safe-area and gesture-nav compatibility |

### Top Risks for Migration
1.  **Forms & Keyboard:** Replacing `TextInput` and `Modal` primitives could cause regressions with `KeyboardAvoidingView` on Android.
2.  **Performance:** Adopting glassmorphism/blur (for the premium navigation) can severely degrade Android scroll performance if not implemented correctly with fallback opacity.
3.  **Bottom Sheet Chaos:** Since `@gorhom/bottom-sheet` is unused despite being installed, the current custom modal-based sheets will require careful refactoring to native-feeling bottom sheets.
