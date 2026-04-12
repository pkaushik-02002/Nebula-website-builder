"use client"

import { useState, useEffect, useRef } from "react"

/**
 * Typewriter hook — streams a string character by character.
 *
 * Behaviour:
 * - Resets immediately when text becomes empty
 * - Continues from current position when text grows (same prefix)
 * - Resets and re-animates when text changes to something completely different
 * - When active=false, returns the full target text immediately (no animation)
 *
 * @param text   Target string to type towards
 * @param speed  Milliseconds per character (default 18ms)
 * @param active When false, snaps to full text without animating (default true)
 */
export function useTypewriter(text: string, speed = 18, active = true): string {
  const [displayed, setDisplayed] = useState("")
  const posRef = useRef(0)
  const prevTextRef = useRef("")

  useEffect(() => {
    // Inactive mode: immediately show full text, keep refs in sync
    if (!active) {
      setDisplayed(text)
      posRef.current = text.length
      prevTextRef.current = text
      return
    }

    const prev = prevTextRef.current
    prevTextRef.current = text

    // Empty string → reset
    if (!text) {
      posRef.current = 0
      setDisplayed("")
      return
    }

    // Completely new text (not a continuation of prev) → restart from 0
    if (prev && !text.startsWith(prev)) {
      posRef.current = 0
    }

    // Already typed to the end → snap to final
    if (posRef.current >= text.length) {
      setDisplayed(text)
      return
    }

    const id = setInterval(() => {
      posRef.current += 1
      setDisplayed(text.slice(0, posRef.current))
      if (posRef.current >= text.length) {
        clearInterval(id)
      }
    }, speed)

    return () => clearInterval(id)
  }, [text, speed, active])

  return active ? displayed : text
}
