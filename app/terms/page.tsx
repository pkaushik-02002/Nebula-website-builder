import type { Metadata } from "next"
import { LegalPage } from "@/components/legal/legal-page"
import { termsDocument } from "@/lib/legal-content"

export const metadata: Metadata = {
  title: "Terms and Conditions",
  description: termsDocument.description,
}

export default function TermsPage() {
  return <LegalPage document={termsDocument} />
}
