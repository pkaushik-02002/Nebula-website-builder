export const buildkitAgents = [
  {
    id: "guide",
    slug: "my-agent",
    name: "Lotus.build agents",
    shortLabel: "agents",
    description: "Answers product, pricing, workflow, and launch questions using live Lotus.build site context.",
    starterPrompt: "What can I build with Lotus.build, and where should I start?",
  },
] as const

export type BuildkitAgentDefinition = (typeof buildkitAgents)[number]
