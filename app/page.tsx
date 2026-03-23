import { Navbar } from "@/components/ui/navbar"
import { LenisProvider } from "@/components/providers/lenis-provider"
import { CreateAfterLogin } from "@/components/create-after-login"
import { FooterSection } from "@/components/sections/footer-section"
import { AnimatedAIInput } from "@/components/ui/animated-ai-input"
import { Blocks, ShieldCheck, Sparkles, Gauge } from "lucide-react"
import {
  buildkitFeatureItems,
  buildkitMetrics,
  buildkitTestimonials,
  buildkitUseCases,
} from "@/lib/buildkit-site-content"

const featureIcons = [Sparkles, Blocks, Gauge, ShieldCheck]

export default function Home() {
  return (
    <LenisProvider>
      <CreateAfterLogin />

      <main className="relative min-h-screen overflow-x-clip bg-[#f5f5f2] text-[#1f1f1f]">
        <Navbar />

        <section className="relative isolate min-h-screen overflow-hidden px-4 pt-28 pb-16 sm:px-6 sm:pt-32 lg:px-8">
          <div
            className="absolute inset-0 -z-30 scale-105"
            style={{
              backgroundImage: "url('/Images/golden-sunset.png')",
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
            }}
          />

          <div className="absolute inset-0 -z-20 bg-gradient-to-b from-black/40 via-black/20 to-black/60" />
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_20%,rgba(255,255,255,0.25),transparent_60%)]" />

          <div className="relative z-10 mx-auto flex min-h-[calc(100vh-7rem)] max-w-5xl items-center justify-center pb-20 text-center sm:pb-24">
            <div className="w-full">
              <h1 className="font-display text-5xl font-bold leading-[0.92] tracking-tight text-white sm:text-6xl md:text-7xl lg:text-[5.5rem]">
                Describe your idea.
                <span className="mt-2 block text-white/90">We build it.</span>
              </h1>

              <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-white/80 sm:text-lg md:text-xl">
                Turn your ideas into full-stack web applications with AI.
                Just describe what you want to build and watch it come to life.
              </p>

              <div className="mx-auto mt-10 flex max-w-3xl justify-center">
                <AnimatedAIInput />
              </div>
            </div>
          </div>
        </section>

        <section className="relative px-4 py-8 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl text-center">
            <p className="text-lg font-medium tracking-tight text-zinc-700 sm:text-xl">
              The fastest way for founders to turn intent into a live website.
            </p>
          </div>
        </section>

        <section id="features" className="relative px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {buildkitFeatureItems.map((item, idx) => {
              const Icon = featureIcons[idx] ?? Sparkles

              return (
                <article
                  key={item.title}
                  className={`rounded-3xl px-5 py-6 ${
                    idx % 2 === 0 ? "bg-[#ecece6]" : "bg-[#e8e7df]"
                  }`}
                >
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/70 text-zinc-700">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-zinc-900">{item.title}</h3>
                  <p className="mt-2 text-sm text-zinc-600">{item.description}</p>
                </article>
              )
            })}
          </div>
        </section>

        <section className="relative mt-6 bg-[linear-gradient(180deg,#ecece6_0%,#e6e5dd_100%)] px-4 py-12 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 text-center md:grid-cols-4">
            {buildkitMetrics.map((metric) => (
              <div key={metric.label}>
                <p className="font-display text-4xl font-bold text-zinc-900 sm:text-5xl">{metric.value}</p>
                <p className="mt-2 text-xs uppercase tracking-[0.14em] text-zinc-600">{metric.label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-[#ecece6] px-4 py-12 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-2 lg:grid-cols-3">
            {buildkitUseCases.map((useCase) => (
              <article key={useCase.title} className="rounded-2xl bg-white/70 p-6">
                <h3 className="text-lg font-semibold text-zinc-900">{useCase.title}</h3>
                <p className="mt-2 text-sm text-zinc-600">{useCase.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="testimonials" className="bg-[#ecece6] px-4 pb-16 pt-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="mb-6">
              <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Testimonials</p>
              <h2 className="mt-1 text-2xl font-semibold text-zinc-900 sm:text-3xl">Loved by builders</h2>
            </div>

            <div className="flex gap-4 overflow-x-auto pb-2 [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-300/80 hover:[&::-webkit-scrollbar-thumb]:bg-zinc-400/80">
              {buildkitTestimonials.map((testimonial, idx) => (
                <blockquote
                  key={idx}
                  className="w-[300px] shrink-0 rounded-2xl border border-zinc-200 bg-white/80 p-5"
                >
                  <p className="text-sm text-zinc-700">"{testimonial.text}"</p>
                  <footer className="mt-4">
                    <p className="text-sm font-medium text-zinc-900">{testimonial.name}</p>
                    <p className="text-xs text-zinc-500">{testimonial.role}</p>
                  </footer>
                </blockquote>
              ))}
            </div>
          </div>
        </section>
        <FooterSection />
      </main>
    </LenisProvider>
  )
}
