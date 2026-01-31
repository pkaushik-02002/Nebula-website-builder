"use client"

import Link from "next/link"
import { Navbar } from "@/components/ui/navbar"
import { FooterSection } from "@/components/sections/footer-section"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import {
  ArrowLeft,
  HelpCircle,
  MessageCircle,
  BookOpen,
  Mail,
  ChevronDown,
} from "lucide-react"
import { cn } from "@/lib/utils"

const faqs = [
  {
    q: "How do I create a new project?",
    a: "From the home page, type your idea in the input and press Enter or click the build button. We'll generate a full-stack app based on your description. You can then open the project to edit, preview, and deploy.",
  },
  {
    q: "What can I build with Builder Studio?",
    a: "You can build web applications: landing pages, dashboards, SaaS UIs, e-commerce stores, and more. Describe what you want in plain English and the AI generates React/Next.js or Vite-based code with styling and structure.",
  },
  {
    q: "How does the preview work?",
    a: "After generation, we spin up a secure sandbox and run your project. You get a live URL to view the app. Env vars you add in Integrations → Vars are injected into the preview so API keys work.",
  },
  {
    q: "How do I deploy my project?",
    a: "Connect Netlify from the Integrations panel and use Deploy to Netlify for a one-click deploy. You can also sync to GitHub and deploy from your repo.",
  },
  {
    q: "What are tokens and how do I get more?",
    a: "Tokens are used for AI generations. Free plans include a monthly allowance. Use Settings to see your usage and upgrade to Pro or Team for more tokens and features.",
  },
  {
    q: "How do I share a project?",
    a: "Open a project and click Share. You can set visibility to Private, Link only, or Public. Anyone with the link can view; only owners and editors can edit. Changes sync in real time.",
  },
]

export default function HelpPage() {
  return (
    <main className="min-h-screen bg-zinc-950">
      <Navbar />
      <div className="pt-24 pb-16 px-4 sm:px-6 lg:px-8 safe-area-inset-top">
        <div className="max-w-3xl mx-auto">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-10"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </Link>

          <div className="mb-12 sm:mb-14">
            <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4">
              <HelpCircle className="w-6 h-6 text-zinc-400" />
            </div>
            <h1 className="font-display text-2xl sm:text-3xl md:text-4xl font-bold text-zinc-100 mb-2">
              Help & Support
            </h1>
            <p className="text-zinc-500 text-base sm:text-lg">
              Find answers to common questions and get in touch.
            </p>
          </div>

          {/* FAQ */}
          <section className="mb-14 sm:mb-16">
            <h2 className="font-heading text-lg font-semibold text-zinc-100 mb-6">Frequently asked questions</h2>
            <div className="rounded-2xl border border-zinc-800/50 bg-zinc-900/50 overflow-hidden">
              <Accordion type="single" collapsible className="w-full">
                {faqs.map((faq, i) => (
                  <AccordionItem
                    key={i}
                    value={`faq-${i}`}
                    className="border-b border-zinc-800/50 last:border-b-0 px-4 sm:px-6"
                  >
                    <AccordionTrigger className="py-4 sm:py-5 text-left text-sm font-medium text-zinc-100 hover:text-zinc-100 hover:no-underline [&>svg]:text-zinc-500">
                      {faq.q}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-zinc-500 pb-4 sm:pb-5 pt-0">
                      {faq.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </section>

          {/* Contact & resources */}
          <section className="grid sm:grid-cols-2 gap-4 sm:gap-6">
            <Link
              href="mailto:support@builderstudio.example.com"
              className="rounded-2xl border border-zinc-800/50 bg-zinc-900/50 p-5 sm:p-6 hover:bg-zinc-800/50 hover:border-zinc-700/50 transition-colors group"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700/50 flex items-center justify-center group-hover:bg-zinc-700/50 transition-colors">
                  <Mail className="w-5 h-5 text-zinc-400" />
                </div>
                <h3 className="font-heading font-semibold text-zinc-100">Email support</h3>
              </div>
              <p className="text-sm text-zinc-500">
                Send us an email and we&apos;ll get back within 24 hours.
              </p>
            </Link>
            <Link
              href="/pricing"
              className="rounded-2xl border border-zinc-800/50 bg-zinc-900/50 p-5 sm:p-6 hover:bg-zinc-800/50 hover:border-zinc-700/50 transition-colors group"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700/50 flex items-center justify-center group-hover:bg-zinc-700/50 transition-colors">
                  <BookOpen className="w-5 h-5 text-zinc-400" />
                </div>
                <h3 className="font-heading font-semibold text-zinc-100">Plans & pricing</h3>
              </div>
              <p className="text-sm text-zinc-500">
                Compare plans and upgrade for more tokens and features.
              </p>
            </Link>
          </section>

          <div className="mt-10 text-center">
            <p className="text-sm text-zinc-500 mb-4">Need help with your account?</p>
            <Link href="/settings">
              <Button variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800">
                Open Settings
              </Button>
            </Link>
          </div>
        </div>
      </div>
      <FooterSection />
    </main>
  )
}
