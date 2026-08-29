import {
  Brush,
  CalendarDays,
  Flame,
  HandPlatter,
  Music,
  ShieldCheck,
  Sparkles,
  Sprout,
  Trash2,
  Users,
  Waves,
  type LucideIcon,
} from "lucide-react-native";

import type { SevaKind } from "@/shared/types/ganesh";

/**
 * One icon per kind of seva.
 *
 * Deliberately lucide, not emoji: emoji render differently on every Android
 * skin, do not respect colour, and read as decoration rather than interface.
 * The whole app uses one icon family — see the rule in `AGENTS.md`.
 */
const SEVA_ICONS: Record<SevaKind, LucideIcon> = {
  aarti: Flame,
  annadanam: HandPlatter,
  prasadam: Sprout,
  bhajan: Music,
  cultural: Sparkles,
  decoration: Brush,
  cleaning: Trash2,
  security: ShieldCheck,
  procession: Users,
  visarjan: Waves,
  other: CalendarDays,
};

const SEVA_LABELS: Record<SevaKind, string> = {
  aarti: "Aarti",
  annadanam: "Annadanam",
  prasadam: "Prasadam",
  bhajan: "Bhajan",
  cultural: "Cultural programme",
  decoration: "Decoration",
  cleaning: "Cleaning",
  security: "Security",
  procession: "Procession",
  visarjan: "Visarjan",
  other: "Other seva",
};

/** The icon component for a seva kind. */
export function sevaIcon(kind: SevaKind): LucideIcon {
  return SEVA_ICONS[kind] ?? CalendarDays;
}

/** Human label for a seva kind — used in chips, filters and detail headers. */
export function sevaKindLabel(kind: SevaKind): string {
  return SEVA_LABELS[kind] ?? "Seva";
}

/** Every kind, in the order a committee would scan them. */
export const SEVA_KINDS: SevaKind[] = [
  "aarti",
  "annadanam",
  "prasadam",
  "bhajan",
  "cultural",
  "decoration",
  "cleaning",
  "security",
  "procession",
  "visarjan",
  "other",
];

/** Renders the icon for a seva kind. */
export function SevaGlyph({
  kind,
  size = 16,
  color,
  strokeWidth = 2.2,
}: {
  kind: SevaKind;
  size?: number;
  color: string;
  strokeWidth?: number;
}) {
  const Icon = sevaIcon(kind);
  return <Icon size={size} color={color} strokeWidth={strokeWidth} />;
}
