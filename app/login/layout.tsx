import type { Metadata } from "next"

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://lotus.build"

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to lotus.build with Google, GitHub, or email. Start building full-stack apps with AI.",
  openGraph: {
    title: "Sign In | lotus.build",
    description: "Sign in to lotus.build. Build full-stack apps with AI.",
    url: `${siteUrl}/login`,
  },
  robots: { index: false, follow: true },
  alternates: { canonical: `${siteUrl}/login` },
}

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
