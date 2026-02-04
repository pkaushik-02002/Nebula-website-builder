import { Navbar } from "@/components/ui/navbar"
import { HeroSection } from "@/components/sections/hero-section"
import { ImpactSection } from "@/components/sections/impact-section"
import { TestimonialsSection } from "@/components/sections/testimonials-section"
import { CtaSection } from "@/components/sections/cta-section"
import { FooterSection } from "@/components/sections/footer-section"
import { LenisProvider } from "@/components/providers/lenis-provider"
import { CreateAfterLogin } from "@/components/create-after-login"

export default function Home() {
  return (
    <LenisProvider>
      <CreateAfterLogin />
      <main className="min-h-screen bg-zinc-950">
        <Navbar />
        <HeroSection />
        <ImpactSection />
        <TestimonialsSection />
        <CtaSection />
        <FooterSection />
      </main>
    </LenisProvider>
  )
}
