import { View } from "react-native";

import {
  AccountsManager,
  AccountTypesManager,
} from "@/components/settings/SettingsSubmenus";

export function AccountsSection() {
  return (
    <View style={{ gap: 16 }}>
      <AccountTypesManager />
      <AccountsManager />
    </View>
  );
}
