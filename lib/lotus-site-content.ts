import { DEFAULT_PLANS_FALLBACK, PLAN_DISPLAY } from "@/lib/plans"

export const lotusFeatureItems = [
  {
    title: "Prompt to Product",
    description: "Describe your idea and get a working website in seconds.",
  },
  {
    title: "Live Editing",
    description: "Refine sections instantly with guided, contextual updates.",
  },
  {
    title: "Fast Iteration",
    description: "Go from rough concept to polished launch-ready pages quickly.",
  },
  {
    title: "Production Quality",
    description: "Clean outputs designed for real companies and real customers.",
  },
] as const

export const lotusMetrics = [
  { value: "50K+", label: "Apps Built" },
  { value: "100M+", label: "Lines Generated" },
  { value: "<30s", label: "Average Build Time" },
  { value: "98%", label: "User Satisfaction" },
] as const

export const lotusUseCases = [
  {
    title: "SaaS Launch",
    description: "Create your homepage, pricing, and onboarding flow in one guided session.",
  },
  {
    title: "Client Prototyping",
    description: "Ship polished concept sites for clients without long design-engineering loops.",
  },
  {
    title: "Founder Validation",
    description: "Test ideas quickly with premium-looking websites built from plain language.",
  },
] as const

export const lotusTestimonials = [
  {
    text: "I built a complete SaaS dashboard in 30 minutes. What would have taken weeks was done in a single prompt session.",
    name: "Sarah Chen",
    role: "Indie Hacker",
  },
  {
    text: "lotus.build is like having a senior developer on demand. It understands exactly what I want to build.",
    name: "Marcus Johnson",
    role: "Startup Founder",
  },
  {
    text: "We use lotus.build to prototype client projects. It's 10x faster than our previous workflow.",
    name: "Emily Rodriguez",
    role: "Agency Owner",
  },
  {
    text: "As a non-developer, I finally built my dream app without getting blocked by complexity.",
    name: "David Park",
    role: "Product Designer",
  },
] as const

export const lotusFaqs = [
  {
    q: "How do I create a new project?",
    a: "From the home page, type your idea in the input and press Enter or click the build button. lotus.build generates a full-stack app from your description, then you can open the project to edit, preview, and deploy.",
  },
  {
    q: "What can I build with lotus.build?",
    a: "lotus.build helps people create websites and web applications including landing pages, dashboards, SaaS UIs, and e-commerce experiences from plain English prompts.",
  },
  {
    q: "How does the preview work?",
    a: "After generation, lotus.build spins up a secure sandbox and runs the project so the user gets a live preview URL. Environment variables added in integrations can be injected into the preview.",
  },
  {
    q: "How do I deploy my project?",
    a: "Users can connect Netlify for one-click deploys or sync to GitHub and deploy from the repository.",
  },
  {
    q: "What are tokens and how do I get more?",
    a: "Tokens power AI generations. The free plan includes a monthly allowance, and Pro or Team increase capacity and features.",
  },
  {
    q: "How do I share a project?",
    a: "Inside a project, users can share privately, by link, or publicly. Viewers can open the shared link, while edit permissions stay limited to owners and editors.",
  },
] as const

function serializePlanDetails() {
  return DEFAULT_PLANS_FALLBACK.map((plan) => {
    const display = PLAN_DISPLAY[plan.id as keyof typeof PLAN_DISPLAY]
    const price =
      plan.price === 0 ? "$0 forever" : `$${(plan.price / 100).toFixed(0)}/${plan.interval}`

    return [
      `${plan.name} (${plan.id})`,
      `price: ${price}`,
      `tokens per month: ${plan.tokensPerMonth.toLocaleString()}`,
      `description: ${display.description}`,
      `features: ${display.features.join(", ")}`,
    ].join("\n")
  }).join("\n\n")
}

export function getLotusKnowledge(section: "overview" | "features" | "use-cases" | "faq" | "pricing" | "testimonials" | "all" = "all") {
  const sections = {
    overview: [
      "lotus.build is an AI-powered full-stack website and web app builder.",
      "It helps founders, teams, and agencies go from idea to live site quickly.",
      "Core value proposition: describe your idea, generate a product, refine it live, preview it in a sandbox, and deploy it.",
    ].join("\n"),
    features: lotusFeatureItems
      .map((item) => `- ${item.title}: ${item.description}`)
      .join("\n"),
    "use-cases": lotusUseCases
      .map((item) => `- ${item.title}: ${item.description}`)
      .join("\n"),
    faq: lotusFaqs
      .map((item) => `Q: ${item.q}\nA: ${item.a}`)
      .join("\n\n"),
    pricing: serializePlanDetails(),
    testimonials: lotusTestimonials
      .map((item) => `- ${item.name}, ${item.role}: ${item.text}`)
      .join("\n"),
  }

  if (section === "all") {
    return Object.entries(sections)
      .map(([name, value]) => `## ${name}\n${value}`)
      .join("\n\n")
  }

  return sections[section]
}

export function buildLotusAgentPrompt() {
  return `You are Lotus Agent, an elite senior full-stack engineer and product designer at lotus.build. You build production-grade, enterprise-quality websites and web applications.

IDENTITY:
You are not a demo generator. You are not a prototype tool.
You produce real, shippable, professional-grade code that founders and companies can launch and be proud of.

ABSOLUTE STANDARDS — NON-NEGOTIABLE:
- Zero placeholder content. No "Lorem ipsum", no "Coming soon", no "Your text here", no fake team members, no dummy emails. Every piece of content must be real, contextual, and purposeful to the user's actual product.
- Zero AI slop aesthetics. No default purple-on-white gradients, no generic hero with a big button, no cookie-cutter layouts that look like every other AI-generated site.
- Production typography. Use Google Fonts with purpose — pair display fonts with body fonts, establish clear hierarchy, use proper line-heights and letter-spacing. Never default to just Inter alone.
- Real color systems. Build a deliberate palette: primary, secondary, accent, surface, muted. Use CSS custom properties. Apply semantic contrast (WCAG AA minimum).
- Component architecture. Split into logical, reusable components. No 500-line App.tsx monoliths.
- Responsive by default. Every layout works on 320px, 768px, 1280px, 1920px. Mobile-first Tailwind breakpoints throughout.
- Framer Motion animations that feel intentional — scroll reveals, staggered lists, hover states. Not gratuitous.
- Real navigation with working anchor links and smooth scroll.
- Accessible markup — semantic HTML5, ARIA labels where needed, keyboard navigation, focus states.

DESIGN PRINCIPLES:
- Study the user's product domain before designing. A bakery site needs warmth, serif fonts, food photography placeholders, earthy colors. A SaaS dashboard needs density, data clarity, monospace accents, professional blues. Match the domain.
- Whitespace is a design element. Use it generously.
- Every section must have a clear purpose and visual hierarchy.
- Micro-interactions on every interactive element.
- Use real industry-appropriate copy — not generic marketing speak. Write copy that sounds like the actual business.

CODE QUALITY:
- TypeScript strict mode throughout.
- Proper prop types and interfaces — no any.
- Custom hooks for stateful logic.
- Constants extracted from JSX.
- Error boundaries where appropriate.
- Performance: lazy load heavy components, memoize where needed.

SECTIONS TO ALWAYS CONSIDER (include what's relevant):
- Hero: bold, distinctive, immediately communicates the value
- Social proof / logos (if relevant to the domain)
- Features / how it works
- Pricing (if applicable)
- Testimonials with realistic, domain-appropriate quotes
- FAQ
- CTA section
- Footer with real nav links

WHAT YOU NEVER DO:
- Never output "TODO" or "placeholder" comments
- Never generate fake statistics unless specifically asked
- Never use stock photo URLs that don't exist
- Never create components you don't import
- Never import packages not in package.json
- Never produce layouts that look identical to other AI tools
- Never add a feature the user didn't ask for
- Never generate a wall of text hero section

You build websites that make users say "this looks like it was built by a real design agency." That is the bar.`
}
