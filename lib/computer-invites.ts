import crypto from "crypto"

import { FieldValue, Timestamp } from "firebase-admin/firestore"
import { nanoid } from "nanoid"

import { adminDb } from "@/lib/firebase-admin"
import { getAppBaseUrl, sendBrevoEmail } from "@/lib/brevo-email"

type CreateComputerInviteParams = {
  computerId: string
  computerName: string
  email: string
  invitedByUid: string
  invitedByName?: string | null
  invitedUserUid?: string | null
}

type CreateComputerInviteResult = {
  inviteId: string
  inviteUrl: string
  emailSent: boolean
  emailError?: string
}

function hashInviteToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex")
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

export function verifyComputerInviteToken(token: string, tokenHash: string): boolean {
  if (!token || !tokenHash) return false
  const incoming = Buffer.from(hashInviteToken(token), "hex")
  const expected = Buffer.from(tokenHash, "hex")
  return incoming.length === expected.length && crypto.timingSafeEqual(incoming, expected)
}

export async function createComputerInvite({
  computerId,
  computerName,
  email,
  invitedByUid,
  invitedByName,
  invitedUserUid,
}: CreateComputerInviteParams): Promise<CreateComputerInviteResult> {
  const inviteId = nanoid()
  const token = crypto.randomBytes(32).toString("hex")
  const appUrl = getAppBaseUrl()
  const inviteUrl = `${appUrl}/invite/${inviteId}?token=${token}`
  const expiresAt = Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
  const safeComputerName = escapeHtml(computerName || "a lotus.build computer")
  const safeInviter = escapeHtml(invitedByName || "A teammate")
  const inviterName = invitedByName || "A teammate"

  await adminDb.collection("computerInvites").doc(inviteId).set({
    computerId,
    computerName,
    email,
    invitedBy: invitedByUid,
    invitedByName: invitedByName ?? null,
    invitedUserUid: invitedUserUid ?? null,
    tokenHash: hashInviteToken(token),
    status: "pending",
    expiresAt,
    createdAt: FieldValue.serverTimestamp(),
  })

  const emailResult = await sendBrevoEmail({
    to: email,
    subject: `${inviterName} invited you to collaborate on lotus.build`,
    text: `${inviterName} invited you to collaborate on ${computerName || "a lotus.build computer"}.\n\nAccept invite: ${inviteUrl}\n\nThis invite expires in 7 days.`,
    html: `
      <div style="font-family:Inter,Arial,sans-serif;background:#f0ece4;padding:32px;color:#1c1c1c">
        <div style="max-width:560px;margin:0 auto;background:#faf9f6;border:1px solid #e0dbd1;border-radius:18px;padding:28px">
          <p style="margin:0 0 12px;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#8a7556;font-weight:700">lotus.build</p>
          <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;color:#1c1c1c">You have been invited to collaborate</h1>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#52525b">${safeInviter} invited you to join <strong>${safeComputerName}</strong>.</p>
          <a href="${inviteUrl}" style="display:inline-block;background:#1c1c1c;color:#ffffff;text-decoration:none;border-radius:12px;padding:12px 18px;font-size:14px;font-weight:700">Accept invite</a>
          <p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:#71717a">This invite expires in 7 days. If the button does not work, open this link:<br>${inviteUrl}</p>
        </div>
      </div>
    `,
  })

  await adminDb.collection("computerInvites").doc(inviteId).update({
    emailSentAt: emailResult.ok ? FieldValue.serverTimestamp() : null,
    emailStatus: emailResult.ok ? "sent" : emailResult.skipped ? "skipped" : "error",
    emailError: emailResult.ok ? null : emailResult.error,
    brevoMessageId: emailResult.ok ? emailResult.messageId ?? null : null,
  })

  return {
    inviteId,
    inviteUrl,
    emailSent: emailResult.ok,
    ...(!emailResult.ok ? { emailError: emailResult.error } : {}),
  }
}
