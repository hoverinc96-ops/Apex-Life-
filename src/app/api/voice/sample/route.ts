import { NextResponse } from "next/server";
import { synthesizeSpeech } from "@/lib/voice/pipeline";

/**
 * Synthesizes a realistic sample customer line through the real ElevenLabs TTS
 * pipeline so the Voice Test "Simulate call" button can run a full live round
 * trip (sample audio -> Deepgram STT -> orchestrator -> ElevenLabs TTS)
 * without the demo host having to speak.
 */
const SAMPLE_LINE =
  "Hi, I am looking for life insurance for my family, but I am worried it is too expensive.";

export async function GET() {
  try {
    if (!process.env.ELEVENLABS_API_KEY) {
      console.error("Voice sample unavailable — ELEVENLABS_API_KEY is missing");
      return NextResponse.json({ error: "Voice service unavailable — check API keys" }, { status: 503 });
    }
    const { audioBase64, mimeType } = await synthesizeSpeech(SAMPLE_LINE, process.env.ELEVENLABS_API_KEY);
    return NextResponse.json({ audioBase64, mimeType, text: SAMPLE_LINE });
  } catch (err) {
    console.error("Voice sample error:", err);
    return NextResponse.json({ error: "Voice service unavailable — check API keys" }, { status: 500 });
  }
}
