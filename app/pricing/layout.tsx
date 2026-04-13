import type { Metadata } from "next"

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://buildkit.app"

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Lotus.build pricing: Free tier with 10K tokens/month. Upgrade to Pro or Team for more tokens and advanced features. Start building with AI today.",
  openGraph: {
    title: "Pricing | Lotus.build",
    description: "Free tier and paid plans. Get more tokens and features to build full-stack apps with AI.",
    url: `${siteUrl}/pricing`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Pricing | Lotus.build",
    description: "Free tier and paid plans. Build full-stack apps with AI.",
  },
  alternates: { canonical: `${siteUrl}/pricing` },
  robots: { index: true, follow: true },
}

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
