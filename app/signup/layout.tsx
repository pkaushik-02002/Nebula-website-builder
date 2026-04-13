import type { Metadata } from "next"

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://buildkit.app"

export const metadata: Metadata = {
  title: "Sign Up",
  description: "Create your Lotus.build account. Sign up with Google, GitHub, or email and start building full-stack apps with AI.",
  openGraph: {
    title: "Sign Up | Lotus.build",
    description: "Create your Lotus.build account. Build full-stack apps with AI.",
    url: `${siteUrl}/signup`,
  },
  robots: { index: false, follow: true },
  alternates: { canonical: `${siteUrl}/signup` },
}

export default function SignupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
