import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Clock, Landmark, Ticket } from "lucide-react-native";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import {
  FilterChips,
  GaneshMark,
  MetaLabel,
  Money,
  NavRow,
  Section,
  StatTile,
  StatusStrip,
  useGaneshTokens,
} from "@/components/ganesh/ui";
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
import { useTheme } from "@/theme/ThemeProvider";

const LOCATION_OPTIONS: Array<{ id: PermanentFundLocation; label: string }> = [
  { id: "cash", label: "Cash" },
  { id: "upi", label: "UPI" },
  { id: "bank", label: "Bank" },
  { id: "other", label: "Other" },
];

const HAS_FUND_OPTIONS = [
  { id: "no" as const, label: "No, start fresh" },
  { id: "yes" as const, label: "Yes, we have money" },
];

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
  const [festivalName, setFestivalName] = useState(
    `Ganesh Chaturthi ${new Date().getFullYear()}`
  );
  const [code, setCode] = useState("");
  const [hasExistingFund, setHasExistingFund] = useState(false);
  const [initialAmount, setInitialAmount] = useState("");
  const [allocateAmount, setAllocateAmount] = useState("0");
  const [fundLocation, setFundLocation] = useState<PermanentFundLocation>("cash");
  const [fundDescription, setFundDescription] = useState("Money saved from previous years");
  const [busy, setBusy] = useState(false);

  const waiting = pending.length > 0 && mode === "choose";
  const initial = Number(initialAmount || 0);
  const allocate = Number(allocateAmount || 0);
  const remainingPermanent = Math.max(0, initial - allocate);

  const create = async () => {
    const initialValue = hasExistingFund ? initial : 0;
    if (hasExistingFund) {
      const initialOk = validateNonNegativeAmount(initialValue, "Existing Pandal fund");
      if (!initialOk.ok || initialValue <= 0) {
        toast.error("Enter the existing Permanent Fund amount, or choose No.");
        return;
      }
    }
    const allocateOk = validateNonNegativeAmount(
      allocate,
      "Festival opening from Permanent Fund"
    );
    if (!allocateOk.ok) {
      toast.error(allocateOk.error);
      return;
    }
    if (allocate > 0) {
      const allowed = validateFundTransfer(allocate, initialValue, "Permanent Fund");
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
        initialFund:
          initialValue > 0
            ? { amount: initialValue, location: fundLocation, description: fundDescription }
            : undefined,
        allocateToFestival:
          allocate > 0 ? { amount: allocate, location: fundLocation } : undefined,
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

  return (
    <GaneshScreen safeTop>
      {/* The mark appears here and on login only — nowhere else in the app. */}
      <View style={styles.hero}>
        <GaneshMark size={64} />
        <Text
          style={[
            styles.title,
            { color: theme.colors.foreground, fontFamily: theme.fontFamily.bold },
          ]}
        >
          {waiting ? "Waiting for approval" : "Ganesh Seva"}
        </Text>
        <Text
          style={[
            styles.subtitle,
            { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular },
          ]}
        >
          {waiting
            ? "Your request went to the Pandal admin. Collections, expenses and the Permanent Fund appear once they accept you."
            : pandals.length === 0
              ? "Join the Pandal you belong to, or create one. You will not see any money until an admin accepts you."
              : "Open a Pandal you belong to, or join another with a code."}
        </Text>
      </View>

      {waiting ? (
        <Section title="Pending requests">
          {pending.map((request, index) => (
            <View
              key={request.id}
              style={[
                styles.pendingRow,
                index < pending.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: g.divider,
                },
              ]}
            >
              <View style={[styles.pendingGlyph, { backgroundColor: g.wash(theme.colors.warning) }]}>
                <Clock size={16} color={theme.colors.warning} strokeWidth={2.2} />
              </View>
              <View style={styles.pendingCopy}>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.pendingName,
                    { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium },
                  ]}
                >
                  {request.pandalName || "Pandal"}
                </Text>
                <MetaLabel>Waiting for an admin to approve you</MetaLabel>
              </View>
            </View>
          ))}
        </Section>
      ) : null}

      {rejected.length > 0 && pandals.length === 0 && !waiting ? (
        <StatusStrip
          tone="muted"
          message="A previous join request was rejected. You can request again with the Pandal code."
        />
      ) : null}

      {pandals.length > 0 ? (
        <Section title="My Pandals" subtitle="Tap one to open it on this phone">
          {pandals.map((pandal, index) => (
            <PandalPickRow
              key={pandal.id}
              pandalId={pandal.id}
              name={pandal.name}
              code={pandal.code}
              divider={index < pandals.length - 1}
            />
          ))}
        </Section>
      ) : null}

      {mode === "choose" ? (
        <View style={styles.form}>
          <Button onPress={() => setMode("join")}>
            {waiting ? "Request another Pandal" : "Request to join"}
          </Button>
          <Button variant="outline" onPress={() => setMode("create")}>
            Create a Pandal
          </Button>
        </View>
      ) : null}

      {mode === "create" ? (
        <>
          <Section title="The Pandal">
            <View style={styles.form}>
              <Input
                label="Pandal name"
                value={pandalName}
                onChangeText={setPandalName}
                placeholder="Sri Ganesh Youth Committee"
                autoCapitalize="words"
              />
              <Input label="Area (optional)" value={area} onChangeText={setArea} />
              <Input label="First festival" value={festivalName} onChangeText={setFestivalName} />
            </View>
          </Section>

          <Section
            title="Existing Pandal money"
            subtitle="Money the Pandal already holds becomes the Permanent Fund. It carries across festivals."
          >
            <View style={styles.form}>
              <FilterChips
                value={hasExistingFund ? "yes" : "no"}
                options={HAS_FUND_OPTIONS}
                onChange={(next) => setHasExistingFund(next === "yes")}
              />

              {!hasExistingFund ? (
                <StatusStrip
                  tone="muted"
                  message="You can add the Permanent Fund later from Home or the Pandal tab."
                />
              ) : (
                <>
                  <View style={styles.statRow}>
                    <StatTile label="Into the festival">
                      <Money
                        value={Number.isFinite(allocate) ? allocate : 0}
                        size="primary"
                        numberOfLines={1}
                        adjustsFontSizeToFit
                      />
                    </StatTile>
                    <StatTile label="Stays permanent">
                      <Money
                        value={remainingPermanent}
                        size="primary"
                        numberOfLines={1}
                        adjustsFontSizeToFit
                      />
                    </StatTile>
                  </View>
                  <Input
                    label="Existing Permanent Fund"
                    value={initialAmount}
                    onChangeText={setInitialAmount}
                    keyboardType="numeric"
                    placeholder="0"
                  />
                  <FilterChips
                    label="Money location"
                    value={fundLocation}
                    options={LOCATION_OPTIONS}
                    onChange={setFundLocation}
                  />
                  <Input
                    label="Source or description"
                    value={fundDescription}
                    onChangeText={setFundDescription}
                    placeholder="Existing Pandal fund"
                  />
                  <Input
                    label={`Use for ${festivalName} (0 keeps it all permanent)`}
                    value={allocateAmount}
                    onChangeText={setAllocateAmount}
                    keyboardType="numeric"
                  />
                  <StatusStrip
                    tone="info"
                    message={`This is a fund transfer, not a ${festivalName} donation.`}
                  />
                </>
              )}
            </View>
          </Section>

          <View style={styles.form}>
            <Button loading={busy} disabled={!pandalName.trim()} onPress={() => void create()}>
              Create Pandal
            </Button>
            <Button variant="ghost" onPress={() => setMode("choose")}>
              Back
            </Button>
          </View>
        </>
      ) : null}

      {mode === "join" ? (
        <Section title="Join with a code" subtitle="Ask the Pandal admin for the code">
          <View style={styles.form}>
            <Input
              label="Pandal code"
              value={code}
              onChangeText={setCode}
              autoCapitalize="characters"
              placeholder="GNSH-XXXX"
              leadingIcon={<Ticket size={20} color={theme.colors.mutedForeground} />}
            />
            <Button loading={busy} disabled={!code.trim()} onPress={() => void join()}>
              Request access
            </Button>
            <Button variant="ghost" onPress={() => setMode("choose")}>
              Back
            </Button>
          </View>
        </Section>
      ) : null}

      <Section title="Account" plain>
        <View style={styles.accountRow}>
          <Button
            variant="outline"
            style={styles.accountButton}
            onPress={() => {
              void setActiveWorkspace("expense");
            }}
          >
            Switch app
          </Button>
          <Button
            variant="ghost"
            style={styles.accountButton}
            onPress={() => {
              void logout();
            }}
          >
            Log out
          </Button>
        </View>
      </Section>
    </GaneshScreen>
  );
}

function PandalPickRow({
  pandalId,
  name,
  code,
  divider,
}: {
  pandalId: string;
  name: string;
  code: string;
  divider?: boolean;
}) {
  const { replace } = useRouter();
  const { setSession } = useGaneshSession();
  const { festivals } = useFestivals(pandalId);
  const g = useGaneshTokens();

  const openFestival = festivals.find((festival) => festival.status === "open") ?? festivals[0];

  return (
    <NavRow
      title={name}
      meta={
        [`Code ${formatPandalCode(code)}`, openFestival?.name].filter(Boolean).join(" · ")
      }
      icon={<Landmark size={17} color={g.saffron} strokeWidth={2.2} />}
      iconTint={g.wash(g.saffron)}
      divider={divider}
      badge={openFestival ? undefined : { kind: "pending", label: "No festival" }}
      onPress={() => {
        if (!openFestival) {
          toast.error("This Pandal has no festival yet.");
          return;
        }
        void setSession({ pandalId, festivalId: openFestival.id }).then(() => {
          replace("/(ganesh)" as never);
        });
      }}
    />
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: "center",
    gap: 10,
    paddingBottom: 4,
  },
  title: {
    fontSize: 24,
    letterSpacing: -0.5,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    maxWidth: 320,
  },
  form: {
    gap: 12,
  },
  statRow: {
    flexDirection: "row",
    gap: 10,
  },
  pendingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 11,
  },
  pendingGlyph: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  pendingCopy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  pendingName: {
    fontSize: 14.5,
  },
  accountRow: {
    flexDirection: "row",
    gap: 10,
  },
  accountButton: {
    flex: 1,
  },
});
