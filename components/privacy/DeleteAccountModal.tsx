import { useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import {
  accountHasGoogleProvider,
  accountHasPasswordProvider,
  deleteAccountAndData,
  reauthenticateForDeletion,
} from "@/services/privacy/deleteAccount";
import { useTheme } from "@/theme/ThemeProvider";

type DeleteAccountModalProps = {
  visible: boolean;
  onClose: () => void;
};

export function DeleteAccountModal({ visible, onClose }: DeleteAccountModalProps) {
  const { theme } = useTheme();
  const { realUser, logout } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  const hasPassword = realUser ? accountHasPasswordProvider(realUser) : false;
  const hasGoogle = realUser ? accountHasGoogleProvider(realUser) : false;
  const confirmed = confirmText.trim().toUpperCase() === "DELETE";

  const runDelete = async (reauth: { method: "password"; password: string } | { method: "google" }) => {
    if (!realUser) return;
    setBusy(true);
    try {
      await reauthenticateForDeletion(realUser, reauth);
      await deleteAccountAndData(realUser);
      toast.success("Your account and personal data were deleted");
      onClose();
      await logout().catch(() => undefined);
    } catch (error) {
      logError("dpdp.deleteAccountModal", error);
      toast.error(friendlyErrorMessage(error, "Couldn't delete your account. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={busy ? undefined : onClose}
    >
      <SafeAreaView
        style={[styles.root, { backgroundColor: theme.colors.background }]}
        edges={["top", "bottom"]}
      >
        <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }} keyboardShouldPersistTaps="handled">
          <Text
            style={{
              color: theme.colors.foreground,
              fontFamily: theme.fontFamily.bold,
              fontSize: 22,
            }}
          >
            Delete account
          </Text>
          <Text style={{ color: theme.colors.mutedForeground, fontSize: 15, lineHeight: 22 }}>
            This permanently erases your Spendly account, cloud ledger, nutrition data,
            payment requests you created, and local SMS queues on this device. It cannot
            be undone.
            {"\n\n"}
            Shared vaults you own are deleted. Vaults you only joined will remove you as
            a member. Type DELETE to confirm, then re-authenticate.
          </Text>
          <Input
            label='Type DELETE'
            value={confirmText}
            onChangeText={setConfirmText}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          {hasPassword ? (
            <>
              <Input
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="password"
              />
              <Button
                variant="destructive"
                loading={busy}
                disabled={!confirmed || !password || busy}
                onPress={() => void runDelete({ method: "password", password })}
              >
                Re-authenticate and delete
              </Button>
            </>
          ) : null}
          {hasGoogle ? (
            <Button
              variant="destructive"
              loading={busy}
              disabled={!confirmed || busy}
              onPress={() => void runDelete({ method: "google" })}
            >
              Confirm with Google and delete
            </Button>
          ) : null}
          {!hasPassword && !hasGoogle ? (
            <Text style={{ color: theme.colors.destructive }}>
              This sign-in method cannot re-authenticate in-app. Contact the grievance
              email listed in the Privacy Notice.
            </Text>
          ) : null}
          <Button variant="outline" disabled={busy} onPress={onClose}>
            Cancel
          </Button>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
