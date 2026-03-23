import { DEFAULT_PLANS_FALLBACK, PLAN_DISPLAY } from "@/lib/plans"

export const buildkitFeatureItems = [
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

export const buildkitMetrics = [
  { value: "50K+", label: "Apps Built" },
  { value: "100M+", label: "Lines Generated" },
  { value: "<30s", label: "Average Build Time" },
  { value: "98%", label: "User Satisfaction" },
] as const

export const buildkitUseCases = [
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

export const buildkitTestimonials = [
  {
    text: "I built a complete SaaS dashboard in 30 minutes. What would have taken weeks was done in a single prompt session.",
    name: "Sarah Chen",
    role: "Indie Hacker",
  },
  {
    text: "BuildKit is like having a senior developer on demand. It understands exactly what I want to build.",
    name: "Marcus Johnson",
    role: "Startup Founder",
  },
  {
    text: "We use BuildKit to prototype client projects. It's 10x faster than our previous workflow.",
    name: "Emily Rodriguez",
    role: "Agency Owner",
  },
  {
    text: "As a non-developer, I finally built my dream app without getting blocked by complexity.",
    name: "David Park",
    role: "Product Designer",
  },
] as const

export const buildkitFaqs = [
  {
    q: "How do I create a new project?",
    a: "From the home page, type your idea in the input and press Enter or click the build button. BuildKit generates a full-stack app from your description, then you can open the project to edit, preview, and deploy.",
  },
  {
    q: "What can I build with BuildKit?",
    a: "BuildKit helps people create websites and web applications including landing pages, dashboards, SaaS UIs, and e-commerce experiences from plain English prompts.",
  },
  {
    q: "How does the preview work?",
    a: "After generation, BuildKit spins up a secure sandbox and runs the project so the user gets a live preview URL. Environment variables added in integrations can be injected into the preview.",
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

export function getBuildKitKnowledge(section: "overview" | "features" | "use-cases" | "faq" | "pricing" | "testimonials" | "all" = "all") {
  const sections = {
    overview: [
      "BuildKit is an AI-powered full-stack website and web app builder.",
      "It helps founders, teams, and agencies go from idea to live site quickly.",
      "Core value proposition: describe your idea, generate a product, refine it live, preview it in a sandbox, and deploy it.",
    ].join("\n"),
    features: buildkitFeatureItems
      .map((item) => `- ${item.title}: ${item.description}`)
      .join("\n"),
    "use-cases": buildkitUseCases
      .map((item) => `- ${item.title}: ${item.description}`)
      .join("\n"),
    faq: buildkitFaqs
      .map((item) => `Q: ${item.q}\nA: ${item.a}`)
      .join("\n\n"),
    pricing: serializePlanDetails(),
    testimonials: buildkitTestimonials
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

export function buildBuildKitAgentPrompt() {
  return [
    "You are My Agent, the BuildKit website assistant.",
    "Your job is to help visitors understand BuildKit, choose the right plan, learn how the workflow works, and take the next best action inside the site.",
    "Answer using only the BuildKit knowledge you have been given and the output of your tools.",
    "If you are unsure, say so clearly and route the visitor to the most relevant page.",
    "Do not invent pricing, integrations, timelines, or guarantees.",
    "Keep responses concise, friendly, and helpful for non-technical visitors.",
    "Prefer guiding users toward concrete actions such as starting a project, opening pricing, viewing help, logging in, or opening settings.",
    "",
    "Current website knowledge:",
    getBuildKitKnowledge("all"),
  ].join("\n")
}
