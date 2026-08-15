/**
 * React error boundary for render/lifecycle crashes.
 *
 * The fallback deliberately avoids every app provider (theme, auth, toast):
 * a boundary that renders context it doesn't own will itself throw when the
 * crash originated in that context. It reads only React Native's
 * `useColorScheme`, so it can always paint.
 *
 * Stack traces are shown in development only — a release build gets plain
 * language and a way forward.
 */

import { Component, type ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";

import { logError } from "@/lib/errors";

type Props = {
  children: ReactNode;
  /** Identifies the crash site in logs, e.g. `"screen.dashboard"`. */
  scope?: string;
  /** Copy shown above the retry button. */
  label?: string;
  /** Called after the user taps "Try again", before the subtree remounts. */
  onReset?: () => void;
};

type State = { error: Error | null };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    logError(this.props.scope ?? "react.render", error, {
      componentStack: info.componentStack?.slice(0, 500) ?? undefined,
    });
  }

  reset = () => {
    this.props.onReset?.();
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <ErrorFallback
        error={this.state.error}
        label={this.props.label}
        onReset={this.reset}
      />
    );
  }
}

function ErrorFallback({
  error,
  label,
  onReset,
}: {
  error: Error;
  label?: string;
  onReset: () => void;
}) {
  const scheme = useColorScheme();
  const dark = scheme === "dark";
  const bg = dark ? "#0B0B0F" : "#FFFFFF";
  const fg = dark ? "#F5F5F7" : "#111114";
  const muted = dark ? "#9A9AA3" : "#6B6B76";
  const accent = "#6366F1";

  return (
    <View style={[styles.wrap, { backgroundColor: bg }]}>
      <Text style={[styles.emoji]}>😞</Text>
      <Text style={[styles.title, { color: fg }]}>This screen ran into a problem</Text>
      <Text style={[styles.body, { color: muted }]}>
        {label ??
          "Your data is safe. Try again — if it keeps happening, restart the app."}
      </Text>

      <Pressable
        onPress={onReset}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: accent, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Text style={styles.buttonText}>Try again</Text>
      </Pressable>

      {__DEV__ ? (
        <ScrollView style={styles.devBox} contentContainerStyle={{ padding: 12 }}>
          <Text style={[styles.devText, { color: muted }]}>
            {error.name}: {error.message}
            {error.stack ? `\n\n${error.stack}` : ""}
          </Text>
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 10,
  },
  emoji: { fontSize: 44 },
  title: { fontSize: 19, fontWeight: "800", textAlign: "center" },
  body: { fontSize: 14, textAlign: "center", lineHeight: 21, maxWidth: 320 },
  button: {
    marginTop: 14,
    minHeight: 48,
    paddingHorizontal: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  devBox: {
    marginTop: 20,
    maxHeight: 220,
    alignSelf: "stretch",
    borderRadius: 10,
    backgroundColor: "rgba(127,127,127,0.12)",
  },
  devText: { fontSize: 11, fontFamily: "monospace" },
});

export default AppErrorBoundary;
