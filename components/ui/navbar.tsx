"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import {
  Settings,
  LogOut,
  Coins,
  Sparkles,
  ChevronDown,
  LayoutDashboard,
} from "lucide-react"

const navLinks = [
  { href: "/#features", label: "Features" },
  { href: "/teams", label: "Teams" },
  { href: "/pricing", label: "Pricing" },
]

export function Navbar() {
  const router = useRouter()
  const { user, userData, loading, signOut } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleSignOut = async () => {
    try {
      await signOut()
      router.push("/")
    } catch (error) {
      console.error("Sign out error:", error)
    }
  }

  const getInitials = (name: string | null, email: string | null) => {
    if (name) {
      return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
    }
    if (email) {
      return email[0].toUpperCase()
    }
    return "U"
  }

  const remainingClamped = userData ? Math.max(0, userData.tokenUsage?.remaining ?? 0) : 0
  const tokensLimit = userData ? userData.tokenUsage.used + remainingClamped : 0
  const tokenPercentage = userData && tokensLimit > 0
    ? Math.min(100, Math.round((userData.tokenUsage.used / tokensLimit) * 100))
    : 0

  return (
    <header className="fixed top-0 left-0 right-0 z-40 p-4">
      <nav className="relative max-w-5xl w-full mx-auto flex h-12 items-center justify-between px-4 sm:px-6 rounded-full bg-white border border-zinc-200 md:grid md:grid-cols-[1fr_auto_1fr]">
        {/* Left: Logo */}
        <Link href="/" className="font-display text-lg font-semibold text-zinc-900 shrink-0 md:justify-self-start">
          BuildKit
        </Link>

        {/* Center Nav Links (desktop/tablet) */}
        <div className="hidden md:flex items-center justify-center gap-1 justify-self-center">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="px-4 py-1.5 text-sm rounded-full transition-colors text-zinc-600 hover:text-zinc-900"
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Right Side */}
        <div className="ml-auto flex items-center gap-2 md:ml-0 md:justify-self-end">
          {/* User/profile + auth (all breakpoints) */}
          {!mounted || loading ? (
            <div className="w-8 h-8 rounded-full bg-zinc-100 animate-pulse" />
          ) : user && userData ? (
            <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 px-2 py-1 rounded-full hover:bg-zinc-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-700"
                >
                  <Avatar className="h-8 w-8 border border-zinc-300">
                    <AvatarImage src={userData.photoURL || undefined} alt={userData.displayName || "User"} />
                    <AvatarFallback className="bg-zinc-100 text-zinc-700 text-xs">
                      {getInitials(userData.displayName, userData.email)}
                    </AvatarFallback>
                  </Avatar>
                  <ChevronDown className="w-4 h-4 text-zinc-500 hidden xs:block" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-72 bg-white border-zinc-200 text-zinc-900"
                sideOffset={8}
              >
                {/* User Info */}
                <DropdownMenuLabel className="font-normal">
                  <div className="flex items-center gap-3 py-1">
                    <Avatar className="h-10 w-10 border border-zinc-300">
                      <AvatarImage src={userData.photoURL || undefined} />
                      <AvatarFallback className="bg-zinc-100 text-zinc-700">
                        {getInitials(userData.displayName, userData.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-medium text-zinc-900 truncate">
                        {userData.displayName || "User"}
                      </span>
                      <span className="text-xs text-zinc-500 truncate">{userData.email}</span>
                    </div>
                  </div>
                </DropdownMenuLabel>

                <DropdownMenuSeparator className="bg-zinc-100" />

                {/* Plan & Tokens */}
                <div className="px-2 py-3">
                  <div className="rounded-2xl border border-zinc-200 bg-[#fbfbf8] p-3 shadow-[0_8px_24px_-20px_rgba(0,0,0,0.35)]">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-zinc-600" />
                      <span className="text-sm font-medium text-zinc-800 capitalize">{userData.planName} Plan</span>
                    </div>
                    <Link
                      href="/pricing"
                      className="text-xs font-medium text-zinc-600 hover:text-zinc-900 transition-colors"
                      onClick={() => setIsOpen(false)}
                    >
                      Upgrade
                    </Link>
                  </div>

                  {/* Token Usage Bar */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-600 flex items-center gap-1">
                        <Coins className="w-3 h-3" />
                        Tokens used
                      </span>
                      <span className="text-zinc-700 font-medium">
                        {userData.tokenUsage.used.toLocaleString()} / {tokensLimit.toLocaleString()}
                      </span>
                    </div>
                    <div className="h-1.5 bg-zinc-200/80 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-zinc-700 transition-all" style={{ width: `${Math.min(tokenPercentage, 100)}%` }} />
                    </div>
                    <p className="pt-0.5 text-[11px] text-zinc-500">{Math.max(0, remainingClamped).toLocaleString()} tokens available</p>
                  </div>
                  </div>
                </div>

                <DropdownMenuSeparator className="bg-zinc-100" />

                {/* Menu Items */}
                <DropdownMenuItem
                  className="text-zinc-700 focus:bg-zinc-100 focus:text-zinc-900 cursor-pointer"
                  onClick={() => {
                    setIsOpen(false)
                    router.push("/projects")
                  }}
                >
                  <LayoutDashboard className="w-4 h-4 mr-2" />
                  Your Projects
                </DropdownMenuItem>

                <DropdownMenuItem
                  className="text-zinc-700 focus:bg-zinc-100 focus:text-zinc-900 cursor-pointer"
                  onClick={() => {
                    setIsOpen(false)
                    router.push("/settings")
                  }}
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Account Settings
                </DropdownMenuItem>

                <DropdownMenuSeparator className="bg-zinc-100" />

                <DropdownMenuItem
                  className="text-red-400 focus:bg-zinc-100 focus:text-red-400 cursor-pointer"
                  onClick={handleSignOut}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link href="/login">
              <Button
                size="sm"
                className="px-4 py-1.5 text-sm rounded-full bg-zinc-100 text-zinc-900 font-medium hover:bg-zinc-200 transition-colors"
              >
                Get Started
              </Button>
            </Link>
          )}

          {/* Mobile nav sheet – just links */}
          <div className="flex md:hidden">
            {mounted ? (
              <Sheet>
                <SheetTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-9 items-center justify-center rounded-full border border-zinc-200 bg-white px-3 text-zinc-700 transition-colors hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-700"
                    aria-label="Open navigation"
                  >
                    <span className="relative block h-3.5 w-4.5">
                      <span className="absolute left-0 top-0 block h-[2px] w-4.5 rounded-full bg-current" />
                      <span className="absolute bottom-0 left-1 block h-[2px] w-3.5 rounded-full bg-current" />
                    </span>
                  </button>
                </SheetTrigger>
                <SheetContent
                  side="top"
                  className="h-screen bg-[#f5f5f2] px-6 pb-10 pt-16 text-zinc-900"
                >
                  <SheetHeader className="p-0 pb-4">
                    <SheetTitle className="text-sm font-medium uppercase tracking-[0.14em] text-zinc-500">
                      Navigation
                    </SheetTitle>
                  </SheetHeader>
                  <div className="space-y-3">
                    {navLinks.map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        className="block rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-2xl font-medium leading-tight tracking-wide text-zinc-900 transition-colors hover:bg-zinc-100 sm:text-3xl"
                      >
                        {link.label}
                      </Link>
                    ))}
                  </div>
                </SheetContent>
              </Sheet>
            ) : (
              <button
                type="button"
                className="inline-flex h-9 items-center justify-center rounded-full border border-zinc-200 bg-white px-3 text-zinc-700"
                aria-label="Open navigation"
                disabled
              >
                <span className="relative block h-3.5 w-4.5">
                  <span className="absolute left-0 top-0 block h-[2px] w-4.5 rounded-full bg-current" />
                  <span className="absolute bottom-0 left-1 block h-[2px] w-3.5 rounded-full bg-current" />
                </span>
              </button>
            )}
          </div>
        </div>
      </nav>
    </header>
  )
}

