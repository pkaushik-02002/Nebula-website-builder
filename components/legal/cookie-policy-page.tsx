import { FooterSection } from "@/components/sections/footer-section"
import { Navbar } from "@/components/ui/navbar"
import { CookiePreferencesButton } from "@/components/legal/cookie-preferences-button"
import {
  COOKIE_CATEGORIES,
  COOKIE_POLICY_HIGHLIGHTS,
  COOKIE_POLICY_LAST_UPDATED,
  COOKIE_TECHNOLOGIES,
} from "@/lib/cookie-policy"

export function CookiePolicyPage() {
  return (
    <main className="min-h-screen bg-[#f5f5f2]">
      <Navbar />
      <div className="safe-area-inset-top px-4 pb-16 pt-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-3xl">
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-zinc-500">
              Cookie Policy
            </p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl lg:text-5xl">
              How lotus.build uses cookies and browser storage
            </h1>
            <p className="mt-4 text-base leading-relaxed text-zinc-600 sm:text-lg">
              This page lists the storage and access technologies currently used by lotus.build across the
              public site and builder flows. Essential technologies stay active because the product relies on
              them. Optional analytics remains off until you choose otherwise.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-zinc-500">
              <span className="rounded-full border border-zinc-200 bg-white px-3 py-1.5">
                Last updated {COOKIE_POLICY_LAST_UPDATED}
              </span>
              <CookiePreferencesButton className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 transition-colors hover:border-zinc-300 hover:text-zinc-700">
                Cookie settings
              </CookiePreferencesButton>
            </div>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {COOKIE_POLICY_HIGHLIGHTS.map((highlight) => (
              <div
                key={highlight.label}
                className="rounded-[1.5rem] border border-zinc-200 bg-white p-5 shadow-[0_18px_45px_-35px_rgba(0,0,0,0.35)]"
              >
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
                  {highlight.label}
                </p>
                <p className="mt-3 text-sm leading-6 text-zinc-700">{highlight.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-12 grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start">
            <aside className="lg:sticky lg:top-24">
              <div className="rounded-[1.75rem] border border-zinc-200 bg-white p-5 shadow-[0_16px_50px_-36px_rgba(0,0,0,0.4)]">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
                  On this page
                </p>
                <nav className="mt-4 space-y-1.5">
                  <a
                    href="#controls"
                    className="block rounded-xl px-3 py-2 text-sm text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
                  >
                    Controls
                  </a>
                  <a
                    href="#categories"
                    className="block rounded-xl px-3 py-2 text-sm text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
                  >
                    Categories
                  </a>
                  <a
                    href="#register"
                    className="block rounded-xl px-3 py-2 text-sm text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
                  >
                    Technology register
                  </a>
                </nav>
              </div>
            </aside>

            <article className="space-y-8">
              <section
                id="controls"
                className="scroll-mt-28 rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-[0_20px_70px_-40px_rgba(0,0,0,0.45)] sm:p-8"
              >
                <h2 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
                  How the controls work
                </h2>
                <div className="mt-4 space-y-4 text-sm leading-7 text-zinc-600 sm:text-[15px]">
                  <p>
                    lotus.build presents equal first-layer choices to reject optional analytics or allow it.
                    Essential storage stays on because the site needs it for sign-in, builder continuity, and
                    remembering your privacy choice.
                  </p>
                  <p>
                    You can reopen cookie settings at any time from the footer or this page. If you later turn
                    analytics off, lotus.build refreshes the page so optional measurement stops for subsequent
                    navigation.
                  </p>
                  <p>
                    lotus.build does not currently use advertising cookies, retargeting tags, or cross-site
                    marketing pixels in the current web application codebase.
                  </p>
                </div>
              </section>

              <section
                id="categories"
                className="scroll-mt-28 rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-[0_20px_70px_-40px_rgba(0,0,0,0.45)] sm:p-8"
              >
                <h2 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
                  Categories used on this site
                </h2>
                <div className="mt-6 grid gap-4">
                  {COOKIE_CATEGORIES.map((category) => {
                    const technologies = COOKIE_TECHNOLOGIES.filter(
                      (technology) => technology.category === category.key
                    )

                    return (
                      <div
                        key={category.key}
                        className="rounded-[1.5rem] border border-zinc-200 bg-[#fcfcfa] p-5"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="max-w-2xl">
                            <h3 className="text-base font-semibold text-zinc-900">{category.title}</h3>
                            <p className="mt-2 text-sm leading-6 text-zinc-600">{category.description}</p>
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs text-zinc-500">
                            <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1">
                              {category.required ? "Always active" : "Optional"}
                            </span>
                            <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1">
                              {technologies.length} item{technologies.length === 1 ? "" : "s"}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>

              <section
                id="register"
                className="scroll-mt-28 rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-[0_20px_70px_-40px_rgba(0,0,0,0.45)] sm:p-8"
              >
                <h2 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
                  Current technology register
                </h2>
                <p className="mt-3 text-sm leading-6 text-zinc-600 sm:text-[15px]">
                  This register is generated from the shared cookie policy configuration used by the banner,
                  preferences dialog, and footer controls.
                </p>

                <div className="mt-6 overflow-hidden rounded-[1.5rem] border border-zinc-200">
                  <div className="hidden grid-cols-[1.2fr_0.9fr_1fr_0.95fr_1.6fr] gap-4 bg-[#f7f6f1] px-5 py-3 text-xs font-medium uppercase tracking-[0.16em] text-zinc-500 md:grid">
                    <div>Name</div>
                    <div>Category</div>
                    <div>Type</div>
                    <div>Duration</div>
                    <div>Purpose</div>
                  </div>

                  <div className="divide-y divide-zinc-200">
                    {COOKIE_TECHNOLOGIES.map((technology) => (
                      <div
                        key={technology.id}
                        className="grid gap-4 px-5 py-4 md:grid-cols-[1.2fr_0.9fr_1fr_0.95fr_1.6fr]"
                      >
                        <div>
                          <p className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500 md:hidden">
                            Name
                          </p>
                          <p className="mt-1 text-sm font-semibold text-zinc-900 md:mt-0">
                            {technology.name}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-zinc-500">
                            Provider: {technology.provider}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500 md:hidden">
                            Category
                          </p>
                          <p className="mt-1 text-sm text-zinc-700 md:mt-0">
                            {COOKIE_CATEGORIES.find((category) => category.key === technology.category)?.title}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500 md:hidden">
                            Type
                          </p>
                          <p className="mt-1 text-sm text-zinc-700 md:mt-0">{technology.storageType}</p>
                        </div>

                        <div>
                          <p className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500 md:hidden">
                            Duration
                          </p>
                          <p className="mt-1 text-sm text-zinc-700 md:mt-0">{technology.duration}</p>
                        </div>

                        <div>
                          <p className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500 md:hidden">
                            Purpose
                          </p>
                          <p className="mt-1 text-sm leading-6 text-zinc-700 md:mt-0">
                            {technology.purpose}
                          </p>
                          <p className="mt-2 text-xs leading-5 text-zinc-500">{technology.condition}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </article>
          </div>
        </div>
      </div>
      <FooterSection />
    </main>
  )
}
