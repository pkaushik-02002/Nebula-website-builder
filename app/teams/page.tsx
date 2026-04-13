import type { Metadata } from "next"
import Link from "next/link"
import { Navbar } from "@/components/ui/navbar"
import { FooterSection } from "@/components/sections/footer-section"
import { Users, History, ShieldCheck, LayoutGrid, Sparkles, ArrowRight, CheckCircle2 } from "lucide-react"

export const metadata: Metadata = {
  title: "Teams | Lotus.build",
  description:
    "Built for teams and growing startups. Collaborate, iterate, and launch company websites together with shared workspaces and reliable previews.",
}

const collaborationBenefits = [
  {
    icon: Users,
    title: "Shared workspaces",
    description: "Keep design, product, and marketing aligned in one collaborative website workflow.",
  },
  {
    icon: History,
    title: "Version history",
    description: "Track website build iterations and move confidently through edits and improvements.",
  },
  {
    icon: ShieldCheck,
    title: "Roles and access",
    description: "Use simple team roles and permissions so the right people can edit and review.",
  },
  {
    icon: LayoutGrid,
    title: "Multi-project dashboards",
    description: "Manage multiple websites at once with a clear view of project progress and status.",
  },
]

const howTeamsWork = [
  {
    title: "Invite teammates",
    description: "Bring collaborators into shared workspaces and coordinate website updates together.",
  },
  {
    title: "Shared prompts and templates",
    description: "Reuse winning prompts and website patterns so teams can move faster across projects.",
  },
  {
    title: "Unified project feed",
    description: "See updates and activity in one place to keep launches on track.",
  },
]

const testimonials = [
  {
    quote: "Our whole team now ships website updates in hours, not weeks.",
    name: "Growth Lead, Seed-stage SaaS",
  },
  {
    quote: "Lotus.build helped us standardize how product and marketing collaborate.",
    name: "Head of Product, Startup Team",
  },
  {
    quote: "The shared workflow made launches more consistent across every project.",
    name: "Marketing Manager, Growth Team",
  },
]

export default function TeamsPage() {
  return (
    <main className="min-h-screen bg-[#f5f5f2] text-[#1f1f1f]">
      <Navbar />

      <section className="px-4 pb-16 pt-28 sm:px-6 sm:pb-20 sm:pt-32 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Teams</p>
          <h1 className="mt-4 max-w-5xl font-display text-4xl font-bold leading-tight tracking-tight text-zinc-900 sm:text-5xl md:text-6xl lg:text-7xl">
            Built for Teams and Growing Startups
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-relaxed text-zinc-600 sm:text-lg">
            Collaborate, iterate, and launch company websites together with shared context, faster feedback loops, and consistent output quality.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/projects"
              className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-zinc-900 px-6 text-sm font-medium text-white transition-colors hover:bg-black"
            >
              Start Building
            </Link>
            <Link
              href="/help"
              className="inline-flex min-h-[48px] items-center justify-center rounded-full border border-zinc-300 bg-white px-6 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100"
            >
              See How It Works
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-[#efefe9] px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">Team collaboration benefits</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {collaborationBenefits.map((benefit) => {
              const Icon = benefit.icon
              return (
                <article key={benefit.title}>
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-zinc-700">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-zinc-900">{benefit.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-600">{benefit.description}</p>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      <section className="px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">Scaling & reliability</h2>
          <p className="mt-4 max-w-4xl text-sm leading-relaxed text-zinc-600 sm:text-base">
            Lotus.build supports teams managing multiple websites and internal previews at once. As projects grow, updates stay smooth with reliable preview recovery that keeps teams moving without disruption.
          </p>
          <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-100 px-4 py-2 text-sm text-zinc-700">
            <Sparkles className="h-4 w-4" />
            Preview environments recover automatically when needed.
          </div>
        </div>
      </section>

      <section className="bg-[#efefe9] px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">How teams work together</h2>
          <div className="mt-8 grid gap-8 md:grid-cols-3">
            {howTeamsWork.map((item) => (
              <article key={item.title}>
                <h3 className="text-lg font-semibold text-zinc-900">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">{item.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">Growing teams already shipping with Lotus.build</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {testimonials.map((item) => (
              <blockquote key={item.name} className="rounded-2xl border border-zinc-200 bg-white/75 p-5">
                <p className="text-sm leading-relaxed text-zinc-700">"{item.quote}"</p>
                <footer className="mt-4 text-xs text-zinc-500">{item.name}</footer>
              </blockquote>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#efefe9] px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-5xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
            Ready to build with your team?
          </h2>
          <p className="mx-auto mt-4 max-w-3xl text-sm leading-relaxed text-zinc-600 sm:text-base">
            Start your next website project with shared workflows built for fast-moving teams.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/projects"
              className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-zinc-900 px-6 text-sm font-medium text-white transition-colors hover:bg-black"
            >
              Try with Your Team
            </Link>
            <Link
              href="/pricing"
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full border border-zinc-300 bg-white px-6 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100"
            >
              Start Your Project
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <FooterSection />
    </main>
  )
}

