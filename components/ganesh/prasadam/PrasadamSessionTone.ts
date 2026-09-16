import { Sunrise, Sunset } from "lucide-react-native";

import { useGaneshTokens } from "@/components/ganesh/ui/tokens";
import type { PrasadamSession } from "@/shared/types/ganeshPrasadam";
import {
  prasadamSessionLabel,
  prasadamSessionWindowLabel,
} from "@/shared/utils/ganeshPrasadam";

/**
 * The one place morning and evening are told apart.
 *
 * Nothing else in this feature hardcodes a session colour or icon, so the two
 * sessions can never drift into looking alike in one place and different in
 * another.
 *
 * Sunrise vermilion and dusk maroon read as one festival rather than as a
 * category chart, and both are first-class colours in the Ganesh palette.
 * Maroon is safe here specifically because this screen contains no money at
 * all — no `Money`, no `fundColor`, no amounts — so it cannot be misread as
 * the Permanent Fund identity it carries in the financial vocabulary.
 *
 * Colour is never the only signal (§35): each session also carries its own
 * icon, its own word, and its own window label.
 */
export function useSessionTone(session: PrasadamSession) {
  const g = useGaneshTokens();
  const accent = session === "morning" ? g.saffron : g.maroon;
  return {
    accent,
    wash: g.wash(accent),
    Icon: session === "morning" ? Sunrise : Sunset,
    label: prasadamSessionLabel(session),
    window: prasadamSessionWindowLabel(session),
  };
}
