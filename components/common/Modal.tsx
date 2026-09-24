import React, { type ReactNode } from "react";
import { Dimensions, Platform, ScrollView } from "react-native";
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

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Cap sheet height. Number = px; string like "88%" = fraction of window. */
  maxHeight?: number | string;
}

function resolveMaxHeight(maxHeight: number | string): number {
  const windowHeight = Dimensions.get("window").height;
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

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  maxHeight = "88%",
}: ModalProps) {
  const insets = useSafeAreaInsets();
  const sheetMaxHeight = resolveMaxHeight(maxHeight);

  return (
    <GluestackModal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      className="justify-end m-0 p-0 w-full"
    >
      <ModalBackdrop />
      <ModalContent
        className="w-full bg-card rounded-t-3xl rounded-b-none border-t border-border overflow-hidden m-0 pb-0"
        style={{
          maxHeight: sheetMaxHeight,
          paddingBottom: Math.max(insets.bottom, 20),
        }}
      >
        {title && (
          <ModalHeader className="px-5 py-3 border-b border-border items-center flex-row justify-between">
            <Text className="text-lg font-bold text-foreground flex-1 tracking-tight" numberOfLines={1}>
              {title}
            </Text>
            <ModalCloseButton>
              <X size={18} className="text-muted-foreground" />
            </ModalCloseButton>
          </ModalHeader>
        )}
        <ModalBody className="p-0">
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
            bounces
            nestedScrollEnabled
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 }}
          >
            {children}
          </ScrollView>
        </ModalBody>
      </ModalContent>
    </GluestackModal>
  );
}

export default Modal;
