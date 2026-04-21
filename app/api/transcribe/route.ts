import OpenAI from "openai"
import { requireUserUid } from "@/lib/server-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_AUDIO_BYTES = 24 * 1024 * 1024
const TRANSCRIPTION_MODEL = process.env.OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-transcribe"
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null

function normalizeUploadedFile(file: File) {
  if (file.name && file.name.trim()) return file

  const mimeType = file.type || "audio/webm"
  const extension =
    mimeType.includes("mp4") || mimeType.includes("m4a")
      ? "m4a"
      : mimeType.includes("ogg")
        ? "ogg"
        : mimeType.includes("wav")
          ? "wav"
          : "webm"

  return new File([file], `voice-input.${extension}`, { type: mimeType })
}

export async function POST(req: Request) {
  try {
    await requireUserUid(req)
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!openai) {
    return Response.json({ error: "Transcription service is not configured." }, { status: 503 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return Response.json({ error: "Invalid form data." }, { status: 400 })
  }

  const uploaded = formData.get("file")
  if (!(uploaded instanceof File)) {
    return Response.json({ error: "Audio file is required." }, { status: 400 })
  }

  if (uploaded.size <= 0) {
    return Response.json({ error: "Recorded audio was empty." }, { status: 400 })
  }

  if (uploaded.size > MAX_AUDIO_BYTES) {
    return Response.json({ error: "Audio file is too large. Please keep recordings under 24 MB." }, { status: 413 })
  }

  try {
    const transcription = await openai.audio.transcriptions.create({
      file: normalizeUploadedFile(uploaded),
      model: TRANSCRIPTION_MODEL,
    })

    const text = typeof transcription.text === "string" ? transcription.text.trim() : ""
    if (!text) {
      return Response.json({ error: "No clear speech was detected. Please try again." }, { status: 422 })
    }

    return Response.json({
      text,
      model: TRANSCRIPTION_MODEL,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to transcribe audio."
    return Response.json({ error: message }, { status: 500 })
  }
}
