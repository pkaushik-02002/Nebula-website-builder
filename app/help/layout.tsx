import type { Metadata } from "next"

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://lotus.build"

export const metadata: Metadata = {
  title: "Help & FAQ",
  description:
    "How to create projects, use the AI builder, preview and deploy to Vercel or Netlify. lotus.build help and frequently asked questions.",
  openGraph: {
    title: "Help & FAQ | lotus.build",
    description: "Learn how to build full-stack apps with AI. FAQs, guides, and support.",
    url: `${siteUrl}/help`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Help & FAQ | lotus.build",
    description: "Learn how to build full-stack apps with AI.",
  },
  alternates: { canonical: `${siteUrl}/help` },
  robots: { index: true, follow: true },
}

export default function HelpLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
