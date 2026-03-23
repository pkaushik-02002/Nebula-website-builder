export const buildkitAgents = [
  {
    id: "guide",
    slug: "my-agent",
    name: "BuildKit agents",
    shortLabel: "agents",
    description: "Answers product, pricing, workflow, and launch questions using live BuildKit site context.",
    starterPrompt: "What can I build with BuildKit, and where should I start?",
  },
] as const

export type BuildkitAgentDefinition = (typeof buildkitAgents)[number]
