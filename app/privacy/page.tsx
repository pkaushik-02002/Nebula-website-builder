import type { Metadata } from "next"
import { LegalPage } from "@/components/legal/legal-page"
import { privacyDocument } from "@/lib/legal-content"

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: privacyDocument.description,
}

export default function PrivacyPage() {
  return <LegalPage document={privacyDocument} />
}
