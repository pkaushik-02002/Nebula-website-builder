import type React from "react"
import type { Metadata } from "next"
import { Manrope } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { AuthProvider } from "@/contexts/auth-context"
import "@21st-sdk/react/styles.css"
import "./globals.css"

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
})

function normalizeSiteUrl(raw?: string): string {
  const value = (raw || "").trim()
  if (!value) return "https://buildkit.app"
  if (/^https?:\/\//i.test(value)) return value
  return `https://${value}`
}

const siteUrl = normalizeSiteUrl(process.env.NEXT_PUBLIC_APP_URL)

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "BuildKit | AI-Powered Full-Stack App Builder",
    template: "%s | BuildKit",
  },
  description:
    "Turn ideas into production-ready web apps with AI. Describe what you want to build in plain English—landing pages, dashboards, SaaS UIs—and get React/TypeScript code, live preview, and one-click deploy to Vercel or Netlify.",
  keywords: [
    "AI app builder",
    "build app with AI",
    "React code generator",
    "full-stack app builder",
    "no-code AI",
    "web app generator",
    "Vite React",
    "deploy to Vercel",
    "BuildKit",
  ],
  authors: [{ name: "BuildKit", url: siteUrl }],
  creator: "BuildKit",
  publisher: "BuildKit",
  applicationName: "BuildKit",
  referrer: "origin-when-cross-origin",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "BuildKit",
    title: "BuildKit | AI-Powered Full-Stack App Builder",
    description:
      "Turn ideas into production-ready web apps with AI. Describe what you want—get React code, live preview, and one-click deploy.",
  },
  twitter: {
    card: "summary",
    title: "BuildKit | AI-Powered Full-Stack App Builder",
    description: "Turn ideas into production-ready web apps with AI. Describe what you want—get code, preview, deploy.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
  alternates: {
    canonical: siteUrl,
  },
  icons: {
    icon: [
      {
        url: "/icon-light-32x32.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark-32x32.png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
    apple: "/apple-icon.png",
  },
  verification: {
    // Optional: add when you have them
    // google: "google-site-verification-code",
    // yandex: "yandex-verification-code",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${siteUrl}/#organization`,
        name: "BuildKit",
        url: siteUrl,
        logo: { "@type": "ImageObject", url: `${siteUrl}/icon.svg` },
        description: "AI-powered full-stack app builder. Turn ideas into production-ready web applications.",
      },
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        url: siteUrl,
        name: "BuildKit",
        description: "Build full-stack web apps with AI. Describe your idea—get React code, live preview, and deploy.",
        publisher: { "@id": `${siteUrl}/#organization` },
        inLanguage: "en-US",
        potentialAction: {
          "@type": "SearchAction",
          target: { "@type": "EntryPoint", urlTemplate: `${siteUrl}/?q={search_term_string}` },
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": "SoftwareApplication",
        name: "BuildKit",
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Web",
        description: "AI-powered app builder. Generate React/TypeScript apps from a prompt, preview in-browser, deploy to Vercel or Netlify.",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        url: siteUrl,
      },
    ],
  }

  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Cal+Sans&family=Instrument+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={`${manrope.variable} font-sans antialiased bg-[#f5f5f2] text-[#1f1f1f] overflow-x-hidden`}>
        <AuthProvider>
          {children}
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  )
}

