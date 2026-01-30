"use client"

import { motion } from "framer-motion"
import { Zap, BarChart3, Layers, ArrowRight, Command } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

const integrationLogos = [
  { name: "React" },
  { name: "Next.js" },
  { name: "Tailwind" },
  { name: "TypeScript" },
  { name: "Node.js" },
  { name: "PostgreSQL" },
  { name: "Firebase" },
  { name: "Vercel" },
]

export function FeaturesSection() {
  return (
    <section id="features" className="px-6 py-24">
      <div className="max-w-5xl mx-auto">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <p className="text-sm font-medium text-zinc-500 uppercase tracking-wider mb-4">Features</p>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-zinc-100 mb-4">
            AI-powered development
          </h2>
          <p className="text-zinc-500 max-w-xl mx-auto text-balance">
            Build complete applications with natural language. No coding required.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {/* Card 1 - Analytics (wider - 3 cols) */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="md:col-span-3"
          >
            <Card className="group h-full overflow-hidden border-zinc-800/50 bg-zinc-900/50 hover:border-zinc-700/50 transition-all duration-300 rounded-2xl">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-3">
                  <motion.div
                    className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center"
                    whileHover={{ rotate: [0, -10, 10, 0] }}
                    transition={{ duration: 0.5 }}
                  >
                    <BarChart3 className="w-5 h-5 text-zinc-400 group-hover:text-zinc-200 transition-colors" />
                  </motion.div>
                  <p className="font-heading font-semibold text-zinc-100">Live Preview</p>
                </div>
                <p className="text-zinc-500 text-sm mb-5">
                  Watch your app build in real-time with instant preview updates.
                </p>
                <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 overflow-hidden">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
                      <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
                      <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
                    </div>
                    <div className="flex items-center gap-3">
                      <motion.div
                        className="flex items-center gap-1.5"
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.5 }}
                      >
                        <div className="w-2 h-2 rounded-full bg-zinc-400" />
                        <span className="text-xs text-zinc-500">Users</span>
                      </motion.div>
                      <motion.div
                        className="flex items-center gap-1.5"
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.6 }}
                      >
                        <div className="w-2 h-2 rounded-full bg-zinc-600" />
                        <span className="text-xs text-zinc-500">Revenue</span>
                      </motion.div>
                    </div>
                  </div>
                  {/* Animated metrics row */}
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {[
                      { label: "Apps Built", value: "12.4K", change: "+12%" },
                      { label: "Lines Generated", value: "48.2M", change: "+8%" },
                      { label: "Success Rate", value: "98.2%", change: "+2%" },
                    ].map((metric, i) => (
                      <motion.div
                        key={metric.label}
                        className="bg-zinc-900/50 rounded-lg p-2.5"
                        initial={{ opacity: 0, y: 10 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.3 + i * 0.1 }}
                      >
                        <p className="text-zinc-500 text-xs mb-1">{metric.label}</p>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-zinc-100 font-semibold text-sm">{metric.value}</span>
                          <motion.span
                            className="text-zinc-400 text-xs"
                            animate={{ opacity: [0.5, 1, 0.5] }}
                            transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
                          >
                            {metric.change}
                          </motion.span>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                  {/* Animated bar chart */}
                  <div className="flex items-end gap-1.5 h-16">
                    {[35, 55, 40, 75, 50, 85, 60, 70, 45, 90, 65, 80].map((h, i) => (
                      <motion.div
                        key={i}
                        className="flex-1 bg-gradient-to-t from-zinc-700 to-zinc-500 rounded-sm origin-bottom"
                        initial={{ scaleY: 0 }}
                        whileInView={{ scaleY: h / 100 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: 0.5 + i * 0.04, ease: "easeOut" }}
                        whileHover={{ scaleY: 1, transition: { duration: 0.2 } }}
                      />
                    ))}
                  </div>
                  {/* Animated line underneath */}
                  <motion.div
                    className="h-px bg-gradient-to-r from-transparent via-zinc-600 to-transparent mt-3"
                    initial={{ scaleX: 0 }}
                    whileInView={{ scaleX: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 1, delay: 0.8 }}
                  />
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Card 2 - Performance (narrower - 2 cols) */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="md:col-span-2"
          >
            <Card className="group h-full overflow-hidden border-zinc-800/50 bg-zinc-900/50 hover:border-zinc-700/50 transition-all duration-300 rounded-2xl">
              <CardContent className="p-6 flex flex-col h-full">
                <div className="flex items-center gap-3 mb-3">
                  <motion.div
                    className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center"
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
                  >
                    <Zap className="w-5 h-5 text-zinc-400 group-hover:text-zinc-200 transition-colors" />
                  </motion.div>
                  <p className="font-heading font-semibold text-zinc-100">Instant Generation</p>
                </div>
                <p className="text-zinc-500 text-sm mb-5">Full-stack apps generated in seconds.</p>
                <div className="mt-auto">
                  <div className="flex items-baseline gap-2 mb-3">
                    <motion.span
                      className="text-4xl font-display font-bold text-zinc-100"
                      initial={{ opacity: 0 }}
                      whileInView={{ opacity: 1 }}
                      viewport={{ once: true }}
                    >
                      99.9%
                    </motion.span>
                    <span className="text-zinc-500 text-sm">accuracy</span>
                  </div>
                  <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-zinc-500 to-zinc-300 rounded-full"
                      initial={{ width: "0%" }}
                      whileInView={{ width: "99.9%" }}
                      viewport={{ once: true }}
                      transition={{ duration: 1.5, delay: 0.3, ease: "easeOut" }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Card 3 - Keyboard shortcuts (narrower - 2 cols) */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="md:col-span-2"
          >
            <Card className="group h-full overflow-hidden border-zinc-800/50 bg-zinc-900/50 hover:border-zinc-700/50 transition-all duration-300 rounded-2xl">
              <CardContent className="p-6 flex flex-col h-full">
                <div className="flex items-center gap-3 mb-3">
                  <motion.div
                    className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center"
                    whileHover={{ y: -2 }}
                  >
                    <Command className="w-5 h-5 text-zinc-400 group-hover:text-zinc-200 transition-colors" />
                  </motion.div>
                  <p className="font-heading font-semibold text-zinc-100">Chat Interface</p>
                </div>
                <p className="text-zinc-500 text-sm mb-5">Iterate on your app through natural conversation.</p>
                <div className="flex justify-center gap-2 mt-auto">
                  {["⌘", "K"].map((key, i) => (
                    <motion.div
                      key={key}
                      className="flex items-center justify-center w-12 h-12 rounded-xl bg-zinc-800/80 border border-zinc-700/50 shadow-lg"
                      initial={{ y: 0 }}
                      animate={{ y: [0, -4, 0] }}
                      transition={{
                        duration: 1.5,
                        delay: i * 0.15,
                        repeat: Number.POSITIVE_INFINITY,
                        repeatDelay: 2,
                      }}
                      whileHover={{ scale: 1.1, y: -4 }}
                    >
                      <span className="text-zinc-300 font-mono text-lg">{key}</span>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Card 4 - Integrations (wider - 3 cols) */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="md:col-span-3"
          >
            <Card className="group h-full overflow-hidden border-zinc-800/50 bg-zinc-900/50 hover:border-zinc-700/50 transition-all duration-300 rounded-2xl">
              <CardContent className="p-6 flex flex-col h-full">
                <div className="flex items-center gap-3 mb-3">
                  <motion.div
                    className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center"
                    whileHover={{ rotate: 180 }}
                    transition={{ duration: 0.4 }}
                  >
                    <Layers className="w-5 h-5 text-zinc-400 group-hover:text-zinc-200 transition-colors" />
                  </motion.div>
                  <p className="font-heading font-semibold text-zinc-100">Modern Stack</p>
                </div>
                <p className="text-zinc-500 text-sm mb-5">Built with the best frameworks and technologies.</p>
                <div className="grid grid-cols-8 gap-2 mt-auto">
                  {integrationLogos.map((logo, i) => (
                    <motion.div
                      key={logo.name}
                      initial={{ opacity: 0, y: 10 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.3, delay: 0.3 + i * 0.05 }}
                      whileHover={{ scale: 1.15, y: -2 }}
                      className="aspect-square rounded-lg border border-zinc-800 bg-zinc-800/50 flex items-center justify-center cursor-pointer"
                    >
                      <div className="w-5 h-5 rounded bg-zinc-700" />
                    </motion.div>
                  ))}
                </div>
                <motion.button
                  whileHover={{ x: 6 }}
                  className="mt-4 flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  View all technologies <ArrowRight className="w-4 h-4" />
                </motion.button>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
