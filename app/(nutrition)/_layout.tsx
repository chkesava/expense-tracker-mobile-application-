import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { PrivacyLock } from "@/components/PrivacyLock";
import { NutritionTabBar } from "@/components/nutrition/NutritionTabBar";
import { useAuth } from "@/providers/AuthProvider";
import { useTheme } from "@/theme/ThemeProvider";

export default function NutritionLayout() {
  const { theme } = useTheme();
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.colors.background,
        }}
      >
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <PrivacyLock>
      <Tabs
        tabBar={(props) => (
          <NutritionTabBar
            state={props.state}
            navigation={props.navigation as never}
          />
        )}
        screenOptions={{
          headerShown: false,
        }}
      >
        <Tabs.Screen name="index" options={{ title: "Home" }} />
        <Tabs.Screen name="analytics" options={{ title: "Analytics" }} />
        <Tabs.Screen name="body" options={{ title: "Body" }} />
        <Tabs.Screen name="profile" options={{ title: "Profile" }} />
        <Tabs.Screen name="meal" options={{ href: null, title: "Meal" }} />
        <Tabs.Screen name="scanner" options={{ href: null, title: "Scanner" }} />
        <Tabs.Screen name="log" options={{ href: null, title: "Log" }} />
      </Tabs>
    </PrivacyLock>
  );
}
