type BrevoSendEmailParams = {
  to: string
  subject: string
  html: string
  text?: string
}

type BrevoSendResult =
  | { ok: true; skipped?: false; messageId?: string }
  | { ok: false; skipped?: boolean; error: string }

const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email"

export function getAppBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (explicit) return explicit.replace(/\/$/, "")

  const vercelUrl = process.env.VERCEL_URL?.trim()
  if (vercelUrl) return `https://${vercelUrl.replace(/\/$/, "")}`

  return "http://localhost:3000"
}

export async function sendBrevoEmail({
  to,
  subject,
  html,
  text,
}: BrevoSendEmailParams): Promise<BrevoSendResult> {
  const apiKey = process.env.BREVO_API_KEY?.trim()
  const senderEmail = process.env.BREVO_FROM_EMAIL?.trim()
  const senderName = process.env.BREVO_FROM_NAME?.trim() || "lotus.build"

  if (!apiKey || !senderEmail) {
    return {
      ok: false,
      skipped: true,
      error: "Brevo is not configured. Set BREVO_API_KEY and BREVO_FROM_EMAIL.",
    }
  }

  const response = await fetch(BREVO_SEND_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      ...(text ? { textContent: text } : {}),
    }),
  })

  const payload = await response.json().catch(() => null) as { messageId?: string; message?: string } | null
  if (!response.ok) {
    return {
      ok: false,
      error: payload?.message || `Brevo email failed with status ${response.status}`,
    }
  }

  return { ok: true, messageId: payload?.messageId }
}
