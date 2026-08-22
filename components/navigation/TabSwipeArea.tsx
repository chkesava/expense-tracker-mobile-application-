import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Keyboard, Platform, useWindowDimensions } from "react-native";
import {
  Gesture,
  GestureDetector,
  type GestureType,
} from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { usePathname, useRouter } from "expo-router";

import { TabSwipeGestureProvider } from "@/components/navigation/TabSwipeContext";
import { useInvestmentsEnabled } from "@/hooks/useInvestmentsEnabled";
import { haptic } from "@/lib/haptics";
import { useModals } from "@/providers/ModalProvider";
import {
  CORE_NAV_ITEMS,
  resolvePrimaryTabId,
  type NavigationItem,
} from "@/shared/config/navigation";
import { durations, easing } from "@/theme/motion";

/** Minimum horizontal travel before a release counts as a tab swipe. */
const COMMIT_DISTANCE = 64;
/** A fast flick commits earlier, but still needs some travel. */
const COMMIT_VELOCITY = 600;
const FLICK_MIN_DISTANCE = 24;
/** Horizontal travel before the shell gesture activates at all. */
const ACTIVATION_OFFSET_X = 20;
/** Vertical travel that makes the shell gesture fail, leaving scrolling alone. */
const FAIL_OFFSET_Y = 14;
/** Drag follows the finger at this ratio; a blocked edge feels stiffer. */
const DRAG_RATIO = 0.32;
const EDGE_DRAG_RATIO = 0.07;
/** Outgoing screen keeps sliding briefly after release, then the new one enters. */
const EXIT_DURATION = 120;

function isSwipeEnabled(): boolean {
  return Platform.OS === "ios" || Platform.OS === "android";
}

/**
 * Horizontal swipe navigation across the primary bottom-nav tabs.
 *
 * A single shell-level pan gesture translates the current route into the
 * matching tab, mirroring what tapping the bottom nav does — the bottom nav
 * remains the primary, fully accessible control. The gesture only activates on
 * clearly horizontal movement and fails on vertical movement, so lists keep
 * scrolling normally; horizontally scrollable children opt out through
 * `HorizontalSwipeBoundary`.
 */
export function TabSwipeArea({ children }: { children: ReactNode }) {
  const { navigate, dismissTo } = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const investmentsEnabled = useInvestmentsEnabled();
  const modals = useModals();

  const gestureRef = useRef<GestureType | undefined>(undefined);
  /** +1 while a swipe to the next tab is in flight, -1 for the previous tab. */
  const pendingDirection = useRef(0);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  const translateX = useSharedValue(0);
  const tabIndex = useSharedValue(-1);
  const tabCount = useSharedValue(0);
  const settled = useSharedValue(true);

  const tabs = useMemo<NavigationItem[]>(
    () =>
      CORE_NAV_ITEMS.filter(
        (item) =>
          item.includeInBottomNav &&
          (!item.requiresInvestmentsFeature || investmentsEnabled)
      ),
    [investmentsEnabled]
  );

  const activeTabId = resolvePrimaryTabId(pathname);
  const activeIndex = activeTabId
    ? tabs.findIndex((item) => item.id === activeTabId)
    : -1;

  // A modal, sheet, drawer or the keyboard owns the screen — leave it alone.
  const overlayOpen =
    modals.isAddExpenseOpen ||
    modals.isMagicChatOpen ||
    modals.isReceiptScannerOpen ||
    modals.isMonthDrawerOpen ||
    modals.isSetupWizardOpen ||
    modals.editingExpense !== null ||
    modals.editingIncome !== null ||
    modals.accountEntryAccount !== null;

  const enabled =
    isSwipeEnabled() && activeIndex >= 0 && !overlayOpen && !keyboardOpen;

  useEffect(() => {
    tabIndex.set(activeIndex);
    tabCount.set(tabs.length);
  }, [activeIndex, tabs.length, tabIndex, tabCount]);

  // Never leave a route parked mid-slide when swiping gets disabled.
  useEffect(() => {
    if (!enabled) {
      pendingDirection.current = 0;
      translateX.set(0);
    }
  }, [enabled, translateX]);

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, () => setKeyboardOpen(true));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const goToTab = useCallback(
    (index: number, direction: number) => {
      const target = tabs[index];
      if (!target) return;
      pendingDirection.current = direction;
      void haptic.navigation();
      const route = target.path.startsWith("/") ? target.path : `/${target.path}`;
      // Same navigation semantics as a bottom-nav tap, so screen state and
      // cached queries survive the switch.
      if (route === "/dashboard") {
        dismissTo("/dashboard");
      } else {
        navigate(route as never);
      }
    },
    [tabs, navigate, dismissTo]
  );

  const maxDrag = width * 0.12;
  const exitOffset = width * 0.16;
  const enterOffset = width * 0.28;

  // The incoming route slides in from the side the swipe came from, so the
  // handoff reads as one continuous movement rather than a cross-fade.
  useEffect(() => {
    const direction = pendingDirection.current;
    if (direction === 0) return;
    pendingDirection.current = 0;
    translateX.set(direction > 0 ? enterOffset : -enterOffset);
    translateX.set(
      withTiming(0, { duration: durations.medium, easing: easing.standard })
    );
  }, [pathname, enterOffset, translateX]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .withRef(gestureRef)
        .enabled(enabled)
        .minPointers(1)
        .maxPointers(1)
        .activeOffsetX([-ACTIVATION_OFFSET_X, ACTIVATION_OFFSET_X])
        .failOffsetY([-FAIL_OFFSET_Y, FAIL_OFFSET_Y])
        .onBegin(() => {
          settled.set(false);
        })
        .onUpdate((event) => {
          if (Math.abs(event.translationX) <= Math.abs(event.translationY)) {
            return;
          }
          const next = event.translationX < 0 ? 1 : -1;
          const target = tabIndex.get() + next;
          const canGo = target >= 0 && target < tabCount.get();
          const offset =
            event.translationX * (canGo ? DRAG_RATIO : EDGE_DRAG_RATIO);
          translateX.set(Math.max(-maxDrag, Math.min(maxDrag, offset)));
        })
        .onEnd((event) => {
          settled.set(true);
          const dx = event.translationX;
          const horizontal = Math.abs(dx) > Math.abs(event.translationY);
          const committed =
            Math.abs(dx) >= COMMIT_DISTANCE ||
            (Math.abs(event.velocityX) >= COMMIT_VELOCITY &&
              Math.abs(dx) >= FLICK_MIN_DISTANCE);
          const target = tabIndex.get() + (dx < 0 ? 1 : -1);

          if (
            horizontal &&
            committed &&
            target >= 0 &&
            target < tabCount.get()
          ) {
            // Carry the outgoing screen off in the direction of travel; the
            // route change then slides the incoming one in behind it.
            translateX.set(
              withTiming(dx < 0 ? -exitOffset : exitOffset, {
                duration: EXIT_DURATION,
                easing: easing.standard,
              })
            );
            runOnJS(goToTab)(target, dx < 0 ? 1 : -1);
            return;
          }

          translateX.set(
            withTiming(0, {
              duration: durations.medium,
              easing: easing.standard,
            })
          );
        })
        .onFinalize(() => {
          if (settled.get()) return;
          settled.set(true);
          translateX.set(
            withTiming(0, {
              duration: durations.medium,
              easing: easing.standard,
            })
          );
        }),
    [enabled, maxDrag, exitOffset, goToTab, settled, tabCount, tabIndex, translateX]
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.get() }],
  }));

  return (
    <TabSwipeGestureProvider gestureRef={gestureRef}>
      <GestureDetector gesture={pan}>
        <Animated.View style={[{ flex: 1 }, animatedStyle]}>
          {children}
        </Animated.View>
      </GestureDetector>
    </TabSwipeGestureProvider>
  );
}

export default TabSwipeArea;
