import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { AdminGlyph } from "@/components/ganesh/admin/adminArt";
import { AdminQueryState } from "@/components/ganesh/AdminQueryState";
import { FestivalStackHero } from "@/components/ganesh/chrome/FestivalStackHero";
import { ganeshStackLayout } from "@/components/ganesh/chrome/stackLayout";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
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
  const { back } = useRouter();
  const { pandalId, festivalId } = useGaneshSession();
  const { categories, loading, error, retry } = useGaneshCategories(pandalId, festivalId);
  const writes = useGaneshWrites();
  const [name, setName] = useState("");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [busy, setBusy] = useState(false);

  const run = (label: string, work: Promise<unknown>) => {
    setBusy(true);
    work
      .catch((caught) => {
        logError(label, caught);
        toast.error(friendlyErrorMessage(caught, "Could not update the category."));
      })
      .finally(() => setBusy(false));
  };

  return (
    <GaneshScreen contentContainerStyle={ganeshStackLayout.bleed}>
      <FestivalStackHero
        title="Expense categories"
        onBack={back}
        mark={<AdminGlyph name="iconCategories" size={40} />}
      />
      <View style={ganeshStackLayout.body}>
      <Text style={{ color: theme.colors.mutedForeground, lineHeight: 22 }}>
        Disable a category instead of deleting it. Expenses already recorded keep their old
        category name.
      </Text>
      <Input label="New category" value={name} onChangeText={setName} placeholder="Pooja materials" />
      <Button
        loading={busy}
        onPress={() => {
          if (!name.trim()) {
            toast.error("Enter a category name.");
            return;
          }
          run("ganesh.admin.category.add", writes.addCustomCategory(name).then(() => setName("")));
        }}
      >
        Add category
      </Button>
      <AdminQueryState
        loading={loading && categories.length === 0}
        error={error}
        onRetry={retry}
        empty={
          categories.length === 0
            ? { title: "No categories yet", description: "Add Decoration, Flowers, Food, or any other spend." }
            : null
        }
      >
        {categories.map((category) => (
          <View
            key={category.id}
            style={{
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
              borderWidth: 1,
              borderRadius: 16,
              padding: 14,
              gap: 10,
            }}
          >
            <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
              {category.name}
            </Text>
            <Text style={{ color: theme.colors.mutedForeground }}>
              {category.disabled ? "Disabled" : category.isDefault ? "Default" : "Custom"}
            </Text>
            {renameId === category.id ? (
              <Input label="Rename" value={renameValue} onChangeText={setRenameValue} />
            ) : null}
            <View style={{ flexDirection: "row", gap: 8 }}>
              {renameId === category.id ? (
                <Button
                  style={{ flex: 1 }}
                  loading={busy}
                  onPress={() => {
                    run(
                      "ganesh.admin.category.rename",
                      writes.updateCategory(category.id, { name: renameValue }).then(() => {
                        setRenameId(null);
                      })
                    );
                  }}
                >
                  Save name
                </Button>
              ) : (
                <Button
                  variant="outline"
                  style={{ flex: 1 }}
                  onPress={() => {
                    setRenameId(category.id);
                    setRenameValue(category.name);
                  }}
                >
                  Rename
                </Button>
              )}
              <Button
                variant="outline"
                style={{ flex: 1 }}
                onPress={() => {
                  const nextDisabled = !category.disabled;
                  Alert.alert(
                    nextDisabled ? "Disable category?" : "Enable category?",
                    nextDisabled
                      ? `${category.name} will stay on old expenses, but new expenses cannot use it.`
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
                }}
              >
                {category.disabled ? "Enable" : "Disable"}
              </Button>
            </View>
          </View>
        ))}
      </AdminQueryState>
      </View>
    </GaneshScreen>
  );
}
