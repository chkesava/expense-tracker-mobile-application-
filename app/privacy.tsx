import {
  getPrivacyNoticeIntro,
  getPrivacyNoticeSections,
  getPrivacyNoticeTitle,
  getPrivacyNoticeVersion,
} from "@/legal/privacyNotice";
import { LegalWebPage } from "@/components/legal/LegalWebPage";

export default function PrivacyPage() {
  return (
    <LegalWebPage
      title={getPrivacyNoticeTitle()}
      version={getPrivacyNoticeVersion()}
      intro={getPrivacyNoticeIntro()}
      sections={getPrivacyNoticeSections()}
    />
  );
}
