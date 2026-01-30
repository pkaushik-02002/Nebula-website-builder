import { Navbar } from "@/components/ui/navbar"
import { HeroSection } from "@/components/sections/hero-section"
import { ImpactSection } from "@/components/sections/impact-section"
import { FeaturesSection } from "@/components/sections/features-section"
import { TestimonialsSection } from "@/components/sections/testimonials-section"
import { PricingSection } from "@/components/sections/pricing-section"
import { CtaSection } from "@/components/sections/cta-section"
import { FooterSection } from "@/components/sections/footer-section"
import { LenisProvider } from "@/components/providers/lenis-provider"

export default function Home() {
  return (
    <LenisProvider>
      <main className="min-h-screen bg-zinc-950">
        <Navbar />
        <HeroSection />
        <ImpactSection />
        <FeaturesSection />
        <TestimonialsSection />
        <PricingSection />
        <CtaSection />
        <FooterSection />
      </main>
    </LenisProvider>
  )
}
