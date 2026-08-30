import {
  Flame,
  Gift,
  HandCoins,
  Landmark,
  Package,
  Receipt,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react-native";

import { GaneshIconTile } from "@/components/ganesh/ui/GaneshIconTile";
import { useGaneshTokens } from "@/components/ganesh/ui/tokens";

export type GaneshActionIconProps = {
  size?: number;
  /** Skip the squircle when the parent already draws a niche (NavRow). */
  framed?: boolean;
  tint?: string;
};

function ActionIcon({
  Icon,
  size = 44,
  framed = true,
  tint,
}: GaneshActionIconProps & { Icon: LucideIcon }) {
  const g = useGaneshTokens();
  const color = tint ?? g.saffron;
  const glyph = <Icon size={Math.round(size * 0.5)} color={color} strokeWidth={2} />;
  if (!framed) return glyph;
  return (
    <GaneshIconTile size={size} tint={tint}>
      {glyph}
    </GaneshIconTile>
  );
}

export function SevaIcon(props: GaneshActionIconProps) {
  return <ActionIcon Icon={Flame} {...props} />;
}

export function CollectionIcon(props: GaneshActionIconProps) {
  return <ActionIcon Icon={HandCoins} {...props} />;
}

export function ExpenseIcon(props: GaneshActionIconProps) {
  return <ActionIcon Icon={Receipt} {...props} />;
}

export function ContributionIcon(props: GaneshActionIconProps) {
  return <ActionIcon Icon={Gift} {...props} />;
}

export function VolunteerIcon(props: GaneshActionIconProps) {
  return <ActionIcon Icon={Users} {...props} />;
}

export function AssetIcon(props: GaneshActionIconProps) {
  return <ActionIcon Icon={Package} {...props} />;
}

export function MemberPaymentIcon(props: GaneshActionIconProps) {
  return <ActionIcon Icon={Wallet} {...props} />;
}

export function OpeningFundIcon(props: GaneshActionIconProps) {
  return <ActionIcon Icon={Landmark} {...props} />;
}
