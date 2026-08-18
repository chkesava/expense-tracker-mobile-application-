import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { Button } from "@/components/ui/Button";
import type { LegalSection } from "@/legal/privacyNotice";
import { useTheme } from "@/theme/ThemeProvider";

type LegalWebPageProps = {
  title: string;
  version: string;
  intro: string;
  sections: LegalSection[];
  extra?: string;
};

export function LegalWebPage({ title, version, intro, sections, extra }: LegalWebPageProps) {
  const { theme } = useTheme();
  const { back, canGoBack } = useRouter();

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.background }]} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 16, paddingBottom: 48 }}>
        {canGoBack() ? (
          <Button variant="ghost" onPress={() => back()}>
            Back
          </Button>
        ) : null}
        <Text
          style={{
            color: theme.colors.foreground,
            fontFamily: theme.fontFamily.bold,
            fontSize: 24,
          }}
        >
          {title}
        </Text>
        <Text style={{ color: theme.colors.mutedForeground, fontSize: 13 }}>Version {version}</Text>
        <Text style={{ color: theme.colors.foreground, fontSize: 15, lineHeight: 22 }}>{intro}</Text>
        {sections.map((section) => (
          <View key={section.heading} style={{ gap: 8 }}>
            <Text
              style={{
                color: theme.colors.foreground,
                fontFamily: theme.fontFamily.semibold,
                fontSize: 17,
              }}
            >
              {section.heading}
            </Text>
            <Text style={{ color: theme.colors.mutedForeground, fontSize: 15, lineHeight: 22 }}>
              {section.body}
            </Text>
          </View>
        ))}
        {extra ? (
          <Text style={{ color: theme.colors.mutedForeground, fontSize: 15, lineHeight: 22 }}>
            {extra}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
