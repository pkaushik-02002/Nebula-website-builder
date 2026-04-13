"use client"

import { motion } from "motion/react"
import { TestimonialsColumn } from "@/components/ui/testimonials-column"

const testimonials = [
  {
    text: "I built a complete SaaS dashboard in 30 minutes. What would have taken weeks of coding was done in a single prompt session.",
    name: "Sarah Chen",
    role: "Indie Hacker",
  },
  {
    text: "Lotus.build is like having a senior developer on demand. The AI understands exactly what I want to build.",
    name: "Marcus Johnson",
    role: "Startup Founder",
  },
  {
    text: "We use Lotus.build to prototype client projects. It's 10x faster than traditional development.",
    name: "Emily Rodriguez",
    role: "Agency Owner",
  },
  {
    text: "As a non-developer, I finally built my dream app. The AI handles all the technical complexity.",
    name: "David Park",
    role: "Product Designer",
  },
  {
    text: "The code quality is production-ready. I was able to deploy directly to Vercel without any changes.",
    name: "Aisha Patel",
    role: "Full-Stack Developer",
  },
  {
    text: "Lotus.build helped us validate 5 product ideas in a single week. It's a game-changer for MVPs.",
    name: "James Wilson",
    role: "CEO at LaunchPad",
  },
  {
    text: "The iterative chat interface makes it easy to refine and improve your app with each message.",
    name: "Lisa Thompson",
    role: "UX Engineer",
  },
  {
    text: "I migrated from another AI builder and the difference is night and day. Much better code output.",
    name: "Michael Brown",
    role: "Software Engineer",
  },
  {
    text: "Built our entire marketing site and admin panel in one afternoon. Absolutely incredible tool.",
    name: "Rachel Kim",
    role: "Marketing Director",
  },
]

const firstColumn = testimonials.slice(0, 3)
const secondColumn = testimonials.slice(3, 6)
const thirdColumn = testimonials.slice(6, 9)

const logos = ["Y Combinator", "Indie Hackers", "Product Hunt", "TechCrunch", "Hacker News", "GitHub"]

export function TestimonialsSection() {
  return (
    <section id="testimonials" className="px-4 py-20 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-6xl rounded-[2rem] border border-zinc-200 bg-white px-5 py-10 sm:px-8 sm:py-12 lg:px-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          viewport={{ once: true }}
          className="flex flex-col items-center justify-center max-w-xl mx-auto mb-12"
        >
          <div className="border border-zinc-200 py-1.5 px-4 rounded-full text-sm text-zinc-600">Testimonials</div>

          <h2 className="font-display text-4xl md:text-5xl font-bold text-zinc-900 mt-6 text-center tracking-tight">
            Loved by builders
          </h2>
          <p className="text-center mt-4 text-zinc-500 text-lg text-balance">
            Join thousands of developers and creators building with AI.
          </p>
        </motion.div>

        <div className="flex justify-center gap-4 sm:gap-6  max-h-[680px] sm:max-h-[740px] overflow-hidden">
          <TestimonialsColumn testimonials={firstColumn} duration={15} />
          <TestimonialsColumn testimonials={secondColumn} className="hidden md:block" duration={19} />
          <TestimonialsColumn testimonials={thirdColumn} className="hidden lg:block" duration={17} />
        </div>

        <div className="mt-14 border-t border-zinc-200 pt-12 sm:mt-16 sm:pt-16">
          <p className="text-center text-sm text-zinc-500 mb-8">Trusted by industry leaders</p>
          <div className="relative overflow-hidden ">
            <motion.div
              className="flex gap-12 md:gap-16"
              animate={{
                x: ["0%", "-50%"],
              }}
              transition={{
                x: {
                  duration: 20,
                  repeat: Number.POSITIVE_INFINITY,
                  ease: "linear",
                },
              }}
            >
              {/* Duplicate logos for seamless loop */}
              {[...logos, ...logos].map((logo, index) => (
                <span
                  key={`${logo}-${index}`}
                  className="text-xl font-semibold text-zinc-700 whitespace-nowrap flex-shrink-0"
                >
                  {logo}
                </span>
              ))}
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  )
}


