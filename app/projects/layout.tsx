import type { Metadata } from "next"

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://lotus.build"

export const metadata: Metadata = {
  title: "My Projects",
  description: "Your lotus.build projects. View, edit, and deploy your AI-built apps.",
  openGraph: {
    title: "My Projects | lotus.build",
    description: "Your AI-built projects. View, edit, and deploy.",
    url: `${siteUrl}/projects`,
  },
  robots: { index: false, follow: true },
  alternates: { canonical: `${siteUrl}/projects` },
}

export default function ProjectsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
