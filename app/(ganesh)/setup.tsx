import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { AdminGlyph } from "@/components/ganesh/admin/adminArt";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FestivalStackHero } from "@/components/ganesh/chrome/FestivalStackHero";
import { ganeshStackLayout } from "@/components/ganesh/chrome/stackLayout";
import { FundLocationChips } from "@/components/ganesh/FundLocationChips";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { PandalAccountBar } from "@/components/ganesh/pandal/PandalAccountBar";
import { PandalSectionCard } from "@/components/ganesh/pandal/PandalSectionCard";
import { useGaneshTokens } from "@/components/ganesh/ui";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { useMyJoinRequests } from "@/hooks/useMyJoinRequests";
import { usePandals } from "@/hooks/usePandals";
import { classifyError, friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { useWorkspace } from "@/providers/WorkspaceProvider";
import type { PermanentFundLocation } from "@/shared/types/ganesh";
import { validateFundTransfer, validateNonNegativeAmount } from "@/shared/utils/ganeshMath";
import { formatPandalCode } from "@/shared/utils/ganeshIdentity";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { useTheme } from "@/theme/ThemeProvider";

export default function GaneshSetupScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { replace } = useRouter();
  const { logout } = useAuth();
  const { setActiveWorkspace } = useWorkspace();
  const { setSession } = useGaneshSession();
  const { pandals } = usePandals();
  const { pending, rejected } = useMyJoinRequests();
  const writes = useGaneshWrites();
  const [mode, setMode] = useState<"choose" | "create" | "join">("choose");
  const [pandalName, setPandalName] = useState("");
  const [area, setArea] = useState("");
  const [festivalName, setFestivalName] = useState(`Ganesh Chaturthi ${new Date().getFullYear()}`);
  const [code, setCode] = useState("");
  const [hasExistingFund, setHasExistingFund] = useState(false);
  const [initialAmount, setInitialAmount] = useState("");
  const [allocateAmount, setAllocateAmount] = useState("0");
  const [fundLocation, setFundLocation] = useState<PermanentFundLocation>("cash");
  const [fundDescription, setFundDescription] = useState("Money saved from previous years");
  const [busy, setBusy] = useState(false);
  const waiting = pending.length > 0 && mode === "choose";

  const create = async () => {
    const initial = hasExistingFund ? Number(initialAmount || 0) : 0;
    const allocate = Number(allocateAmount || 0);
    if (hasExistingFund) {
      const initialOk = validateNonNegativeAmount(initial, "Existing Pandal fund");
      if (!initialOk.ok || initial <= 0) {
        toast.error("Enter the existing Permanent Fund amount, or choose No.");
        return;
      }
    }
    const allocateOk = validateNonNegativeAmount(allocate, "Festival opening from Permanent Fund");
    if (!allocateOk.ok) {
      toast.error(allocateOk.error);
      return;
    }
    if (allocate > 0) {
      const allowed = validateFundTransfer(allocate, initial, "Permanent Fund");
      if (!allowed.ok) {
        toast.error(allowed.error);
        return;
      }
    }
    setBusy(true);
    try {
      const created = await writes.createPandalAndFestival({
        pandalName,
        area,
        festivalName,
        year: new Date().getFullYear(),
        initialFund: initial > 0
          ? { amount: initial, location: fundLocation, description: fundDescription }
          : undefined,
        allocateToFestival: allocate > 0 ? { amount: allocate, location: fundLocation } : undefined,
      });
      await setSession({ pandalId: created.pandalId, festivalId: created.festivalId });
      toast.success(`Pandal code ${formatPandalCode(created.code)}`);
      replace("/(ganesh)" as never);
    } catch (error) {
      logError("ganesh.setup.create", error);
      toast.error(friendlyErrorMessage(error, "Could not create Pandal."));
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    setBusy(true);
    try {
      await writes.requestPandalJoin(code);
      setCode("");
      setMode("choose");
    } catch (error) {
      logError("ganesh.setup.join", error);
      toast.error(
        classifyError(error) === "permission"
          ? "Could not send the request. Check the code and try again, or ask the Pandal admin to add you."
          : friendlyErrorMessage(error, "Could not send the join request.")
      );
    } finally {
      setBusy(false);
    }
  };

  const intro = waiting
    ? "Your request was sent to the Pandal admin. You will see expenses, collections, and the Permanent Fund after they accept you."
    : pandals.length === 0
      ? "You are not a member of the Pandal yet. Request to join or create the Pandal. You will not see expenses, collections, or the Permanent Fund until an admin accepts you."
      : "Open a Pandal you already belong to, or join another with a code.";

  return (
    <GaneshScreen contentContainerStyle={ganeshStackLayout.bleed}>
      <FestivalStackHero
        title={waiting ? "Waiting for approval" : "Ganesh Seva"}
        subtitle={waiting ? "Join request sent" : "Choose or create a Pandal"}
        onBack={() => {
          void setActiveWorkspace("expense");
        }}
        mark={<AdminGlyph name="shield" size={40} />}
      />

      <View style={ganeshStackLayout.body}>
        <View style={[styles.notice, { backgroundColor: theme.colors.card, borderColor: g.divider }]}>
          <Text style={[styles.noticeText, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
            {intro}
          </Text>
        </View>

        {waiting ? (
          <PandalSectionCard title="Pending requests" subtitle={`${pending.length} waiting`}>
            <View style={styles.stack}>
              {pending.map((request) => (
                <View
                  key={request.id}
                  style={[styles.pendingRow, { borderColor: g.divider }]}
                >
                  <Text style={[styles.pendingName, { color: theme.colors.foreground, fontFamily: theme.fontFamily.bold }]}>
                    {request.pandalName || "Pandal"}
                  </Text>
                  <Text style={[styles.pendingMeta, { color: theme.colors.mutedForeground }]}>
                    Request sent. Waiting for an admin to approve you.
                  </Text>
                </View>
              ))}
            </View>
          </PandalSectionCard>
        ) : null}

        {rejected.length > 0 && pandals.length === 0 && !waiting ? (
          <Text style={{ color: theme.colors.mutedForeground, lineHeight: 20 }}>
            A previous join request was rejected. You can request again with the Pandal code.
          </Text>
        ) : null}

        {pandals.length > 0 ? (
          <PandalSectionCard
            title="My Pandals"
            subtitle={pandals.length === 1 ? "1 Pandal" : `${pandals.length} Pandals`}
          >
            <View style={styles.stack}>
              {pandals.map((pandal) => (
                <PandalPickRow
                  key={pandal.id}
                  pandalId={pandal.id}
                  name={pandal.name}
                  code={pandal.code}
                />
              ))}
            </View>
          </PandalSectionCard>
        ) : null}

        {mode === "choose" ? (
          <View style={styles.stack}>
            <Button onPress={() => setMode("join")}>
              {waiting ? "Request another Pandal" : "Request to Join"}
            </Button>
            <Button variant="outline" onPress={() => setMode("create")}>
              Create Pandal
            </Button>
          </View>
        ) : null}

        {mode === "create" ? (
          <PandalSectionCard title="Create Pandal" subtitle="You become the first admin">
            <View style={styles.form}>
              <Input label="Pandal name" value={pandalName} onChangeText={setPandalName} placeholder="Sri Ganesh Youth Committee" />
              <Input label="Area (optional)" value={area} onChangeText={setArea} />
              <Input label="Festival" value={festivalName} onChangeText={setFestivalName} />
              <Text style={[styles.formHeading, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}>
                Do you already have money belonging to the Pandal?
              </Text>
              <View style={styles.choiceRow}>
                <Button variant={hasExistingFund ? "outline" : "primary"} onPress={() => setHasExistingFund(false)}>
                  No
                </Button>
                <Button variant={hasExistingFund ? "primary" : "outline"} onPress={() => setHasExistingFund(true)}>
                  Yes
                </Button>
              </View>
              {hasExistingFund ? (
                <View style={styles.form}>
                  <Input
                    label="Existing Permanent Fund"
                    value={initialAmount}
                    onChangeText={setInitialAmount}
                    keyboardType="numeric"
                  />
                  <Text style={[styles.formHeading, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.semibold }]}>
                    Money location
                  </Text>
                  <FundLocationChips value={fundLocation} onChange={setFundLocation} />
                  <Input
                    label="Source / description"
                    value={fundDescription}
                    onChangeText={setFundDescription}
                    placeholder="Existing Pandal Fund"
                  />
                  <Input
                    label="Use for this first festival (0 keeps it in the Permanent Fund)"
                    value={allocateAmount}
                    onChangeText={setAllocateAmount}
                    keyboardType="numeric"
                  />
                  <Text style={{ color: theme.colors.mutedForeground, lineHeight: 20 }}>
                    This amount is not a {festivalName} donation. Remaining Permanent Fund{" "}
                    {formatInr(Math.max(0, Number(initialAmount || 0) - Number(allocateAmount || 0)))}.
                  </Text>
                </View>
              ) : (
                <Text style={{ color: theme.colors.mutedForeground, lineHeight: 20 }}>
                  You can add the Permanent Fund later from Home or the Pandal tab.
                </Text>
              )}
              <Button loading={busy} onPress={() => void create()}>
                Create Pandal
              </Button>
              <Button variant="ghost" onPress={() => setMode("choose")}>
                Back
              </Button>
            </View>
          </PandalSectionCard>
        ) : null}

        {mode === "join" ? (
          <PandalSectionCard title="Request to join" subtitle="Ask the admin with the Pandal code">
            <View style={styles.form}>
              <Input
                label="Pandal code"
                value={code}
                onChangeText={setCode}
                autoCapitalize="characters"
                placeholder="GNSH-XXXX"
              />
              <Button loading={busy} onPress={() => void join()}>
                Request access
              </Button>
              <Button variant="ghost" onPress={() => setMode("choose")}>
                Back
              </Button>
            </View>
          </PandalSectionCard>
        ) : null}

        <PandalAccountBar
          onSwitchApp={() => {
            void setActiveWorkspace("expense");
          }}
          onLogout={() => {
            void logout();
          }}
        />
      </View>
    </GaneshScreen>
  );
}

function PandalPickRow({
  pandalId,
  name,
  code,
}: {
  pandalId: string;
  name: string;
  code: string;
}) {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { replace } = useRouter();
  const { setSession } = useGaneshSession();
  const { festivals } = useFestivals(pandalId);
  const openFestival = festivals.find((festival) => festival.status === "open") ?? festivals[0];

  return (
    <Pressable
      onPress={() => {
        if (!openFestival) {
          toast.error("This Pandal has no festival yet.");
          return;
        }
        void setSession({ pandalId, festivalId: openFestival.id }).then(() => {
          replace("/(ganesh)" as never);
        });
      }}
      style={({ pressed }) => [
        styles.pick,
        {
          backgroundColor: g.wash(g.saffron),
          borderColor: g.divider,
        },
        pressed ? { opacity: 0.88 } : null,
      ]}
    >
      <Text style={[styles.pickName, { color: theme.colors.foreground, fontFamily: theme.fontFamily.bold }]}>
        {name}
      </Text>
      <Text style={[styles.pickMeta, { color: g.saffron, fontFamily: theme.fontFamily.semibold }]}>
        Code {formatPandalCode(code)}
      </Text>
      {openFestival ? (
        <Text style={[styles.pickMeta, { color: theme.colors.mutedForeground }]}>
          {openFestival.name}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  notice: {
    borderRadius: 16,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  noticeText: {
    fontSize: 14,
    lineHeight: 22,
  },
  stack: {
    gap: 10,
    paddingHorizontal: 2,
    paddingBottom: 6,
  },
  pendingRow: {
    gap: 4,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pendingName: {
    fontSize: 16,
  },
  pendingMeta: {
    fontSize: 13,
    lineHeight: 20,
  },
  form: {
    gap: 12,
    paddingHorizontal: 2,
    paddingBottom: 8,
  },
  formHeading: {
    fontSize: 14,
  },
  choiceRow: {
    flexDirection: "row",
    gap: 8,
  },
  pick: {
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 4,
  },
  pickName: {
    fontSize: 16,
  },
  pickMeta: {
    fontSize: 13,
  },
});
