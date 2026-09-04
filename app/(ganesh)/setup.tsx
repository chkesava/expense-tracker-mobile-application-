import { useEffect, useRef, useState } from "react";
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
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { useMyJoinRequests } from "@/hooks/useMyJoinRequests";
import { usePandals } from "@/hooks/usePandals";
import { classifyError, friendlyErrorMessage, logError } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { useWorkspace } from "@/providers/WorkspaceProvider";
import { pickFestivalIdForPandal } from "@/services/ganesh/ganeshOpenSession";
import type { PermanentFundLocation } from "@/shared/types/ganesh";
import { ganeshSetupCopy, resolveGaneshSetupFocus } from "@/shared/utils/ganeshSetupState";
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
  const { pandals, inactiveMemberships } = usePandals();
  // An archived Pandal stays reachable but is listed apart, so a committee
  // running several festivals is not picking their live Pandal out of a list of
  // retired ones (GS-017).
  const activePandals = pandals.filter((pandal) => pandal.archived !== true);
  const archivedPandals = pandals.filter((pandal) => pandal.archived === true);
  const { pending, rejected } = useMyJoinRequests();
  const writes = useGaneshWrites();
  const [mode, setMode] = useState<"choose" | "create" | "join">("choose");
  const [pandalName, setPandalName] = useState("");
  const [area, setArea] = useState("");
  const [description, setDescription] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [festivalName, setFestivalName] = useState(`Ganesh Chaturthi ${new Date().getFullYear()}`);
  const [code, setCode] = useState("");
  const [hasExistingFund, setHasExistingFund] = useState(false);
  const [initialAmount, setInitialAmount] = useState("");
  const [allocateAmount, setAllocateAmount] = useState("0");
  const [fundLocation, setFundLocation] = useState<PermanentFundLocation>("cash");
  const [fundDescription, setFundDescription] = useState("Money saved from previous years");
  const [busy, setBusy] = useState(false);
  const pendingIdsRef = useRef(new Set<string>());
  const openedFromApproval = useRef(false);

  const focus = resolveGaneshSetupFocus({
    activeCount: activePandals.length,
    pendingCount: pending.length,
    rejectedCount: rejected.length,
    removedCount: inactiveMemberships.length,
    mode,
  });
  const copy = ganeshSetupCopy(focus);
  const waiting = focus === "pending";

  const openPandal = async (pandalId: string) => {
    const db = getFirestoreDb();
    if (!db) return;
    const festivalId = await pickFestivalIdForPandal(db, pandalId);
    if (!festivalId) {
      toast.error("This Pandal has no festival yet.");
      return;
    }
    await setSession({ pandalId, festivalId });
    replace("/(ganesh)/(tabs)");
  };

  useEffect(() => {
    for (const request of pending) {
      if (request.pandalId) pendingIdsRef.current.add(request.pandalId);
    }
  }, [pending]);

  useEffect(() => {
    if (openedFromApproval.current || mode !== "choose") return;
    const newlyActive = pandals.filter((pandal) => pendingIdsRef.current.has(pandal.id));
    if (newlyActive.length === 0) return;
    const target = newlyActive[0];
    pendingIdsRef.current.delete(target.id);
    toast.success(`You're in ${target.name}.`);
    if (activePandals.length === 1) {
      openedFromApproval.current = true;
      void openPandal(target.id).catch((error) => {
        openedFromApproval.current = false;
        logError("ganesh.setup.autoOpen", error);
      });
    }
  }, [pandals, activePandals.length, mode]);

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
        description,
        contactPhone,
        festivalName,
        year: new Date().getFullYear(),
        initialFund: initial > 0
          ? { amount: initial, location: fundLocation, description: fundDescription }
          : undefined,
        allocateToFestival: allocate > 0 ? { amount: allocate, location: fundLocation } : undefined,
      });
      await setSession({ pandalId: created.pandalId, festivalId: created.festivalId });
      toast.success(`Pandal code ${formatPandalCode(created.code)}`);
      replace("/(ganesh)/(tabs)");
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
      const result = await writes.requestPandalJoin(code);
      setCode("");
      setMode("choose");
      if (result.joined) {
        await openPandal(result.pandalId);
      }
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

  const removedName = inactiveMemberships.find((item) => item.pandalName)?.pandalName;
  const rejectedName = rejected.find((item) => item.pandalName)?.pandalName;

  return (
    <GaneshScreen contentContainerStyle={ganeshStackLayout.bleed}>
      <FestivalStackHero
        title={copy.title}
        subtitle={copy.subtitle}
        onBack={() => {
          void setActiveWorkspace("expense");
        }}
        mark={<AdminGlyph name="shield" size={40} />}
      />

      <View style={ganeshStackLayout.body}>
        <View style={[styles.notice, { backgroundColor: theme.colors.card, borderColor: g.divider }]}>
          <Text style={[styles.noticeText, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
            {copy.intro}
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
                    Waiting for Admin approval.
                  </Text>
                </View>
              ))}
            </View>
          </PandalSectionCard>
        ) : null}

        {focus === "rejected" ? (
          <Text style={{ color: theme.colors.mutedForeground, lineHeight: 20 }}>
            {rejectedName
              ? `Your request to join ${rejectedName} was not approved.`
              : "Your request was not approved."}
          </Text>
        ) : null}

        {focus === "removed" ? (
          <Text style={{ color: theme.colors.mutedForeground, lineHeight: 20 }}>
            {removedName
              ? `You no longer have access to ${removedName}.`
              : "You no longer have access to this Pandal."}
          </Text>
        ) : null}

        {activePandals.length > 0 ? (
          <PandalSectionCard
            title="My Pandals"
            subtitle={activePandals.length === 1 ? "1 Pandal" : `${activePandals.length} Pandals`}
          >
            <View style={styles.stack}>
              {activePandals.map((pandal) => (
                <PandalPickRow
                  key={pandal.id}
                  pandalId={pandal.id}
                  name={pandal.name}
                  code={pandal.code}
                  onOpen={openPandal}
                />
              ))}
            </View>
          </PandalSectionCard>
        ) : null}

        {/* Listed separately rather than hidden: an archived Pandal is still
            the committee's own money history, and someone has to be able to
            open it to read that or to restore it (GS-017). */}
        {archivedPandals.length > 0 ? (
          <PandalSectionCard
            title="Archived"
            subtitle="Readable, but nothing new can be added"
          >
            <View style={styles.stack}>
              {archivedPandals.map((pandal) => (
                <PandalPickRow
                  key={pandal.id}
                  pandalId={pandal.id}
                  name={pandal.name}
                  code={pandal.code}
                  onOpen={openPandal}
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
              <Input label="Description (optional)" value={description} onChangeText={setDescription} />
              <Input
                label="Contact (optional)"
                value={contactPhone}
                onChangeText={setContactPhone}
                keyboardType="phone-pad"
              />
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
  onOpen,
}: {
  pandalId: string;
  name: string;
  code: string;
  onOpen: (pandalId: string) => Promise<void>;
}) {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const [busy, setBusy] = useState(false);

  const open = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onOpen(pandalId);
    } catch (error) {
      logError("ganesh.setup.openPandal", error);
      toast.error(friendlyErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable
      disabled={busy}
      onPress={() => {
        void open();
      }}
      style={({ pressed }) => [
        styles.pick,
        {
          backgroundColor: g.wash(g.saffron),
          borderColor: g.divider,
          opacity: busy ? 0.7 : 1,
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
