import { LegalWebPage } from "@/components/legal/LegalWebPage";
import {
  getTermsIntro,
  getTermsSections,
  getTermsTitle,
  getTermsVersion,
} from "@/legal/termsOfUse";

export default function TermsPage() {
  return (
    <LegalWebPage
      title={getTermsTitle()}
      version={getTermsVersion()}
      intro={getTermsIntro()}
      sections={getTermsSections()}
    />
  );
}
