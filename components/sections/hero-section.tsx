"use client"

import { Sparkles } from "lucide-react"
import { AnimatedAIInput } from "@/components/ui/animated-ai-input"
import { PromptSuggestion } from "@/components/prompt-kit/prompt-suggestion"

export function HeroSection() {
  // Function to set input value and focus the textarea
  const handleSuggestionClick = (suggestion: string) => {
    // Find the textarea element and set its value
    setTimeout(() => {
      const textarea = document.querySelector('#ai-input-hero') as HTMLTextAreaElement
      if (textarea) {
        textarea.value = suggestion
        textarea.focus()
        // Trigger the input event to update the AnimatedAIInput component
        const event = new Event('input', { bubbles: true })
        textarea.dispatchEvent(event)
      }
    }, 100)
  }

  const suggestions = [
    "Build a SaaS landing page",
    "Task management app",
    "E-commerce store",
    "Blog with markdown",
  ]

  return (
    <section className="min-h-screen flex flex-col items-center justify-center px-6 pt-24 pb-20 relative">
      {/* Background gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-zinc-900/50 via-transparent to-transparent" />

      {/* Content */}
      <div className="relative z-10 text-center max-w-3xl mx-auto flex flex-col items-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-900/80 border border-zinc-800 mb-8">
          <Sparkles className="w-4 h-4 text-zinc-400" />
          <span className="text-sm text-zinc-400">AI powered full-stack application builder </span>
        </div>

        {/* Headline */}
        <h1 className="font-display text-5xl md:text-7xl font-bold tracking-tight mb-6">
          <span className="text-zinc-100 block">Describe your idea.</span>
          <span className="bg-gradient-to-r from-zinc-500 via-zinc-300 to-zinc-500 bg-clip-text text-transparent">
            We build it.
          </span>
        </h1>

        {/* Subheadline */}
        <p className="text-lg md:text-xl text-zinc-500 max-w-2xl mx-auto mb-8 leading-relaxed text-balance">
          Turn your ideas into full-stack web applications with AI. Just describe what you want to build and watch your
          app come to life in seconds.
        </p>

        {/* AI Input CTA */}
        <AnimatedAIInput />

        {/* Prompt Suggestions */}
        <div className="mt-6 w-full max-w-3xl">
          <div className="flex flex-row flex-nowrap items-center justify-center gap-2 overflow-x-auto pb-2 scrollbar-hidden">
            {suggestions.map((suggestion, index) => (
              <PromptSuggestion
                key={index}
                onClick={() => handleSuggestionClick(suggestion)}
                className="shrink-0"
              >
                {suggestion}
              </PromptSuggestion>
            ))}
          </div>
        </div>

        {/* Social proof */}
        <div className="mt-16 flex flex-col sm:flex-row items-center justify-center gap-4">
          
        </div>
      </div>
    </section>
  )
}
