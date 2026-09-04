import { useCallback, useEffect } from "react";
import { Alert } from "react-native";
import { useNavigation } from "expo-router";

/**
 * Confirm before abandoning a part-filled form (GS-101).
 *
 * `add-expense` is roughly twenty fields and `add-sponsor` is not far behind.
 * Leaving either mid-entry discarded everything silently, and on a phone an
 * accidental back gesture is easy — there was no `BackHandler` or
 * unsaved-changes prompt anywhere in the feature.
 *
 * Covers both ways out, which is the point of doing this in a hook rather than
 * per screen:
 *
 * - The header's own back button, through `confirmLeave`.
 * - The Android hardware back button and the iOS swipe gesture, through
 *   navigation's `beforeRemove` event — which the header button cannot
 *   intercept and which is the more likely accident of the two.
 *
 * The listener is only registered while `dirty` is true, so a pristine form is
 * left alone entirely: no prompt, no interception, nothing to get in the way of
 * someone who opened the screen by mistake.
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  const navigation = useNavigation();

  const prompt = useCallback((proceed: () => void) => {
    Alert.alert(
      "Discard this entry?",
      "You have filled part of this form. Leaving now loses what you entered.",
      [
        { text: "Keep editing", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: proceed },
      ]
    );
  }, []);

  useEffect(() => {
    if (!dirty) return;
    // `beforeRemove` fires for the gesture and the hardware button. Typed
    // loosely because expo-router's navigation object does not narrow to the
    // stack event map here.
    const unsubscribe = (navigation as unknown as {
      addListener: (
        event: "beforeRemove",
        handler: (event: { preventDefault: () => void; data: { action: unknown } }) => void
      ) => () => void;
    }).addListener?.("beforeRemove", (event) => {
      event.preventDefault();
      prompt(() =>
        (navigation as unknown as { dispatch: (action: unknown) => void }).dispatch(
          event.data.action
        )
      );
    });
    return unsubscribe;
  }, [dirty, navigation, prompt]);

  /**
   * Wrap a deliberate exit (the header back button). Runs `proceed` straight
   * away on a pristine form.
   */
  const confirmLeave = useCallback(
    (proceed: () => void) => {
      if (!dirty) {
        proceed();
        return;
      }
      prompt(proceed);
    },
    [dirty, prompt]
  );

  return { confirmLeave };
}
