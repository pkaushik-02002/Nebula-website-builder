"use client"

import Link from "next/link"
import { Navbar } from "@/components/ui/navbar"
import { FooterSection } from "@/components/sections/footer-section"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { buildkitFaqs } from "@/lib/buildkit-site-content"
import {
  ArrowLeft,
  HelpCircle,
  BookOpen,
  Mail,
} from "lucide-react"

export default function HelpPage() {
  return (
    <main className="min-h-screen bg-[#f5f5f2]">
      <Navbar />
      <div className="safe-area-inset-top px-4 pt-24 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <Link
            href="/"
            className="mb-10 inline-flex items-center gap-2 text-sm text-zinc-500 transition-colors hover:text-zinc-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>

          <div className="mb-12 sm:mb-14">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-200 bg-white">
              <HelpCircle className="h-6 w-6 text-zinc-600" />
            </div>
            <h1 className="mb-2 font-display text-2xl font-bold text-zinc-900 sm:text-3xl md:text-4xl">
              Help & Support
            </h1>
            <p className="text-base text-zinc-500 sm:text-lg">
              Find answers to common questions and get in touch.
            </p>
          </div>

          <section className="mb-14 sm:mb-16">
            <h2 className="mb-6 font-heading text-lg font-semibold text-zinc-900">
              Frequently asked questions
            </h2>
            <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
              <Accordion type="single" collapsible className="w-full">
                {buildkitFaqs.map((faq, i) => (
                  <AccordionItem
                    key={i}
                    value={`faq-${i}`}
                    className="border-b border-zinc-200 px-4 last:border-b-0 sm:px-6"
                  >
                    <AccordionTrigger className="py-4 text-left text-sm font-medium text-zinc-900 hover:text-zinc-900 hover:no-underline sm:py-5 [&>svg]:text-zinc-500">
                      {faq.q}
                    </AccordionTrigger>
                    <AccordionContent className="pb-4 pt-0 text-sm text-zinc-500 sm:pb-5">
                      {faq.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2 sm:gap-6">
            <Link
              href="mailto:support@buildkit.example.com"
              className="group rounded-2xl border border-zinc-200 bg-white p-5 transition-colors hover:border-zinc-300 hover:bg-zinc-100 sm:p-6"
            >
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-300 bg-zinc-100 transition-colors group-hover:bg-zinc-700/50">
                  <Mail className="h-5 w-5 text-zinc-600" />
                </div>
                <h3 className="font-heading font-semibold text-zinc-900">Email support</h3>
              </div>
              <p className="text-sm text-zinc-500">
                Send us an email and we&apos;ll get back within 24 hours.
              </p>
            </Link>
            <Link
              href="/pricing"
              className="group rounded-2xl border border-zinc-200 bg-white p-5 transition-colors hover:border-zinc-300 hover:bg-zinc-100 sm:p-6"
            >
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-300 bg-zinc-100 transition-colors group-hover:bg-zinc-700/50">
                  <BookOpen className="h-5 w-5 text-zinc-600" />
                </div>
                <h3 className="font-heading font-semibold text-zinc-900">Plans & pricing</h3>
              </div>
              <p className="text-sm text-zinc-500">
                Compare plans and upgrade for more tokens and features.
              </p>
            </Link>
          </section>

          <div className="mt-10 text-center">
            <p className="mb-4 text-sm text-zinc-500">Need help with your account?</p>
            <Link href="/settings">
              <Button variant="outline" className="border-zinc-300 text-zinc-700 hover:bg-zinc-100">
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
