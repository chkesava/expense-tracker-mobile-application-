import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/theme/ThemeProvider";

export type ToastKind = "success" | "error" | "info" | "warning" | "message";

type ToastItem = {
  id: string;
  kind: ToastKind;
  message: string;
  duration: number;
};

type ToastApi = {
  show: (message: string, kind?: ToastKind, durationMs?: number) => void;
  success: (message: string, durationMs?: number) => void;
  error: (message: string, durationMs?: number) => void;
  info: (message: string, durationMs?: number) => void;
  warning: (message: string, durationMs?: number) => void;
  dismiss: (id?: string) => void;
};

const ToastContext = createContext<ToastApi | undefined>(undefined);

let externalApi: ToastApi | null = null;

/** Imperative toast API (mirrors web `lib/toast.ts` surface for Phase 1). */
export const toast: ToastApi = {
  show: (message, kind = "message", durationMs) =>
    externalApi?.show(message, kind, durationMs),
  success: (message, durationMs) => externalApi?.success(message, durationMs),
  error: (message, durationMs) => externalApi?.error(message, durationMs),
  info: (message, durationMs) => externalApi?.info(message, durationMs),
  warning: (message, durationMs) => externalApi?.warning(message, durationMs),
  dismiss: (id) => externalApi?.dismiss(id),
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id?: string) => {
    if (!id) {
      timers.current.forEach(clearTimeout);
      timers.current.clear();
      setItems([]);
      return;
    }
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const show = useCallback(
    (message: string, kind: ToastKind = "message", durationMs = 3200) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setItems((prev) => [...prev.slice(-3), { id, kind, message, duration: durationMs }]);
      const timer = setTimeout(() => dismiss(id), durationMs);
      timers.current.set(id, timer);
    },
    [dismiss]
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (m, d) => show(m, "success", d),
      error: (m, d) => show(m, "error", d),
      info: (m, d) => show(m, "info", d),
      warning: (m, d) => show(m, "warning", d),
      dismiss,
    }),
    [show, dismiss]
  );

  externalApi = api;

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport items={items} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

function ToastViewport({
  items,
  onDismiss,
}: {
  items: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  const kindColor = (kind: ToastKind) => {
    switch (kind) {
      case "success":
        return theme.colors.success;
      case "error":
        return theme.colors.destructive;
      case "warning":
        return theme.colors.warning;
      case "info":
        return theme.colors.primary;
      default:
        return theme.colors.foreground;
    }
  };

  return (
    <View
      pointerEvents="box-none"
      style={[styles.viewport, { bottom: Math.max(insets.bottom, 16) + 8 }]}
    >
      {items.map((item) => (
        <Pressable
          key={item.id}
          onPress={() => onDismiss(item.id)}
          accessibilityRole="alert"
          style={[
            styles.toast,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
              borderLeftColor: kindColor(item.kind),
            },
          ]}
        >
          <Text
            style={{
              color: theme.colors.cardForeground,
              fontSize: theme.typography.sm,
              fontWeight: "600",
            }}
          >
            {item.message}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 9999,
    gap: 8,
  },
  toast: {
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
});
