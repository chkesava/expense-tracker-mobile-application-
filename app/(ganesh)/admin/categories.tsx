import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Plus, Tags } from "lucide-react-native";

import { AdminQueryState } from "@/components/ganesh/AdminQueryState";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import {
  GaneshHeader,
  Section,
  StatusBadge,
  StatusStrip,
  useGaneshTokens,
} from "@/components/ganesh/ui";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useGaneshCategories } from "@/hooks/useGaneshCategories";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { useTheme } from "@/theme/ThemeProvider";

export default function AdminCategoriesScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { back } = useRouter();
  const { pandalId, festivalId } = useGaneshSession();
  const { categories, loading, error, retry } = useGaneshCategories(pandalId, festivalId);
  const writes = useGaneshWrites();

  const [name, setName] = useState("");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [busy, setBusy] = useState(false);

  const active = categories.filter((category) => !category.disabled);
  const disabled = categories.filter((category) => category.disabled);

  const run = (label: string, work: Promise<unknown>) => {
    setBusy(true);
    work
      .catch((caught) => {
        logError(label, caught);
        toast.error(friendlyErrorMessage(caught, "Could not update the category."));
      })
      .finally(() => setBusy(false));
  };

  const toggle = (category: (typeof categories)[number]) => {
    const nextDisabled = !category.disabled;
    Alert.alert(
      nextDisabled ? "Disable category?" : "Enable category?",
      nextDisabled
        ? `${category.name} stays on old expenses, but new expenses cannot use it.`
        : `${category.name} will be available when adding expenses.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: nextDisabled ? "Disable" : "Enable",
          onPress: () =>
            run(
              "ganesh.admin.category.toggle",
              writes.updateCategory(category.id, { disabled: nextDisabled })
            ),
        },
      ]
    );
  };

  const renderCategory = (category: (typeof categories)[number], last: boolean) => (
    <View
      key={category.id}
      style={[
        styles.row,
        !last && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: g.divider,
        },
      ]}
    >
      <View style={styles.rowTop}>
        <Text
          numberOfLines={1}
          style={[
            styles.name,
            { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium },
          ]}
        >
          {category.name}
        </Text>
        <StatusBadge
          kind={category.disabled ? "cancelled" : category.isDefault ? "neutral" : "sponsored"}
          label={category.disabled ? "Disabled" : category.isDefault ? "Built-in" : "Custom"}
          size="sm"
        />
      </View>

      {renameId === category.id ? (
        <View style={styles.renameBlock}>
          <Input label="Rename" value={renameValue} onChangeText={setRenameValue} />
          <View style={styles.actions}>
            <Button
              style={styles.action}
              loading={busy}
              disabled={!renameValue.trim()}
              onPress={() =>
                run(
                  "ganesh.admin.category.rename",
                  writes
                    .updateCategory(category.id, { name: renameValue })
                    .then(() => setRenameId(null))
                )
              }
            >
              Save name
            </Button>
            <Button variant="ghost" style={styles.action} onPress={() => setRenameId(null)}>
              Cancel
            </Button>
          </View>
        </View>
      ) : (
        <View style={styles.actions}>
          <Button
            variant="outline"
            size="sm"
            style={styles.action}
            onPress={() => {
              setRenameId(category.id);
              setRenameValue(category.name);
            }}
          >
            Rename
          </Button>
          <Button variant="outline" size="sm" style={styles.action} onPress={() => toggle(category)}>
            {category.disabled ? "Enable" : "Disable"}
          </Button>
        </View>
      )}
    </View>
  );

  return (
    <GaneshScreen safeTop>
      <GaneshHeader
        title="Expense categories"
        subtitle={`${active.length} active${disabled.length > 0 ? ` · ${disabled.length} disabled` : ""}`}
        icon={<Tags size={22} color={g.saffron} strokeWidth={2.2} />}
        onBack={back}
      />

      <StatusStrip
        tone="info"
        message="Disable a category instead of deleting it — expenses already recorded keep their category name."
      />

      <Section title="Add a category" plain>
        <View style={styles.form}>
          <Input
            label="Category name"
            value={name}
            onChangeText={setName}
            placeholder="Pooja materials"
            autoCapitalize="sentences"
          />
          <Button
            loading={busy}
            disabled={!name.trim()}
            onPress={() =>
              run(
                "ganesh.admin.category.add",
                writes.addCustomCategory(name).then(() => setName(""))
              )
            }
          >
            <View style={styles.ctaInner}>
              <Plus size={17} color={theme.colors.primaryForeground} strokeWidth={2.6} />
              <Text
                style={[
                  styles.ctaLabel,
                  { color: theme.colors.primaryForeground, fontFamily: theme.fontFamily.semibold },
                ]}
              >
                Add category
              </Text>
            </View>
          </Button>
        </View>
      </Section>

      <AdminQueryState
        loading={loading && categories.length === 0}
        error={error}
        onRetry={retry}
        empty={
          categories.length === 0
            ? {
                title: "No categories yet",
                description: "Add Decoration, Flowers, Food, or any other kind of spend.",
              }
            : null
        }
      >
        {active.length > 0 ? (
          <Section title="Active">
            {active.map((category, index) => renderCategory(category, index === active.length - 1))}
          </Section>
        ) : null}

        {disabled.length > 0 ? (
          <Section title="Disabled" subtitle="Still shown on older expenses">
            {disabled.map((category, index) =>
              renderCategory(category, index === disabled.length - 1)
            )}
          </Section>
        ) : null}
      </AdminQueryState>
    </GaneshScreen>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 12,
  },
  row: {
    paddingVertical: 12,
    gap: 10,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  name: {
    flex: 1,
    minWidth: 0,
    fontSize: 14.5,
  },
  renameBlock: {
    gap: 10,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
  },
  action: {
    flex: 1,
  },
  ctaInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  ctaLabel: {
    fontSize: 14,
    letterSpacing: 0.2,
  },
});
