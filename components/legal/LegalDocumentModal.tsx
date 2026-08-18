import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { X } from "lucide-react-native";

import { Button } from "@/components/ui/Button";
import type { LegalSection } from "@/legal/privacyNotice";
import { useTheme } from "@/theme/ThemeProvider";

type LegalDocumentModalProps = {
  visible: boolean;
  title: string;
  version: string;
  intro: string;
  sections: LegalSection[];
  onClose: () => void;
};

export function LegalDocumentModal({
  visible,
  title,
  version,
  intro,
  sections,
  onClose,
}: LegalDocumentModalProps) {
  const { theme } = useTheme();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView
        style={[styles.root, { backgroundColor: theme.colors.background }]}
        edges={["top", "bottom"]}
      >
        <View
          style={[
            styles.header,
            { borderBottomColor: theme.colors.border, paddingHorizontal: theme.space.lg },
          ]}
        >
          <Text
            style={{
              flex: 1,
              color: theme.colors.foreground,
              fontFamily: theme.fontFamily.bold,
              fontSize: 18,
            }}
            numberOfLines={2}
          >
            {title}
          </Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={[styles.close, { backgroundColor: theme.colors.muted }]}
          >
            <X size={18} color={theme.colors.foreground} />
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={{
            padding: theme.space.lg,
            gap: theme.space.lg,
            paddingBottom: 48,
          }}
        >
          <Text style={{ color: theme.colors.mutedForeground, fontSize: 13 }}>
            Version {version}
          </Text>
          <Text
            style={{
              color: theme.colors.foreground,
              fontSize: 15,
              lineHeight: 22,
            }}
          >
            {intro}
          </Text>
          {sections.map((section) => (
            <View key={section.heading} style={{ gap: 8 }}>
              <Text
                style={{
                  color: theme.colors.foreground,
                  fontFamily: theme.fontFamily.semibold,
                  fontSize: 16,
                }}
              >
                {section.heading}
              </Text>
              <Text
                style={{
                  color: theme.colors.mutedForeground,
                  fontSize: 15,
                  lineHeight: 22,
                }}
              >
                {section.body}
              </Text>
            </View>
          ))}
          <Button variant="outline" onPress={onClose}>
            Close
          </Button>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  close: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
});
