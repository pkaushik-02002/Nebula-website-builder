import Link from "next/link"
import { FooterSection } from "@/components/sections/footer-section"
import { Navbar } from "@/components/ui/navbar"
import {
  LEGAL_CONTACT_EMAIL,
  LEGAL_CONTACT_HREF,
  type LegalDocument,
} from "@/lib/legal-content"

type LegalPageProps = {
  document: LegalDocument
}

export function LegalPage({ document }: LegalPageProps) {
  return (
    <main className="min-h-screen bg-[#f5f5f2]">
      <Navbar />
      <div className="safe-area-inset-top px-4 pb-16 pt-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-3xl">
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-zinc-500">
              {document.eyebrow}
            </p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl lg:text-5xl">
              {document.title}
            </h1>
            <p className="mt-4 text-base leading-relaxed text-zinc-600 sm:text-lg">
              {document.description}
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-zinc-500">
              <span className="rounded-full border border-zinc-200 bg-white px-3 py-1.5">
                Last updated {document.lastUpdated}
              </span>
              <Link
                href={LEGAL_CONTACT_HREF}
                className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 transition-colors hover:border-zinc-300 hover:text-zinc-700"
              >
                {LEGAL_CONTACT_EMAIL}
              </Link>
            </div>
          </div>

          <div className="mt-12 grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start">
            <aside className="lg:sticky lg:top-24">
              <div className="rounded-[1.75rem] border border-zinc-200 bg-white p-5 shadow-[0_16px_50px_-36px_rgba(0,0,0,0.4)]">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
                  On this page
                </p>
                <nav className="mt-4 space-y-1.5">
                  {document.sections.map((section) => (
                    <a
                      key={section.id}
                      href={`#${section.id}`}
                      className="block rounded-xl px-3 py-2 text-sm text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
                    >
                      {section.title}
                    </a>
                  ))}
                </nav>
              </div>
            </aside>

            <article className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-[0_20px_70px_-40px_rgba(0,0,0,0.45)] sm:p-8 lg:p-10">
              {document.sections.map((section, index) => (
                <section
                  key={section.id}
                  id={section.id}
                  className={index === 0 ? "scroll-mt-28" : "scroll-mt-28 border-t border-zinc-200 pt-8"}
                >
                  <h2 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
                    {section.title}
                  </h2>
                  <div className="mt-4 space-y-4">
                    {section.paragraphs.map((paragraph) => (
                      <p
                        key={paragraph}
                        className="text-sm leading-7 text-zinc-600 sm:text-[15px]"
                      >
                        {paragraph}
                      </p>
                    ))}
                  </div>
                  {section.bullets?.length ? (
                    <ul className="mt-5 space-y-3 text-sm leading-7 text-zinc-600 sm:text-[15px]">
                      {section.bullets.map((bullet) => (
                        <li key={bullet} className="flex gap-3">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-400" />
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              ))}
            </article>
          </div>
        </div>
      </div>
      <FooterSection />
    </main>
  )
}
