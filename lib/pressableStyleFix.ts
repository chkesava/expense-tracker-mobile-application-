/**
 * Restores React Native's function-form `Pressable` styles under NativeWind.
 *
 * SPENDLY-154 (found on-device): since SPENDLY-150 turned on NativeWind's
 * JSX transform (`jsxImportSource: "nativewind"`), every `<Pressable>` is
 * swapped for react-native-css-interop's wrapper. That wrapper merges its
 * className styles with the caller's `style`, and a `style={({ pressed }) =>
 * [...]}` callback does not survive the merge. The component then renders with
 * no styles at all. About 230 call sites across every product use that form
 * (tab bars, list rows, chips, setup-checklist rows...).
 *
 * Fix: re-point css-interop's registry entry for Pressable at a thin shim.
 *  - no `className`: render React Native's own Pressable directly, so style
 *    callbacks work exactly as designed;
 *  - with `className` (Gluestack's Button, Modal backdrop, ...): delegate to
 *    the original interop wrapper, unchanged.
 *
 * This deep-imports css-interop 0.2.x internals (pinned by package-lock).
 * If an upgrade moves them, the guard below turns this into a no-op and the
 * original behaviour returns, so check tab bars on device after any
 * nativewind / react-native-css-interop upgrade.
 *
 * Must be imported before the first render (app/_layout.tsx does it first).
 * It only patches the registry's `set`; nothing is loaded eagerly.
 */
import { createElement, forwardRef, type ComponentType } from "react";
import { Platform, Pressable } from "react-native";

const SHIM_FLAG = "__spendlyFunctionStyleShim";

type InteropRegistry = Map<unknown, ComponentType<Record<string, unknown>>>;

function wrap(interopPressable: ComponentType<Record<string, unknown>>) {
  const Shim = forwardRef<unknown, Record<string, unknown>>((props, ref) =>
    props.className == null
      ? // `cssInterop: false` is css-interop's own opt-out. NativeWind's babel
        // plugin rewrites createElement too, so without it this would resolve
        // straight back to the shim and render forever.
        createElement(Pressable, { ...props, ref, cssInterop: false } as never)
      : createElement(interopPressable, { ...props, ref })
  );
  Shim.displayName = "CssInterop.Pressable";
  (Shim as unknown as Record<string, unknown>)[SHIM_FLAG] = true;
  return Shim as unknown as ComponentType<Record<string, unknown>>;
}

function installPressableStyleFix(): void {
  // Web renders className through real CSS and is unaffected.
  if (Platform.OS === "web") return;

  let registry: InteropRegistry | undefined;
  try {
    registry = require("react-native-css-interop/dist/runtime/native/api")
      .interopComponents as InteropRegistry;
  } catch {
    return;
  }
  if (!registry || typeof registry.set !== "function") return;

  // css-interop registers its stock components lazily, on the first JSX call.
  // Loading that module eagerly here pulls in every lazy react-native export
  // before startup and hangs the app, so intercept the registration instead:
  // whenever Pressable is registered, store the shim around it.
  const originalSet = registry.set.bind(registry);
  registry.set = (key, value) => {
    if (key === Pressable && value && !(value as unknown as Record<string, unknown>)[SHIM_FLAG]) {
      return originalSet(key, wrap(value));
    }
    return originalSet(key, value);
  };

  const existing = registry.get(Pressable);
  if (existing) registry.set(Pressable, existing);
}

installPressableStyleFix();
