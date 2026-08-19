import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { doc, setDoc } from "firebase/firestore";

import { SettingsPanel } from "@/components/settings/SettingsControls";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import { useUserDoc } from "@/providers/UserDocProvider";
import { useTheme } from "@/theme/ThemeProvider";

export function ProfileSection() {
  const { theme } = useTheme();
  const { user, realUser, logout } = useAuth();
  const { data, role, isAdmin } = useUserDoc();
  const [username, setUsername] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    setUsername(typeof data?.username === "string" ? data.username : "");
  }, [data?.username]);

  const onSaveProfile = async () => {
    const db = getFirestoreDb();
    if (!realUser || !db) return;
    setSavingProfile(true);
    try {
      await setDoc(
        doc(db, "users", realUser.uid),
        {
          username: username.trim(),
          email: realUser.email,
          displayName: realUser.displayName,
          photoURL: realUser.photoURL,
        },
        { merge: true }
      );
      toast.success("Profile saved");
    } catch (error) {
      logError("settings.saveProfile", error);
      toast.error(friendlyErrorMessage(error, "Couldn't save your profile."));
    } finally {
      setSavingProfile(false);
    }
  };

  const onLogout = async () => {
    try {
      await logout();
      toast.success("Signed out");
    } catch (error) {
      logError("settings.logout", error);
      toast.error(friendlyErrorMessage(error, "Couldn't sign you out. Please try again."));
    }
  };

  return (
    <SettingsPanel title="Profile" subtitle={`${role}${isAdmin ? " · admin" : ""}`}>
      <Text style={{ color: theme.colors.mutedForeground, fontSize: theme.typography.sm }}>
        {user?.displayName || "—"} · {user?.email || "—"}
      </Text>
      <Input
        label="Username"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        placeholder="yourname"
      />
      <Button loading={savingProfile} onPress={onSaveProfile}>
        Save profile
      </Button>
      <Button variant="destructive" onPress={onLogout}>
        Sign out
      </Button>
    </SettingsPanel>
  );
}
