"use client"

import { COOKIE_PREFERENCES_EVENT } from "@/lib/cookie-policy"
import { cn } from "@/lib/utils"

type CookiePreferencesButtonProps = {
  children?: React.ReactNode
  className?: string
}

export function CookiePreferencesButton({
  children = "Cookie settings",
  className,
}: CookiePreferencesButtonProps) {
  return (
    <button
      type="button"
      className={cn(className)}
      onClick={() => {
        window.dispatchEvent(new Event(COOKIE_PREFERENCES_EVENT))
      }}
    >
      {children}
    </button>
  )
}
