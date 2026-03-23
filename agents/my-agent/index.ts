import { agent, tool } from "@21st-sdk/agent"
import { z } from "zod"

import { buildBuildKitAgentPrompt, getBuildKitKnowledge } from "@/lib/buildkit-site-content"

const knowledgeSections = [
  "overview",
  "features",
  "use-cases",
  "faq",
  "pricing",
  "testimonials",
  "all",
] as const

export default agent({
  model: "claude-sonnet-4-6",
  runtime: "claude-code",
  systemPrompt: buildBuildKitAgentPrompt(),
  permissionMode: "default",
  maxTurns: 12,
  tools: {
    lookupSiteContent: tool({
      description: "Retrieve grounded BuildKit website content by section before answering product questions.",
      inputSchema: z.object({
        section: z.enum(knowledgeSections).default("all"),
      }),
      execute: async ({ section }) => ({
        content: [{ type: "text", text: getBuildKitKnowledge(section) }],
      }),
    }),
  },
})
