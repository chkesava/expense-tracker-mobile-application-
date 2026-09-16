import { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshSyncChip } from "@/components/ganesh/GaneshSyncChip";
import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
import { PrasadamDayStrip } from "@/components/ganesh/prasadam/PrasadamDayStrip";
import { PrasadamHero } from "@/components/ganesh/prasadam/PrasadamHero";
import { PrasadamHistory } from "@/components/ganesh/prasadam/PrasadamHistory";
import { PrasadamOverview } from "@/components/ganesh/prasadam/PrasadamOverview";
import { PrasadamProviderForm } from "@/components/ganesh/prasadam/PrasadamProviderForm";
import { PrasadamReport } from "@/components/ganesh/prasadam/PrasadamReport";
import { PrasadamSessionCard } from "@/components/ganesh/prasadam/PrasadamSessionCard";
import {
  FilterChips,
  MetaLabel,
  StatusStrip,
  type ChipOption,
} from "@/components/ganesh/ui";
import { useFestivalPrasadam } from "@/hooks/useFestivalPrasadam";
import { useFestivals } from "@/hooks/useFestivals";
import { useFestivalWriteLock } from "@/hooks/useFestivalWriteLock";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { usePandals } from "@/hooks/usePandals";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import {
  exportPrasadamCsv,
  exportPrasadamPdf,
} from "@/services/ganesh/ganeshReportDelivery";
import type { PrasadamEntry, PrasadamSession } from "@/shared/types/ganeshPrasadam";
import { todayDateInput } from "@/shared/utils/ganeshIdentity";
import { entriesForSession, prasadamDates } from "@/shared/utils/ganeshPrasadam";
import {
  buildPrasadamExport,
  type PrasadamExport,
} from "@/shared/utils/ganeshPrasadamExport";
import { festivalDates, festivalDayNumber } from "@/shared/utils/ganeshSeva";

type PrasadamTab = "overview" | "morning" | "evening" | "history" | "report";

/**
 * Prasadam — the daily register, in one screen (KAN-126).
 *
 * Day → session → providers → history → report, without sending a volunteer
 * between screens while people are queueing at the counter. The requirement
 * that adding the next provider must not mean leaving the session is a
 * statement about navigation cost, and a pushed form loses on it every time:
 * the day, the session and the running count all have to stay on screen.
 *
 * Structure follows `token-laddu.tsx`: the hero bleeds to the edges, the screen
 * itself does not scroll, and the history list owns its own scrolling.
 */
export default function PrasadamScreen() {
  const { back, push } = useRouter();
  const params = useLocalSearchParams<{ date?: string; session?: string }>();
  const { pandalId, festivalId } = useGaneshSession();
  const { festivals } = useFestivals(pandalId);
  const { pandals } = usePandals();
  const { realUser } = useAuth();
  const { can } = useGaneshPermissions();
  const { closed, lockMessage } = useFestivalWriteLock();
  const writes = useGaneshWrites();

  const { entries, loading, error, retry } = useFestivalPrasadam(pandalId, festivalId);

  const festival = festivals.find((item) => item.id === festivalId);
  const pandal = pandals.find((item) => item.id === pandalId);
  const today = todayDateInput();

  const canRead = can("prasadam.read");
  const canWrite = can("prasadam.write") && !closed;

  const [tab, setTab] = useState<PrasadamTab>(
    params.session === "morning" || params.session === "evening" ? params.session : "overview"
  );
  const [activeDate, setActiveDate] = useState(params.date || today);
  const [addingIn, setAddingIn] = useState<PrasadamSession | null>(null);
  const [exporting, setExporting] = useState(false);

  /**
   * The strip covers the festival's own window plus any day that already has an
   * entry, so it still works before the dates are filled in — the same union
   * the Seva tab uses.
   */
  const days = useMemo(() => {
    const set = new Set<string>([...festivalDates(festival), ...prasadamDates(entries)]);
    if (set.size === 0) set.add(today);
    return [...set].sort();
  }, [festival, entries, today]);

  const dayNumber = festivalDayNumber(festival, activeDate);

  const openSession = useCallback((session: PrasadamSession) => {
    setTab(session);
    setAddingIn(session);
  }, []);

  const openEntry = useCallback(
    (id: string) => push(`/(ganesh)/prasadam/${id}`),
    [push]
  );

  const buildModel = useCallback(
    (scoped: PrasadamEntry[], filterSummary?: string): PrasadamExport =>
      buildPrasadamExport({
        pandalName: pandal?.name ?? "Pandal",
        festivalName: festival?.name ?? "Festival",
        festivalYear: festival?.year ?? undefined,
        generatedAt: new Date().toISOString(),
        generatedBy:
          realUser?.displayName || realUser?.phoneNumber || "A committee member",
        entries: scoped,
        filterSummary,
        dayNumberOf: (date) => festivalDayNumber(festival, date)?.day,
      }),
    [pandal?.name, festival, realUser]
  );

  const runExport = useCallback(
    (model: PrasadamExport, kind: "pdf" | "csv") => {
      setExporting(true);
      const work = kind === "pdf" ? exportPrasadamPdf(model) : exportPrasadamCsv(model);
      work
        .catch((err) => {
          logError("ganesh.prasadamExport", err, { rows: model.totals.entryCount });
          toast.error(
            friendlyErrorMessage(err, "Could not export the prasadam register.")
          );
        })
        .finally(() => setExporting(false));
    },
    []
  );

  const tabs = useMemo(() => {
    const options: Array<ChipOption<PrasadamTab>> = [{ id: "overview", label: "Overview" }];
    options.push({
      id: "morning",
      label: "Morning",
      badge: entriesForSession(entries, activeDate, "morning").length,
    });
    options.push({
      id: "evening",
      label: "Evening",
      badge: entriesForSession(entries, activeDate, "evening").length,
    });
    options.push({ id: "history", label: "History", badge: entries.length });
    options.push({ id: "report", label: "Report" });
    return options;
  }, [entries, activeDate]);

  if (!canRead) {
    return (
      <GaneshWriteLock message="Your role cannot see the prasadam register. Ask a Pandal Admin or the treasurer." />
    );
  }

  const prefix = (
    <View style={styles.prefix}>
      <FilterChips value={tab} options={tabs} onChange={setTab} />
      {closed ? <StatusStrip tone="warning" message={lockMessage} /> : null}
      {!canWrite && !closed ? (
        <MetaLabel>You can view the prasadam register but not record entries.</MetaLabel>
      ) : null}
    </View>
  );

  const session: PrasadamSession = tab === "evening" ? "evening" : "morning";

  return (
    <GaneshScreen scroll={false} contentContainerStyle={styles.bleed}>
      <PrasadamHero
        festivalName={festival?.name}
        onBack={back}
        rightAccessory={<GaneshSyncChip onDark />}
      />

      <View style={styles.body}>
        {tab === "history" ? (
          <PrasadamHistory
            entries={entries}
            loading={loading}
            error={error}
            onRetry={retry}
            onOpenEntry={openEntry}
            onOpenDay={(date) => {
              setActiveDate(date);
              setTab("overview");
            }}
            onExport={(filtered) =>
              runExport(buildModel(filtered, "The filtered list"), "pdf")
            }
            exporting={exporting}
            canExport={canRead}
            prefix={prefix}
          />
        ) : (
          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {prefix}

            {tab !== "report" ? (
              <PrasadamDayStrip
                dates={days}
                activeDate={activeDate}
                today={today}
                entries={entries}
                onSelect={(date) => {
                  setActiveDate(date);
                  setAddingIn(null);
                }}
              />
            ) : null}

            {tab === "overview" ? (
              <PrasadamOverview
                date={activeDate}
                entries={entries}
                today={today}
                dayNumber={dayNumber?.day}
                totalDays={dayNumber?.total}
                canWrite={canWrite}
                onOpenSession={openSession}
                onOpenEntry={openEntry}
              />
            ) : null}

            {tab === "morning" || tab === "evening" ? (
              addingIn === session ? (
                <PrasadamProviderForm
                  date={activeDate}
                  session={session}
                  entries={entries}
                  onSubmit={(draft, opts) =>
                    writes.createPrasadamEntry(
                      { ...draft, date: activeDate, session },
                      opts
                    )
                  }
                  onDone={() => setAddingIn(null)}
                  onCancel={() => setAddingIn(null)}
                />
              ) : (
                <PrasadamSessionCard
                  date={activeDate}
                  session={session}
                  entries={entries}
                  today={today}
                  canWrite={canWrite}
                  onAdd={() => setAddingIn(session)}
                  onOpenEntry={openEntry}
                />
              )
            ) : null}

            {tab === "report" ? (
              <PrasadamReport
                entries={entries}
                activeDate={activeDate}
                buildModel={buildModel}
                onExportPdf={(model) => runExport(model, "pdf")}
                onExportCsv={(model) => runExport(model, "csv")}
                exporting={exporting}
              />
            ) : null}
          </ScrollView>
        )}
      </View>
    </GaneshScreen>
  );
}

const styles = StyleSheet.create({
  bleed: { paddingHorizontal: 0, paddingTop: 0, gap: 0 },
  body: { flex: 1, minHeight: 0, paddingHorizontal: 16, paddingTop: 8 },
  scrollArea: { flex: 1, minHeight: 0 },
  scrollContent: { paddingBottom: 32, gap: 12 },
  prefix: { gap: 10, paddingBottom: 10 },
});
