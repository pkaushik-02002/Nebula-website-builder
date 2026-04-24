import type { Metadata } from "next"
import { CookiePolicyPage } from "@/components/legal/cookie-policy-page"

export const metadata: Metadata = {
  title: "Cookie Policy",
  description:
    "Review the current cookies, browser storage, and optional analytics controls used by lotus.build.",
}

export default function CookiesPage() {
  return <CookiePolicyPage />
}
