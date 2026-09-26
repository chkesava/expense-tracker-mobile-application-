import React, { useEffect, useState, type ReactNode } from "react";
import { Keyboard, Platform, useWindowDimensions } from "react-native";
import { X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  Modal as GluestackModal,
  ModalBackdrop,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody
} from "@/components/ui/modal";
import { Text } from "react-native";
import { sheetBodyPadding } from "./sheetDensity";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Cap sheet height. Number = px; string like "88%" = fraction of window. */
  maxHeight?: number | string;
  /**
   * SPENDLY-173: `compact` for dense forms (Add Transaction). By default the
   * sheet stacks Gluestack's ModalContent `p-6` and ModalBody `mt-2 mb-6` on
   * top of its own 20dp body padding, 44dp from the screen edge to the
   * content. Compact clears the Gluestack layers and uses the standard 16dp
   * gutter. The default is unchanged for every other sheet (Ganesh included).
   */
  density?: "default" | "compact";
}


function resolveMaxHeight(maxHeight: number | string, windowHeight: number): number {
  if (typeof maxHeight === "number" && Number.isFinite(maxHeight)) {
    return maxHeight;
  }
  if (typeof maxHeight === "string") {
    const trimmed = maxHeight.trim();
    if (trimmed.endsWith("%")) {
      const pct = Number.parseFloat(trimmed.slice(0, -1));
      if (Number.isFinite(pct) && pct > 0) {
        return (windowHeight * pct) / 100;
      }
    }
    const asNumber = Number.parseFloat(trimmed);
    if (Number.isFinite(asNumber) && asNumber > 0) {
      return asNumber;
    }
  }
  return windowHeight * 0.88;
}

/**
 * Height of the on-screen keyboard, 0 when hidden. Android is edge-to-edge, so
 * the keyboard overlays the modal window instead of resizing it; the sheet has
 * to lift itself. iOS gets the will* events so the sheet moves with it.
 */
function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  maxHeight = "88%",
  density = "default",
}: ModalProps) {
  const compact = density === "compact";
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const keyboardHeight = useKeyboardHeight();
  // Never taller than the space between the status bar and the keyboard.
  const sheetMaxHeight = Math.min(
    resolveMaxHeight(maxHeight, windowHeight),
    windowHeight - keyboardHeight - insets.top - 8,
  );

  return (
    <GluestackModal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      className="justify-end m-0 p-0 w-full"
      // A real RN Modal window, as on main: it stays above the capsule nav
      // (Android elevation beats portal order) and keeps the caller's context.
      useRNModal
    >
      <ModalBackdrop />
      <ModalContent
        className={`w-full bg-card rounded-t-3xl rounded-b-none border-t border-border overflow-hidden m-0 pb-0${compact ? " p-0" : ""}`}
        style={{
          maxHeight: sheetMaxHeight,
          // The keyboard already covers the nav bar inset while it is up.
          paddingBottom: keyboardHeight > 0 ? 12 : Math.max(insets.bottom, 20),
          marginBottom: keyboardHeight,
        }}
      >
        {title && (
          <ModalHeader
            className={`${compact ? "px-4" : "px-5"} py-3 border-b border-border items-center flex-row justify-between`}
          >
            <Text className="text-lg font-bold text-foreground flex-1 tracking-tight" numberOfLines={1}>
              {title}
            </Text>
            <ModalCloseButton>
              <X size={18} className="text-muted-foreground" />
            </ModalCloseButton>
          </ModalHeader>
        )}
        {/*
          ModalBody is itself a ScrollView (disabled by default in ui/modal).
          It must be the only scroller, and flexShrink is required: without it
          the body grows with its children, ModalContent's maxHeight clips the
          overflow, and the submit buttons on long forms (Add Transaction,
          Borrowing) become unreachable. SPENDLY-171.
        */}
        <ModalBody
          className={compact ? "p-0 m-0" : "p-0"}
          scrollEnabled
          style={{ flexGrow: 0, flexShrink: 1 }}
          contentContainerStyle={sheetBodyPadding(density)}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          bounces
          nestedScrollEnabled
        >
          {children}
        </ModalBody>
      </ModalContent>
    </GluestackModal>
  );
}

export default Modal;
