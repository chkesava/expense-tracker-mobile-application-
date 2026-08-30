import { Image } from "react-native";

import { GANESH_ACTION_ICONS, type GaneshActionIconName } from "./iconSources";

function ActionIcon({ name, size = 44 }: { name: GaneshActionIconName; size?: number }) {
  return <Image source={GANESH_ACTION_ICONS[name]} style={{ width: size, height: size }} resizeMode="contain" />;
}

export function SevaIcon({ size }: { size?: number }) {
  return <ActionIcon name="seva" size={size} />;
}

export function CollectionIcon({ size }: { size?: number }) {
  return <ActionIcon name="collection" size={size} />;
}

export function ExpenseIcon({ size }: { size?: number }) {
  return <ActionIcon name="expense" size={size} />;
}

export function ContributionIcon({ size }: { size?: number }) {
  return <ActionIcon name="contribution" size={size} />;
}

export function VolunteerIcon({ size }: { size?: number }) {
  return <ActionIcon name="volunteer" size={size} />;
}

export function AssetIcon({ size }: { size?: number }) {
  return <ActionIcon name="asset" size={size} />;
}

export function MemberPaymentIcon({ size }: { size?: number }) {
  return <ActionIcon name="memberPayment" size={size} />;
}

export function OpeningFundIcon({ size }: { size?: number }) {
  return <ActionIcon name="openingFund" size={size} />;
}
