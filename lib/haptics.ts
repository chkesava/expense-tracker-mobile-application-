import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

let isHapticsEnabled = true;

/**
 * Unified Haptic Feedback Engine
 * Respects user preferences and platform capabilities.
 */
export const haptic = {
  /**
   * Set global haptic feedback enabled state (synced with user settings)
   */
  setEnabled(enabled: boolean): void {
    isHapticsEnabled = enabled;
  },

  /**
   * Check if haptics are currently enabled
   */
  isEnabled(): boolean {
    return isHapticsEnabled;
  },

  /**
   * Tactile feedback for save actions (saving expenses, accounts, budgets, settings)
   */
  async save(): Promise<void> {
    if (!isHapticsEnabled || Platform.OS === "web") return;
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      // Ignore unsupported devices
    }
  },

  /**
   * Distinctive destructive tactile feedback for delete actions
   */
  async delete(): Promise<void> {
    if (!isHapticsEnabled || Platform.OS === "web") return;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch {
      // Ignore unsupported devices
    }
  },

  /**
   * Notification feedback for successful operations
   */
  async success(): Promise<void> {
    if (!isHapticsEnabled || Platform.OS === "web") return;
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      // Ignore unsupported devices
    }
  },

  /**
   * Notification feedback for error states and validation rejections
   */
  async error(): Promise<void> {
    if (!isHapticsEnabled || Platform.OS === "web") return;
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } catch {
      // Ignore unsupported devices
    }
  },

  /**
   * Light tactile feedback for navigation (tab switch, drawer navigation, route change)
   */
  async navigation(): Promise<void> {
    if (!isHapticsEnabled || Platform.OS === "web") return;
    try {
      await Haptics.selectionAsync();
    } catch {
      // Ignore unsupported devices
    }
  },

  /**
   * Light selection tick for chips, dropdown items, segmented pickers
   */
  async selection(): Promise<void> {
    if (!isHapticsEnabled || Platform.OS === "web") return;
    try {
      await Haptics.selectionAsync();
    } catch {
      // Ignore unsupported devices
    }
  },

  /**
   * Light impact — row taps, card presses, incremental controls.
   * Exists so callers never need to import `expo-haptics` (and therefore never
   * bypass the user's `hapticFeedback` preference) just to name a style.
   */
  async light(): Promise<void> {
    if (!isHapticsEnabled || Platform.OS === "web") return;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Ignore unsupported devices
    }
  },

  /**
   * Medium impact — confirmations, sheet open/close, mode switches
   */
  async medium(): Promise<void> {
    if (!isHapticsEnabled || Platform.OS === "web") return;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      // Ignore unsupported devices
    }
  },

  /**
   * Warning notification — non-blocking validation and cautionary states
   */
  async warning(): Promise<void> {
    if (!isHapticsEnabled || Platform.OS === "web") return;
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch {
      // Ignore unsupported devices
    }
  },

  /**
   * Custom impact feedback
   */
  async impact(
    style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Medium
  ): Promise<void> {
    if (!isHapticsEnabled || Platform.OS === "web") return;
    try {
      await Haptics.impactAsync(style);
    } catch {
      // Ignore unsupported devices
    }
  },

  /**
   * Custom notification feedback
   */
  async notification(
    type: Haptics.NotificationFeedbackType = Haptics.NotificationFeedbackType.Success
  ): Promise<void> {
    if (!isHapticsEnabled || Platform.OS === "web") return;
    try {
      await Haptics.notificationAsync(type);
    } catch {
      // Ignore unsupported devices
    }
  },
};

export default haptic;
