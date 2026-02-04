"use client"

import { useState } from "react"
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
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import {
  Settings,
  LogOut,
  Coins,
  Sparkles,
  ChevronDown,
  LayoutDashboard,
  Menu,
} from "lucide-react"

const navLinks = [
  { href: "/#features", label: "Features" },
  { href: "/#testimonials", label: "Testimonials" },
  { href: "/pricing", label: "Pricing" },
]

export function Navbar() {
  const router = useRouter()
  const { user, userData, loading, signOut } = useAuth()
  const [isOpen, setIsOpen] = useState(false)

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
      <nav className="max-w-5xl w-full mx-auto flex items-center justify-between h-12 px-4 sm:px-6 rounded-full bg-zinc-900/70 border border-zinc-800/50 backdrop-blur-md">
        {/* Left: Logo */}
        <Link href="/" className="font-display text-lg font-semibold text-zinc-100 shrink-0">
          BuildKit
        </Link>

        {/* Center Nav Links (desktop/tablet) */}
        <div className="hidden md:flex items-center justify-center gap-1 absolute left-1/2 -translate-x-1/2">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="px-4 py-1.5 text-sm rounded-full transition-colors text-zinc-400 hover:text-zinc-100"
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Right Side */}
        <div className="flex items-center gap-2">
          {/* User/profile + auth (all breakpoints) */}
          {loading ? (
            <div className="w-8 h-8 rounded-full bg-zinc-800 animate-pulse" />
          ) : user && userData ? (
            <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 px-2 py-1 rounded-full hover:bg-zinc-800/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-700"
                >
                  <Avatar className="h-8 w-8 border border-zinc-700">
                    <AvatarImage src={userData.photoURL || undefined} alt={userData.displayName || "User"} />
                    <AvatarFallback className="bg-zinc-800 text-zinc-300 text-xs">
                      {getInitials(userData.displayName, userData.email)}
                    </AvatarFallback>
                  </Avatar>
                  <ChevronDown className="w-4 h-4 text-zinc-500 hidden xs:block" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-72 bg-zinc-900 border-zinc-800 text-zinc-100"
                sideOffset={8}
              >
                {/* User Info */}
                <DropdownMenuLabel className="font-normal">
                  <div className="flex items-center gap-3 py-1">
                    <Avatar className="h-10 w-10 border border-zinc-700">
                      <AvatarImage src={userData.photoURL || undefined} />
                      <AvatarFallback className="bg-zinc-800 text-zinc-300">
                        {getInitials(userData.displayName, userData.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-medium text-zinc-100 truncate">
                        {userData.displayName || "User"}
                      </span>
                      <span className="text-xs text-zinc-500 truncate">{userData.email}</span>
                    </div>
                  </div>
                </DropdownMenuLabel>

                <DropdownMenuSeparator className="bg-zinc-800" />

                {/* Plan & Tokens */}
                <div className="px-2 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-zinc-400" />
                      <span className="text-sm text-zinc-300 capitalize">{userData.planName} Plan</span>
                    </div>
                    <Link
                      href="/pricing"
                      className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                      onClick={() => setIsOpen(false)}
                    >
                      Upgrade
                    </Link>
                  </div>

                  {/* Token Usage Bar */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-500 flex items-center gap-1">
                        <Coins className="w-3 h-3" />
                        Tokens used
                      </span>
                      <span className="text-zinc-400">
                        {userData.tokenUsage.used.toLocaleString()} / {tokensLimit.toLocaleString()}
                      </span>
                    </div>
                    <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all bg-gradient-to-r from-amber-400 to-yellow-500"
                        style={{ width: `${Math.min(tokenPercentage, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>

                <DropdownMenuSeparator className="bg-zinc-800" />

                {/* Menu Items */}
                <DropdownMenuItem
                  className="text-zinc-300 focus:bg-zinc-800 focus:text-zinc-100 cursor-pointer"
                  onClick={() => {
                    setIsOpen(false)
                    router.push("/projects")
                  }}
                >
                  <LayoutDashboard className="w-4 h-4 mr-2" />
                  Your Projects
                </DropdownMenuItem>

                <DropdownMenuItem
                  className="text-zinc-300 focus:bg-zinc-800 focus:text-zinc-100 cursor-pointer"
                  onClick={() => {
                    setIsOpen(false)
                    router.push("/settings")
                  }}
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Settings
                </DropdownMenuItem>

                <DropdownMenuSeparator className="bg-zinc-800" />

                <DropdownMenuItem
                  className="text-red-400 focus:bg-zinc-800 focus:text-red-400 cursor-pointer"
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
            <Sheet>
              <SheetTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-full p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-700"
                  aria-label="Open navigation"
                >
                  <Menu className="w-5 h-5" />
                </button>
              </SheetTrigger>
              <SheetContent
                side="top"
                className="bg-zinc-950 text-zinc-50 px-6 pt-16 pb-10 h-screen"
              >
                <div className="space-y-4">
                  {navLinks.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="block text-3xl leading-tight font-medium tracking-wide text-zinc-50 hover:text-zinc-200 transition-colors"
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </nav>
    </header>
  )
}
