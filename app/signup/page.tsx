"use client"

import React, { useEffect } from "react"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ArrowRight, Loader2, ShieldCheck, Sparkles } from "lucide-react"

export default function SignupPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get("redirect") || "/"
  const { signInWithGoogle, signInWithGithub, signUpWithEmail, user, loading } = useAuth()
  
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")

  // Redirect if already logged in
  useEffect(() => {
    if (user && !loading) {
      router.push(redirect)
    }
  }, [user, loading, router, redirect])

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (password !== confirmPassword) {
      setError("Passwords do not match")
      return
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters")
      return
    }

    setIsLoading(true)

    try {
      await signUpWithEmail(email, password)
      router.push(redirect)
    } catch (err) {
      setError("Failed to create account. Email may already be in use.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setIsLoading(true)
    setError("")

    try {
      await signInWithGoogle()
      router.push(redirect)
    } catch (err) {
      setError("Failed to sign in with Google")
    } finally {
      setIsLoading(false)
    }
  }

  const handleGithubSignIn = async () => {
    setIsLoading(true)
    setError("")

    try {
      await signInWithGithub()
      router.push(redirect)
    } catch (err) {
      setError("Failed to sign in with GitHub")
    } finally {
      setIsLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f5f2] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f5f5f2] px-4 py-6 sm:px-6 lg:px-8">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.92)_0%,rgba(255,255,255,0)_34%),radial-gradient(circle_at_bottom_right,rgba(230,229,221,0.9)_0%,rgba(230,229,221,0)_32%)]"
      />

      <div className="relative mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-6xl items-center justify-center">
        <div className="grid w-full gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div className="hidden lg:block">
            <div className="max-w-xl">
              <Link href="/" className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm">
                <Sparkles className="h-4 w-4 text-zinc-500" />
                lotus.build
              </Link>

              <h1 className="mt-8 font-display text-5xl font-bold leading-[0.96] tracking-tight text-zinc-900 xl:text-6xl">
                Create your account and start building.
              </h1>

              <p className="mt-5 max-w-lg text-lg leading-relaxed text-zinc-600">
                Set up your workspace, generate polished websites faster, and
                move from first idea to finished product with less friction.
              </p>

              <div className="mt-10 grid gap-3 sm:grid-cols-2">
                <div className="rounded-3xl border border-zinc-200 bg-white/80 p-5 shadow-[0_18px_50px_-28px_rgba(0,0,0,0.28)]">
                  <ShieldCheck className="h-5 w-5 text-zinc-700" />
                  <p className="mt-4 text-sm font-medium text-zinc-900">
                    Clean onboarding
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-500">
                    Get started with email, Google, or GitHub in a familiar, lightweight flow.
                  </p>
                </div>

                <div className="rounded-3xl border border-zinc-200 bg-[#ecece6] p-5 shadow-[0_18px_50px_-28px_rgba(0,0,0,0.18)]">
                  <ArrowRight className="h-5 w-5 text-zinc-700" />
                  <p className="mt-4 text-sm font-medium text-zinc-900">
                    Launch faster
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-500">
                    Start generating pages, refining prompts, and shipping sooner.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mx-auto w-full max-w-md lg:max-w-none">
            <div className="rounded-[2rem] border border-zinc-200/90 bg-white p-6 shadow-[0_30px_90px_-40px_rgba(0,0,0,0.35)] sm:p-8">
              <div className="mb-8 text-center lg:text-left">
                <Link href="/" className="text-2xl font-bold text-zinc-900 lg:hidden">
                  lotus.build
                </Link>
                <p className="mt-2 text-xs font-medium uppercase tracking-[0.22em] text-zinc-500">
                  Start here
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900">
                  Create your account
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                  Join lotus.build and start building with the same calm workflow.
                </p>
              </div>

              {error && (
                <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {error}
                </div>
              )}

              <div className="space-y-3">
                <Button
                  onClick={handleGoogleSignIn}
                  disabled={isLoading}
                  className="h-12 w-full rounded-2xl border border-zinc-300 bg-[#f8f8f5] text-zinc-900 hover:bg-[#efefe9]"
                  variant="outline"
                >
                  <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="currentColor"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Continue with Google
                </Button>

                <Button
                  onClick={handleGithubSignIn}
                  disabled={isLoading}
                  className="h-12 w-full rounded-2xl border border-zinc-300 bg-[#f8f8f5] text-zinc-900 hover:bg-[#efefe9]"
                  variant="outline"
                >
                  <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                  </svg>
                  Continue with GitHub
                </Button>
              </div>

              <div className="relative my-7">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-zinc-200" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="bg-white px-3 text-zinc-500">or continue with email</span>
                </div>
              </div>

              <form onSubmit={handleEmailSignUp} className="space-y-4">
                <div>
                  <Label htmlFor="email" className="text-zinc-700">
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="mt-2 h-12 rounded-2xl border-zinc-300 bg-[#f8f8f5] text-zinc-900 placeholder:text-zinc-500"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="password" className="text-zinc-700">
                    Password
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create a password"
                    className="mt-2 h-12 rounded-2xl border-zinc-300 bg-[#f8f8f5] text-zinc-900 placeholder:text-zinc-500"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="confirmPassword" className="text-zinc-700">
                    Confirm Password
                  </Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm your password"
                    className="mt-2 h-12 rounded-2xl border-zinc-300 bg-[#f8f8f5] text-zinc-900 placeholder:text-zinc-500"
                    required
                  />
                </div>
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="mt-2 h-12 w-full rounded-2xl bg-zinc-900 text-white hover:bg-zinc-800"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating account...
                    </>
                  ) : (
                    "Create account"
                  )}
                </Button>
              </form>

              <p className="mt-6 text-center text-sm text-zinc-500">
                Already have an account?{" "}
                <Link
                  href={`/login?redirect=${encodeURIComponent(redirect)}`}
                  className="font-medium text-zinc-700 hover:text-zinc-900"
                >
                  Sign in
                </Link>
              </p>

              <p className="mt-6 text-center text-xs leading-relaxed text-zinc-500 lg:text-left">
                By creating an account, you agree to our{" "}
                <Link href="/terms" className="font-medium text-zinc-700 hover:text-zinc-900">
                  Terms and Conditions
                </Link>{" "}
                and{" "}
                <Link href="/privacy" className="font-medium text-zinc-700 hover:text-zinc-900">
                  Privacy Policy
                </Link>
                .
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

