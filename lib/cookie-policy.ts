export const COOKIE_POLICY_LAST_UPDATED = "April 21, 2026"
export const COOKIE_POLICY_VERSION = "2026-04-21"
export const COOKIE_CONSENT_COOKIE_NAME = "lotus_cookie_preferences"
export const COOKIE_CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 180
export const COOKIE_CONSENT_RETENTION_LABEL = "6 months"
export const COOKIE_PREFERENCES_EVENT = "lotus:open-cookie-preferences"

export type CookieCategoryKey = "essential" | "analytics"

export type CookieConsentCategories = {
  essential: true
  analytics: boolean
}

export type CookieConsentRecord = {
  version: string
  updatedAt: string
  categories: CookieConsentCategories
}

export type CookieCategoryDefinition = {
  key: CookieCategoryKey
  title: string
  summary: string
  description: string
  required: boolean
  defaultState: boolean
}

export type CookieTechnologyDefinition = {
  id: string
  name: string
  category: CookieCategoryKey
  provider: string
  storageType: string
  duration: string
  purpose: string
  condition: string
}

export const DEFAULT_COOKIE_CONSENT: CookieConsentCategories = {
  essential: true,
  analytics: false,
}

export const COOKIE_CATEGORIES: CookieCategoryDefinition[] = [
  {
    key: "essential",
    title: "Strictly necessary",
    summary: "Required for sign-in, project flows, UI state, and remembering your privacy choice.",
    description:
      "These technologies support account access, login handoffs, project builder state, and the preference cookie that remembers your decision. They stay active because the site relies on them to work properly.",
    required: true,
    defaultState: true,
  },
  {
    key: "analytics",
    title: "Analytics measurement",
    summary: "Optional privacy-friendly usage measurement for product improvement.",
    description:
      "If you allow analytics, lotus.build loads Vercel Web Analytics to understand page usage and product performance. Vercel describes this service as cookieless, but we still keep it off until you opt in from this site.",
    required: false,
    defaultState: false,
  },
]

export const COOKIE_TECHNOLOGIES: CookieTechnologyDefinition[] = [
  {
    id: "lotus-cookie-preferences",
    name: COOKIE_CONSENT_COOKIE_NAME,
    category: "essential",
    provider: "lotus.build",
    storageType: "Cookie",
    duration: COOKIE_CONSENT_RETENTION_LABEL,
    purpose: "Remembers whether you allowed or rejected optional analytics so we do not ask you on every page load.",
    condition: "Set after you make a choice in the cookie banner or cookie settings dialog.",
  },
  {
    id: "firebase-auth-session",
    name: "Firebase Authentication session persistence",
    category: "essential",
    provider: "Google Firebase",
    storageType: "Browser storage",
    duration: "Until sign-out or browser data is cleared",
    purpose: "Keeps authenticated users signed in between page loads and return visits so account access works reliably.",
    condition: "Used when you sign in to lotus.build. The app does not override Firebase Auth's default web persistence.",
  },
  {
    id: "sidebar-state",
    name: "sidebar_state",
    category: "essential",
    provider: "lotus.build",
    storageType: "Cookie",
    duration: "7 days",
    purpose: "Remembers whether the sidebar was expanded or collapsed in builder interfaces after you change it.",
    condition: "Set only after you toggle the sidebar in a builder surface that uses this preference.",
  },
  {
    id: "pending-create",
    name: "lotus_pending_create",
    category: "essential",
    provider: "lotus.build",
    storageType: "Session storage",
    duration: "Current browser tab only",
    purpose: "Carries a pending build request through the sign-in flow so the project or computer run can resume after login.",
    condition: "Created only when a signed-out visitor starts a build flow and is redirected to authenticate.",
  },
  {
    id: "supabase-oauth-result",
    name: "supabase-oauth-result",
    category: "essential",
    provider: "lotus.build",
    storageType: "Local storage",
    duration: "Short-lived until read and cleared",
    purpose: "Passes the result of the Supabase OAuth popup back to the originating project page.",
    condition: "Created only during the Supabase connection flow and removed after the app consumes it.",
  },
  {
    id: "vercel-web-analytics",
    name: "Vercel Web Analytics",
    category: "analytics",
    provider: "Vercel",
    storageType: "Cookieless analytics script",
    duration: "No lotus.build cookie is set; Vercel says its visitor hash resets every 24 hours",
    purpose: "Measures page views and product usage patterns in aggregated form so we can improve performance, content, and navigation.",
    condition: "Loaded only if you allow analytics from the banner or cookie settings.",
  },
]

export const COOKIE_POLICY_HIGHLIGHTS = [
  {
    label: "Optional by default",
    value: "Analytics stays off until you allow it.",
  },
  {
    label: "Always active",
    value: "Only essential storage remains enabled by default.",
  },
  {
    label: "Decision retention",
    value: `Your choice is remembered for ${COOKIE_CONSENT_RETENTION_LABEL}.`,
  },
] as const

export function createCookieConsentRecord(
  categories: Partial<CookieConsentCategories>
): CookieConsentRecord {
  return {
    version: COOKIE_POLICY_VERSION,
    updatedAt: new Date().toISOString(),
    categories: {
      essential: true,
      analytics: Boolean(categories.analytics),
    },
  }
}

export function serializeCookieConsent(record: CookieConsentRecord): string {
  return encodeURIComponent(JSON.stringify(record))
}

export function parseCookieConsent(raw: string | null | undefined): CookieConsentRecord | null {
  if (!raw) return null

  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as Partial<CookieConsentRecord>
    if (parsed.version !== COOKIE_POLICY_VERSION) return null
    if (!parsed.updatedAt || typeof parsed.updatedAt !== "string") return null

    return {
      version: parsed.version,
      updatedAt: parsed.updatedAt,
      categories: {
        essential: true,
        analytics: Boolean(parsed.categories?.analytics),
      },
    }
  } catch {
    return null
  }
}

export function readCookieValue(cookieSource: string, name: string): string | null {
  if (!cookieSource) return null

  for (const segment of cookieSource.split(";")) {
    const trimmed = segment.trim()
    if (!trimmed) continue
    const separatorIndex = trimmed.indexOf("=")
    const key = separatorIndex >= 0 ? trimmed.slice(0, separatorIndex) : trimmed
    if (key !== name) continue
    return separatorIndex >= 0 ? trimmed.slice(separatorIndex + 1) : ""
  }

  return null
}

export function buildConsentCookie(record: CookieConsentRecord, secure: boolean): string {
  return [
    `${COOKIE_CONSENT_COOKIE_NAME}=${serializeCookieConsent(record)}`,
    "path=/",
    `max-age=${COOKIE_CONSENT_MAX_AGE_SECONDS}`,
    "SameSite=Lax",
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ")
}

export function getCategoryDefinition(key: CookieCategoryKey): CookieCategoryDefinition {
  const match = COOKIE_CATEGORIES.find((category) => category.key === key)
  if (!match) {
    throw new Error(`Unknown cookie category: ${key}`)
  }
  return match
}

export function getTechnologiesForCategory(key: CookieCategoryKey): CookieTechnologyDefinition[] {
  return COOKIE_TECHNOLOGIES.filter((technology) => technology.category === key)
}
