import { LegalWebPage } from "@/components/legal/LegalWebPage";
import { dpdpConfig, formatFiduciaryName } from "@/lib/dpdpConfig";

export default function AccountDeletionPage() {
  return (
    <LegalWebPage
      title="Delete your Spendly account"
      version="1.0"
      intro={`${formatFiduciaryName()} lets you erase your account and personal data from the app. Google Play also requires a web path to request deletion.`}
      sections={[
        {
          heading: "In the Android app",
          body:
            "Open Spendly → Settings → Data & privacy → Delete account. Confirm by typing DELETE, then re-enter your password or Google account. This removes your Firebase Auth user, Firestore personal data, payment requests you created, and local SMS queues on that device.",
        },
        {
          heading: "If you cannot open the app",
          body:
            `Email ${dpdpConfig.grievanceEmail.trim() || "the grievance contact published in the Privacy Notice"} from the same address as your Spendly account and ask us to delete the account. We aim to complete this within ${dpdpConfig.grievanceSlaDays} days of verifying it is you.`,
        },
      ]}
    />
  );
}
