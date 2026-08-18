import { useEffect, useState } from "react";
import { Linking, Share, Switch, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Shield } from "lucide-react-native";

import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { LegalDocumentModal } from "@/components/legal/LegalDocumentModal";
import { DeleteAccountModal } from "@/components/privacy/DeleteAccountModal";
import { NotificationConsentDialog } from "@/components/privacy/NotificationConsentDialog";
import { NutritionAiConsentDialog } from "@/components/privacy/NutritionAiConsentDialog";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useDpdpConsent } from "@/hooks/useDpdpConsent";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import {
  dpdpConfig,
  formatGrievanceAddress,
  formatGrievanceEmail,
  hasPublishedGrievanceEmail,
} from "@/lib/dpdpConfig";
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
import { getFirestoreDb } from "@/lib/firebase";
import { useAuth } from "@/providers/AuthProvider";
import { buildPersonalDataExport } from "@/services/privacy/exportPersonalData";
import { requestBillNotificationPermission } from "@/services/creditCardBills/billReminderScheduler";
import { clearSmsLocalStores } from "@/services/privacy/clearLocalUserData";
import { saveSmsAutomationPrefs, SMS_AUTOMATION_PREFS_DEFAULTS } from "@/services/sms/smsAutomationPrefs";
import { useTheme } from "@/theme/ThemeProvider";

export default function DataPrivacyScreen() {
  const { theme } = useTheme();
  const { back } = useRouter();
  const { realUser } = useAuth();
  const { consent, purposes, nominee, saving, setPurposes, setNominee } = useDpdpConsent();
  const [showNotice, setShowNotice] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showNutrition, setShowNutrition] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [nomineeName, setNomineeName] = useState(nominee.name);
  const [nomineeEmail, setNomineeEmail] = useState(nominee.email);
  const [nomineePhone, setNomineePhone] = useState(nominee.phone);
  const [nomineeRel, setNomineeRel] = useState(nominee.relationship);

  useEffect(() => {
    setNomineeName(nominee.name);
    setNomineeEmail(nominee.email);
    setNomineePhone(nominee.phone);
    setNomineeRel(nominee.relationship);
  }, [nominee.name, nominee.email, nominee.phone, nominee.relationship]);

  const onExport = async () => {
    const db = getFirestoreDb();
    if (!realUser || !db) {
      toast.error("Not signed in.");
      return;
    }
    setExporting(true);
    try {
      const payload = await buildPersonalDataExport(db, realUser.uid);
      await Share.share({
        title: "Spendly personal data",
        message: JSON.stringify(payload, null, 2),
      });
    } catch (error) {
      logError("dpdp.export", error);
      toast.error(friendlyErrorMessage(error, "Couldn't export your data."));
    } finally {
      setExporting(false);
    }
  };

  const onToggleSms = async (enabled: boolean) => {
    if (enabled) {
      toast.info("Turn on SMS automation from Settings → Automation so we can show the full SMS notice first.");
      return;
    }
    try {
      await setPurposes({ sms: false });
      await saveSmsAutomationPrefs({ ...SMS_AUTOMATION_PREFS_DEFAULTS, enabled: false });
      await clearSmsLocalStores();
      toast.success("SMS consent withdrawn. Local SMS queues cleared.");
    } catch (error) {
      logError("dpdp.withdrawSms", error);
      toast.error("Couldn't withdraw SMS consent.");
    }
  };

  const onSaveNominee = async () => {
    try {
      await setNominee({
        name: nomineeName,
        email: nomineeEmail,
        phone: nomineePhone,
        relationship: nomineeRel,
      });
      toast.success("Nominee saved");
    } catch (error) {
      logError("dpdp.nominee", error);
      toast.error("Couldn't save nominee.");
    }
  };

  const openGrievance = () => {
    if (!hasPublishedGrievanceEmail()) {
      toast.info(formatGrievanceEmail());
      return;
    }
    void Linking.openURL(`mailto:${dpdpConfig.grievanceEmail.trim()}`);
  };

  return (
    <PageShell contentContainerStyle={{ gap: theme.space.lg }}>
      <PageHeader
        title="Data & privacy"
        subtitle="DPDP rights and consents"
        icon={<Shield size={22} color={theme.colors.primary} />}
        rightElement={
          <Button size="sm" variant="ghost" onPress={() => back()}>
            Back
          </Button>
        }
      />

      <Card title="Legal" subtitle={`Notice v${consent?.noticeVersion || getPrivacyNoticeVersion()}`}>
        <View style={{ gap: 10 }}>
          <Button variant="outline" onPress={() => setShowNotice(true)}>
            View Privacy Notice
          </Button>
          <Button variant="outline" onPress={() => setShowTerms(true)}>
            View Terms of Use
          </Button>
        </View>
      </Card>

      <Card title="Your consents" subtitle="Optional purposes can be withdrawn anytime">
        <View style={{ gap: 14 }}>
          <Text style={{ color: theme.colors.mutedForeground, fontSize: 13, lineHeight: 18 }}>
            Core processing (account and ledger) is required to use Spendly. Withdraw it by
            deleting your account.
          </Text>
          <ConsentSwitch
            label="SMS transaction reading"
            description={
              purposes.sms
                ? "On — Spendly may read bank/UPI SMS on this device."
                : "Off — enable from Settings → Automation after reading the SMS notice."
            }
            value={purposes.sms}
            onValueChange={(value) => void onToggleSms(value)}
            disabled={saving}
          />
          <ConsentSwitch
            label="Nutrition AI (Gemini)"
            description="Sends food descriptions you type to Google."
            value={purposes.nutritionAi}
            onValueChange={(value) => {
              if (value) setShowNutrition(true);
              else void setPurposes({ nutritionAi: false }).then(() => toast.success("Nutrition AI off"));
            }}
            disabled={saving}
          />
          <ConsentSwitch
            label="Local notifications"
            description="Bill reminders and SMS transaction alerts on this device."
            value={purposes.notifications}
            onValueChange={(value) => {
              if (value) setShowNotifications(true);
              else void setPurposes({ notifications: false }).then(() => toast.success("Notifications consent withdrawn"));
            }}
            disabled={saving}
          />
        </View>
      </Card>

      <Card title="Access and correction" subtitle="DPDP sections 11 and 12">
        <View style={{ gap: 10 }}>
          <Text style={{ color: theme.colors.mutedForeground, fontSize: 13, lineHeight: 18 }}>
            Download a JSON copy of your personal data (PIN hashes are omitted). Edit your
            name and username in Settings → Profile. Nutrition profile is under the Nutrition
            workspace.
          </Text>
          <Button loading={exporting} onPress={() => void onExport()}>
            Download my data
          </Button>
        </View>
      </Card>

      <Card title="Nomination" subtitle="DPDP section 14 — optional">
        <View style={{ gap: 10 }}>
          <Text style={{ color: theme.colors.mutedForeground, fontSize: 13, lineHeight: 18 }}>
            Someone who may exercise your rights if you die or are incapacitated.
          </Text>
          <Input label="Name" value={nomineeName} onChangeText={setNomineeName} />
          <Input
            label="Email"
            value={nomineeEmail}
            onChangeText={setNomineeEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Input
            label="Phone"
            value={nomineePhone}
            onChangeText={setNomineePhone}
            keyboardType="phone-pad"
          />
          <Input
            label="Relationship"
            value={nomineeRel}
            onChangeText={setNomineeRel}
          />
          <Button loading={saving} onPress={() => void onSaveNominee()}>
            Save nominee
          </Button>
        </View>
      </Card>

      <Card title="Grievance" subtitle={`We aim to reply within ${dpdpConfig.grievanceSlaDays} days`}>
        <View style={{ gap: 10 }}>
          <Text style={{ color: theme.colors.mutedForeground, fontSize: 13, lineHeight: 18 }}>
            Email: {formatGrievanceEmail()}
            {"\n"}
            Address: {formatGrievanceAddress()}
            {"\n\n"}
            If we do not resolve it, you may complain to the {dpdpConfig.dataProtectionBoardName}{" "}
            ({dpdpConfig.dataProtectionBoardUrl}).
          </Text>
          <Button variant="outline" onPress={openGrievance}>
            Contact grievance email
          </Button>
        </View>
      </Card>

      <Card title="Erase" subtitle="Deletes account and personal data">
        <Button variant="destructive" onPress={() => setShowDelete(true)}>
          Delete account
        </Button>
      </Card>

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
      <DeleteAccountModal visible={showDelete} onClose={() => setShowDelete(false)} />
      <NutritionAiConsentDialog
        isOpen={showNutrition}
        onClose={() => setShowNutrition(false)}
        confirming={saving}
        onConfirm={() => {
          void setPurposes({ nutritionAi: true }).then(() => {
            setShowNutrition(false);
            toast.success("Nutrition AI on");
          });
        }}
      />
      <NotificationConsentDialog
        isOpen={showNotifications}
        onClose={() => setShowNotifications(false)}
        confirming={saving}
        onConfirm={() => {
          void (async () => {
            await setPurposes({ notifications: true });
            await requestBillNotificationPermission();
            setShowNotifications(false);
            toast.success("Notification consent saved");
          })();
        }}
      />
    </PageShell>
  );
}

function ConsentSwitch({
  label,
  description,
  value,
  onValueChange,
  disabled,
}: {
  label: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: theme.colors.foreground, fontWeight: "600" }}>{label}</Text>
        <Text style={{ color: theme.colors.mutedForeground, fontSize: 12 }}>{description}</Text>
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
        trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}
