import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Project",
  description: "Build and edit your app with Lotus.build.",
  robots: { index: false, follow: false },
}

export default function ProjectLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
