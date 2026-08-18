import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ConsentCheckboxes } from "@/components/legal/ConsentCheckboxes";
import { LegalDocumentModal } from "@/components/legal/LegalDocumentModal";
import { Button } from "@/components/ui/Button";
import { useDpdpConsent } from "@/hooks/useDpdpConsent";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import {
  getPrivacyNoticeIntro,
  getPrivacyNoticeSections,
  getPrivacyNoticeTitle,
  getPrivacyNoticeVersion,
} from "@/legal/privacyNotice";
import {
  getTermsIntro,
  getTermsSections,
  getTermsTitle,
  getTermsVersion,
} from "@/legal/termsOfUse";
import { useAuth } from "@/providers/AuthProvider";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Blocking notice for signed-in users with no/outdated DPDP consent.
 * Escape hatch is Sign out — the notice cannot be dismissed.
 */
export function NoticeAcceptModal() {
  const { theme } = useTheme();
  const { logout } = useAuth();
  const { loading, needsNotice, acceptNotice, saving } = useDpdpConsent();
  const [isAdult, setIsAdult] = useState(false);
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [showNotice, setShowNotice] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  if (loading || !needsNotice) return null;

  const canAccept = isAdult && acceptedLegal && !saving;

  const onAccept = async () => {
    try {
      await acceptNotice();
      toast.success("Privacy Notice accepted");
    } catch (error) {
      logError("dpdp.noticeModal.accept", error);
      toast.error(friendlyErrorMessage(error, "Couldn't save your consent. Try again."));
    }
  };

  const onSignOut = async () => {
    setSigningOut(true);
    try {
      await logout();
    } catch (error) {
      logError("dpdp.noticeModal.signOut", error);
      toast.error(friendlyErrorMessage(error, "Couldn't sign you out."));
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen">
      <SafeAreaView
        style={[styles.root, { backgroundColor: theme.colors.background }]}
        edges={["top", "bottom"]}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text
            style={{
              color: theme.colors.foreground,
              fontFamily: theme.fontFamily.bold,
              fontSize: 24,
            }}
          >
            Privacy Notice
          </Text>
          <Text style={{ color: theme.colors.mutedForeground, fontSize: 15, lineHeight: 22 }}>
            Indian law requires us to tell you what personal data Spendly processes and to
            record your consent before we continue. Please confirm you are 18 or older and
            that you have read the Privacy Notice and Terms.
          </Text>
          <ConsentCheckboxes
            isAdult={isAdult}
            onAdultChange={setIsAdult}
            acceptedLegal={acceptedLegal}
            onAcceptedLegalChange={setAcceptedLegal}
            onOpenNotice={() => setShowNotice(true)}
            onOpenTerms={() => setShowTerms(true)}
          />
          <Button onPress={() => void onAccept()} disabled={!canAccept} loading={saving}>
            Agree and continue
          </Button>
          <Button variant="ghost" onPress={() => void onSignOut()} loading={signingOut}>
            Sign out
          </Button>
        </ScrollView>
        {saving ? (
          <View style={styles.busy}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : null}
      </SafeAreaView>
      <LegalDocumentModal
        visible={showNotice}
        title={getPrivacyNoticeTitle()}
        version={getPrivacyNoticeVersion()}
        intro={getPrivacyNoticeIntro()}
        sections={getPrivacyNoticeSections()}
        onClose={() => setShowNotice(false)}
      />
      <LegalDocumentModal
        visible={showTerms}
        title={getTermsTitle()}
        version={getTermsVersion()}
        intro={getTermsIntro()}
        sections={getTermsSections()}
        onClose={() => setShowTerms(false)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 24, gap: 20 },
  busy: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
});
