import { Keyboard, Platform } from "react-native";

/**
 * Tap-outside-to-hide-the-keyboard for forms (SPENDLY-661).
 *
 * Forms wrap their content in `<TouchableWithoutFeedback onPress={…}>` so a
 * tap outside a field hides the phone keyboard. On web that wrapper also
 * receives the click *inside* an <input>, and react-native-web's
 * `Keyboard.dismiss()` blurs the focused field: the field loses focus as soon
 * as it gets it and nothing can be typed. So the handler is native-only.
 */
export const dismissKeyboardOnNative: (() => void) | undefined = Platform.OS === "web" ? undefined : Keyboard.dismiss;

/** True where the tap-to-dismiss wrapper should be inert (web). */
export const keyboardDismissDisabled = Platform.OS === "web";
