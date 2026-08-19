import type { ComponentType } from "react";
import {
  Bell,
  Info,
  Landmark,
  Palette,
  PiggyBank,
  Shield,
  SlidersHorizontal,
  User,
} from "lucide-react-native";

import type { SettingsSectionId } from "@/shared/config/settingsNav";

type SectionIcon = ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

export const SETTINGS_SECTION_ICONS: Record<SettingsSectionId, SectionIcon> = {
  profile: User,
  appearance: Palette,
  preferences: SlidersHorizontal,
  money: PiggyBank,
  accounts: Landmark,
  automation: Bell,
  privacy: Shield,
  about: Info,
};
