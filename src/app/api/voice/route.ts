import { NextRequest, NextResponse } from "next/server";
import { VoicePipeline } from "@/lib/voice/pipeline";

let pipeline: VoicePipeline | null = null;

function getPipeline() {
  if (!pipeline) {
    pipeline = new VoicePipeline({
      deepgram: process.env.DEEPGRAM_API_KEY!,
      elevenlabs: process.env.ELEVENLABS_API_KEY!,
    });
  }
  return pipeline;
}

export async function POST(request: NextRequest) {
  try {
    const { audioBase64 } = await request.json();
    if (!audioBase64) return NextResponse.json({ error: "audioBase64 required" }, { status: 400 });

    const missing = ["DEEPGRAM_API_KEY", "ELEVENLABS_API_KEY"].filter(k => !process.env[k]);
    if (missing.length > 0) {
      console.error(`Voice API unavailable — missing env key(s): ${missing.join(", ")}`);
      return NextResponse.json({ error: "Voice service unavailable — check API keys" }, { status: 503 });
    }

    const p = getPipeline();
    const result = await p.processAudio(audioBase64);
    return NextResponse.json(result);
  } catch (err) {
    console.error("Voice API error:", err);
    return NextResponse.json({ error: "Voice processing failed" }, { status: 500 });
  }
}
