"use client"

import { Analytics } from "@vercel/analytics/react"
import { usePathname } from "next/navigation"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import {
  COOKIE_CATEGORIES,
  COOKIE_CONSENT_COOKIE_NAME,
  COOKIE_CONSENT_RETENTION_LABEL,
  COOKIE_PREFERENCES_EVENT,
  COOKIE_TECHNOLOGIES,
  buildConsentCookie,
  createCookieConsentRecord,
  parseCookieConsent,
  readCookieValue,
  type CookieConsentCategories,
  type CookieConsentRecord,
} from "@/lib/cookie-policy"

type CookieConsentContextValue = {
  ready: boolean
  consent: CookieConsentRecord | null
  analyticsEnabled: boolean
  openPreferences: () => void
}

const CookieConsentContext = createContext<CookieConsentContextValue | null>(null)
const COOKIE_BANNER_HIDDEN_ROUTE_PATTERN = /^\/(?:project|computer)\/[^/]+$/

function shouldHideCookieBanner(pathname: string | null) {
  return Boolean(pathname && COOKIE_BANNER_HIDDEN_ROUTE_PATTERN.test(pathname))
}

function sanitizeAnalyticsUrl(url: string) {
  try {
    const parsed = new URL(url, window.location.origin)
    parsed.search = ""
    return parsed.toString()
  } catch {
    return url.split("?")[0] ?? url
  }
}

function CookieConsentBanner(props: {
  onReject: () => void
  onAllowAnalytics: () => void
  onOpenPreferences: () => void
}) {
  return (
    <section className="pointer-events-none fixed inset-x-0 bottom-0 z-50 px-4 pb-4 sm:px-6 lg:px-8">
      <div className="pointer-events-auto mx-auto max-w-5xl rounded-[1.75rem] border border-zinc-200 bg-[rgba(255,255,252,0.97)] shadow-[0_30px_90px_-50px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
              Privacy choices
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
              Essential storage keeps lotus.build working. Optional analytics stays off unless you allow it.
            </h2>
            <p className="mt-3 text-sm leading-6 text-zinc-600 sm:text-[15px]">
              We use first-party cookies and browser storage for sign-in, build handoffs, and interface
              preferences. If you opt in, lotus.build also loads privacy-friendly Vercel Web Analytics.
              You can review the current register in our{" "}
              <Link href="/cookies" className="font-medium text-zinc-800 underline underline-offset-4">
                Cookie Policy
              </Link>
              .
            </p>
          </div>

          <div className="grid gap-2 sm:min-w-[320px] sm:grid-cols-2 lg:min-w-[360px]">
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-2xl border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100"
              onClick={props.onReject}
            >
              Reject optional
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-2xl border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100"
              onClick={props.onAllowAnalytics}
            >
              Allow analytics
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-11 rounded-2xl text-zinc-700 hover:bg-zinc-100 sm:col-span-2"
              onClick={props.onOpenPreferences}
            >
              Choose settings
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}

function CookiePreferencesDialog(props: {
  open: boolean
  analyticsEnabled: boolean
  onAnalyticsChange: (checked: boolean) => void
  onClose: () => void
  onReject: () => void
  onSave: () => void
  onAllowAnalytics: () => void
}) {
  return (
    <Dialog open={props.open} onOpenChange={(nextOpen) => (!nextOpen ? props.onClose() : undefined)}>
      <DialogContent className="max-w-3xl rounded-[2rem] border-zinc-200 bg-[#fbfbf8] p-0 shadow-[0_35px_100px_-50px_rgba(0,0,0,0.45)] sm:max-w-3xl">
        <div className="border-b border-zinc-200 px-6 py-5 sm:px-7">
          <DialogHeader className="text-left">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
              Cookie settings
            </p>
            <DialogTitle className="mt-2 text-2xl tracking-tight text-zinc-900">
              Manage storage and analytics preferences
            </DialogTitle>
            <DialogDescription className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
              Essential storage stays on because the product needs it for account access, builder
              continuity, and remembering this choice. Optional analytics is separate and off by default.
              We remember your decision for {COOKIE_CONSENT_RETENTION_LABEL}.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="max-h-[70vh] space-y-5 overflow-y-auto px-6 py-5 sm:px-7">
          {COOKIE_CATEGORIES.map((category) => {
            const technologies = COOKIE_TECHNOLOGIES.filter(
              (technology) => technology.category === category.key
            )

            return (
              <section
                key={category.key}
                className="rounded-[1.5rem] border border-zinc-200 bg-white p-5 shadow-[0_18px_45px_-35px_rgba(0,0,0,0.35)]"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="max-w-2xl">
                    <h3 className="text-base font-semibold text-zinc-900">{category.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-zinc-600">{category.description}</p>
                  </div>
                  <div className="flex items-center gap-3 rounded-full border border-zinc-200 bg-[#f7f6f1] px-3 py-2">
                    <span className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">
                      {category.required ? "Always on" : props.analyticsEnabled ? "Allowed" : "Off"}
                    </span>
                    <Switch
                      checked={category.required ? true : props.analyticsEnabled}
                      disabled={category.required}
                      aria-label={`Toggle ${category.title}`}
                      onCheckedChange={props.onAnalyticsChange}
                    />
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  {technologies.map((technology) => (
                    <div
                      key={technology.id}
                      className="rounded-2xl border border-zinc-200 bg-[#fcfcfa] px-4 py-3"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-zinc-900">{technology.name}</p>
                          <p className="mt-1 text-sm leading-6 text-zinc-600">{technology.purpose}</p>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2 text-xs text-zinc-500">
                          <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1">
                            {technology.storageType}
                          </span>
                          <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1">
                            {technology.duration}
                          </span>
                        </div>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-zinc-500">
                        Provider: {technology.provider}. {technology.condition}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )
          })}
        </div>

        <DialogFooter className="border-t border-zinc-200 px-6 py-5 sm:px-7">
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-2xl border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100"
            onClick={props.onReject}
          >
            Reject optional
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-2xl border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100"
            onClick={props.onAllowAnalytics}
          >
            Allow analytics
          </Button>
          <Button
            type="button"
            className="h-11 rounded-2xl bg-zinc-900 text-white hover:bg-zinc-800"
            onClick={props.onSave}
          >
            Save settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function CookieConsentProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [ready, setReady] = useState(false)
  const [consent, setConsent] = useState<CookieConsentRecord | null>(null)
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const [draft, setDraft] = useState<CookieConsentCategories>({
    essential: true,
    analytics: false,
  })

  useEffect(() => {
    const record = parseCookieConsent(readCookieValue(document.cookie, COOKIE_CONSENT_COOKIE_NAME))
    setConsent(record)
    setDraft(record?.categories ?? { essential: true, analytics: false })
    setReady(true)
  }, [])

  useEffect(() => {
    const handleOpen = () => {
      setDraft(consent?.categories ?? { essential: true, analytics: false })
      setPreferencesOpen(true)
    }

    window.addEventListener(COOKIE_PREFERENCES_EVENT, handleOpen)
    return () => window.removeEventListener(COOKIE_PREFERENCES_EVENT, handleOpen)
  }, [consent])

  const persistConsent = useCallback(
    (analytics: boolean) => {
      const nextRecord = createCookieConsentRecord({ analytics })
      const hadAnalytics = Boolean(consent?.categories.analytics)
      const willUseSecureCookie = window.location.protocol === "https:"

      document.cookie = buildConsentCookie(nextRecord, willUseSecureCookie)
      setConsent(nextRecord)
      setDraft(nextRecord.categories)
      setPreferencesOpen(false)

      if (hadAnalytics && !analytics) {
        window.location.reload()
      }
    },
    [consent]
  )

  const openPreferences = useCallback(() => {
    setDraft(consent?.categories ?? { essential: true, analytics: false })
    setPreferencesOpen(true)
  }, [consent])

  const contextValue = useMemo<CookieConsentContextValue>(
    () => ({
      ready,
      consent,
      analyticsEnabled: Boolean(consent?.categories.analytics),
      openPreferences,
    }),
    [consent, openPreferences, ready]
  )

  const showBanner = ready && !consent && !shouldHideCookieBanner(pathname)

  return (
    <CookieConsentContext.Provider value={contextValue}>
      {children}

      {consent?.categories.analytics ? (
        <Analytics
          beforeSend={(event) => {
            if (!("url" in event) || typeof event.url !== "string") return event
            return {
              ...event,
              url: sanitizeAnalyticsUrl(event.url),
            }
          }}
        />
      ) : null}

      {showBanner ? (
        <CookieConsentBanner
          onReject={() => persistConsent(false)}
          onAllowAnalytics={() => persistConsent(true)}
          onOpenPreferences={openPreferences}
        />
      ) : null}

      <CookiePreferencesDialog
        open={preferencesOpen}
        analyticsEnabled={draft.analytics}
        onAnalyticsChange={(checked) =>
          setDraft((current) => ({
            ...current,
            analytics: checked,
          }))
        }
        onClose={() => setPreferencesOpen(false)}
        onReject={() => persistConsent(false)}
        onSave={() => persistConsent(draft.analytics)}
        onAllowAnalytics={() => persistConsent(true)}
      />
    </CookieConsentContext.Provider>
  )
}

export function useCookieConsent() {
  const context = useContext(CookieConsentContext)
  if (!context) {
    throw new Error("useCookieConsent must be used within CookieConsentProvider")
  }
  return context
}
