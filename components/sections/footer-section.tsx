import Link from "next/link"
import { CookiePreferencesButton } from "@/components/legal/cookie-preferences-button"
import { LEGAL_CONTACT_HREF } from "@/lib/legal-content"

export function FooterSection() {
  return (
    <footer className="border-t border-zinc-200 bg-[#f5f5f2] px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-10 md:grid-cols-12">
          <div className="md:col-span-5">
            <p className="text-2xl font-semibold tracking-tight text-zinc-900">Lotus.build</p>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-zinc-600">
              A calm, premium website builder for founders. Turn ideas into polished websites with AI guidance and live editing.
            </p>
            <p className="mt-4 text-xs uppercase tracking-[0.12em] text-zinc-500">Built for serious teams</p>
          </div>
          <div className="grid gap-8 sm:grid-cols-3 md:col-span-7">
            <div>
              <p className="text-sm font-medium text-zinc-900">Product</p>
              <div className="mt-3 space-y-2 text-sm text-zinc-600">
                <Link href="/" className="block hover:text-zinc-900">Home</Link>
                <Link href="/pricing" className="block hover:text-zinc-900">Pricing</Link>
                <Link href="/projects" className="block hover:text-zinc-900">Projects</Link>
                <Link href="/computer/new" className="block hover:text-zinc-900">Computer</Link>
                <Link href="/help" className="block hover:text-zinc-900">Help</Link>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-900">Company</p>
              <div className="mt-3 space-y-2 text-sm text-zinc-600">
                <Link href="/help" className="block hover:text-zinc-900">About</Link>
                <Link href="/settings" className="block hover:text-zinc-900">Account</Link>
                <a href={LEGAL_CONTACT_HREF} className="block hover:text-zinc-900">Contact</a>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-900">Legal</p>
              <div className="mt-3 space-y-2 text-sm text-zinc-600">
                <Link href="/terms" className="block hover:text-zinc-900">Terms</Link>
                <Link href="/privacy" className="block hover:text-zinc-900">Privacy</Link>
                <Link href="/cookies" className="block hover:text-zinc-900">Cookies</Link>
                <CookiePreferencesButton className="block hover:text-zinc-900">
                  Cookie settings
                </CookiePreferencesButton>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t border-zinc-200 pt-5 text-xs text-zinc-500 sm:flex-row sm:items-center">
          <p>Copyright {new Date().getFullYear()} Lotus.build. All rights reserved.</p>
          <p>Made for founders building real companies.</p>
        </div>
      </div>
    </footer>
  )
}
