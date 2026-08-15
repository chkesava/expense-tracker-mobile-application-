import React from 'react';
import { Redirect, Tabs } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { Activity, User, PlusCircle, ArrowLeft } from 'lucide-react-native';
import {
  ActivityIndicator,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/providers/AuthProvider';
import { useWorkspace } from '@/providers/WorkspaceProvider';

function CustomTabBar({ state, descriptors, navigation }: any) {
  const { theme } = useTheme();
  const router = useRouter();
  const { setActiveWorkspace } = useWorkspace();

  const styles = StyleSheet.create({
    container: {
      flexDirection: 'row',
      backgroundColor: theme.colors.card,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      paddingBottom: theme.space.md,
      paddingTop: theme.space.sm,
      height: 80,
    },
    tabItem: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    label: {
      fontSize: theme.typography.xs,
      marginTop: 4,
    }
  });

  return (
    <View style={styles.container}>
      {state.routes.map((route: any, index: number) => {
        const { options } = descriptors[route.key];
        const isFocused = state.index === index;
        const color = isFocused ? theme.colors.primary : theme.colors.tabIconDefault;

        // Hide scanner and log from tabs, we only want Dashboard and Profile in main tabs
        if (route.name === 'scanner' || route.name === 'log') {
          return null;
        }

        const label =
          options.tabBarLabel !== undefined
            ? options.tabBarLabel
            : options.title !== undefined
            ? options.title
            : route.name;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        const getIcon = () => {
          if (route.name === 'index') return <Activity color={color} size={24} />;
          if (route.name === 'profile') return <User color={color} size={24} />;
          return null;
        };

        return (
          <TouchableOpacity
            key={route.key}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            testID={options.tabBarTestID}
            onPress={onPress}
            style={styles.tabItem}
          >
            {getIcon()}
            <Text style={[styles.label, { color }]}>{label === 'index' ? 'Dashboard' : 'Profile'}</Text>
          </TouchableOpacity>
        );
      })}

      <TouchableOpacity
        style={styles.tabItem}
        onPress={() => router.push('/(nutrition)/log')}
      >
        <PlusCircle color={theme.colors.tabIconDefault} size={24} />
        <Text style={[styles.label, { color: theme.colors.tabIconDefault }]}>Add</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.tabItem}
        // Switching the workspace is what actually leaves nutrition. Replacing
        // to "/" only bounced off the launch router, which reads the persisted
        // workspace and sent the user straight back here.
        onPress={() => {
          void setActiveWorkspace('expense');
        }}
      >
        <ArrowLeft color={theme.colors.tabIconDefault} size={24} />
        <Text style={[styles.label, { color: theme.colors.tabIconDefault }]}>Exit</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function NutritionLayout() {
  const { theme } = useTheme();
  const { user, loading } = useAuth();

  // The nutrition workspace is reachable directly (deep link, restored
  // workspace) and used to render its whole shell with no session at all.
  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
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
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.card },
        headerTintColor: theme.colors.foreground,
        headerTitleStyle: { color: theme.colors.foreground },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Nutrition',
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'My Profile',
        }}
      />
      <Tabs.Screen
        name="scanner"
        options={{
          title: 'Scanner',
          href: null,
        }}
      />
      <Tabs.Screen
        name="log"
        options={{
          title: 'Log Food',
          href: null,
        }}
      />
    </Tabs>
  );
}
