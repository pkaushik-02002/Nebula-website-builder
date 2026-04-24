"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { ArrowRight, Loader2, MailCheck, ShieldAlert } from "lucide-react"

import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"

export default function ComputerInvitePage() {
  const params = useParams<{ inviteId: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { user, loading } = useAuth()
  const [status, setStatus] = useState<"idle" | "accepting" | "accepted" | "error">("idle")
  const [error, setError] = useState("")
  const [computerId, setComputerId] = useState<string | null>(null)

  const inviteId = params.inviteId
  const token = searchParams.get("token") || ""
  const currentPath = `/invite/${inviteId}${token ? `?token=${encodeURIComponent(token)}` : ""}`

  const acceptInvite = useCallback(async () => {
    if (!user || !inviteId || !token || status === "accepting") return

    setStatus("accepting")
    setError("")
    try {
      const idToken = await user.getIdToken()
      const response = await fetch(`/api/computer-invites/${inviteId}/accept`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ token }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to accept invite")
      }
      setComputerId(payload?.computerId ?? null)
      setStatus("accepted")
      if (payload?.computerId) {
        window.setTimeout(() => router.push(`/computer/${payload.computerId}`), 700)
      }
    } catch (err) {
      setStatus("error")
      setError(err instanceof Error ? err.message : "Failed to accept invite")
    }
  }, [inviteId, router, status, token, user])

  useEffect(() => {
    if (!loading && user && token && status === "idle") {
      acceptInvite()
    }
  }, [acceptInvite, loading, status, token, user])

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f0ece4] px-4 py-10 text-[#1c1c1c]">
      <section className="w-full max-w-md rounded-[1.4rem] border border-[#e0dbd1] bg-[#faf9f6] p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_32px_-12px_rgba(0,0,0,0.12)]">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#e0dbd1] bg-white text-[#7a6244]">
          {status === "error" ? <ShieldAlert className="h-5 w-5" /> : <MailCheck className="h-5 w-5" />}
        </div>

        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-zinc-900">Accept invite</h1>

        {!token ? (
          <p className="mt-2 text-sm leading-6 text-zinc-600">This invite link is missing its secure token. Ask the project owner to send a new invite.</p>
        ) : loading || status === "accepting" ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-zinc-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            Accepting your invite...
          </div>
        ) : !user ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm leading-6 text-zinc-600">Sign in or create an account with the invited email address to join this computer.</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild className="bg-zinc-900 text-white hover:bg-black">
                <Link href={`/login?redirect=${encodeURIComponent(currentPath)}`}>Sign in</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/signup?redirect=${encodeURIComponent(currentPath)}`}>Create account</Link>
              </Button>
            </div>
          </div>
        ) : status === "accepted" ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm leading-6 text-zinc-600">Invite accepted. Opening the shared computer...</p>
            {computerId ? (
              <Button asChild className="bg-zinc-900 text-white hover:bg-black">
                <Link href={`/computer/${computerId}`}>
                  Open computer
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            ) : null}
          </div>
        ) : status === "error" ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm leading-6 text-red-700">{error}</p>
            <Button type="button" variant="outline" onClick={acceptInvite}>
              Try again
            </Button>
          </div>
        ) : (
          <Button type="button" className="mt-4 bg-zinc-900 text-white hover:bg-black" onClick={acceptInvite}>
            Accept invite
          </Button>
        )}
      </section>
    </main>
  )
}
