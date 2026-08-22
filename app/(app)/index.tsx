import { Redirect } from "expo-router";
import { useSettings } from "@/providers/SettingsProvider";

export default function AppIndex() {
  const { settings } = useSettings();

  if (settings.defaultView === "expenses") {
    return <Redirect href="/ledger" />;
  }

  if (settings.defaultView === "analytics") {
    return <Redirect href="/insights" />;
  }

  if (settings.defaultView === "add") {
    return <Redirect href="/add" />;
  }

  return <Redirect href="/dashboard" />;
}
