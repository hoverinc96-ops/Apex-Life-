import { createClient, DeepgramClient } from "@deepgram/sdk";
import { AGENT_PROMPT, OBJECTION_MATRIX, ObjectionEntry } from "./agent-prompt";

export interface PipelineResult {
  transcript: string;
  responseText: string;
  audioBase64: string;
  latency: { sttMs: number; llmMs: number; ttsMs: number; totalMs: number };
}

/**
 * ElevenLabs voice used for the agent ("Sarah" — a premade voice available to
 * every plan tier, including free). The classic "Rachel" library voice
 * (21m00Tcm4TlvDq8ikWAM) is rejected by the API on free/restricted keys with
 * `paid_plan_required` — do not switch back without verifying quota.
 */
export const ELEVENLABS_VOICE_ID = "EXAVITQu4vr4xnSDxMaL";

/** Synthesize speech via ElevenLabs and return base64 MP3 audio. */
export async function synthesizeSpeech(
  text: string,
  elevenlabsKey: string
): Promise<{ audioBase64: string; mimeType: string }> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
    method: "POST",
    headers: { "xi-api-key": elevenlabsKey, "Content-Type": "application/json" },
    body: JSON.stringify({ text, model_id: "eleven_turbo_v2_5" }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ElevenLabs TTS failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return { audioBase64: Buffer.from(arrayBuffer).toString("base64"), mimeType: "audio/mpeg" };
}

export class VoicePipeline {
  private deepgram: DeepgramClient;
  private elevenlabsKey: string;
  private openaiKey?: string;

  constructor(keys: { deepgram: string; elevenlabs: string; openai?: string }) {
    this.deepgram = createClient(keys.deepgram);
    this.elevenlabsKey = keys.elevenlabs;
    this.openaiKey = keys.openai;
  }

  async processAudio(audioBase64: string): Promise<PipelineResult> {
    const t0 = Date.now();

    // 1. STT — send raw audio bytes to Deepgram. (transcribeUrl with a data:
    //    URL is rejected by Deepgram with REMOTE_CONTENT_ERROR — the bytes must
    //    be uploaded directly; Deepgram sniffs the container/codec itself.)
    const sttStart = Date.now();
    const audioBuffer = Buffer.from(audioBase64, "base64");
    const { result: sttResult } = await this.deepgram.listen.prerecorded.transcribeFile(
      audioBuffer,
      { smart_format: true, model: "nova-2", language: "en" }
    );
    const transcript = sttResult?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
    const sttMs = Date.now() - sttStart;

    // 2. Orchestrator — match objections or use simple response
    const llmStart = Date.now();
    const text = transcript.toLowerCase();
    let responseText = "";
    for (const obj of OBJECTION_MATRIX) {
      if (obj.triggers.some(t => text.includes(t))) {
        responseText = this.objectionResponse(obj, transcript);
        break;
      }
    }
    if (!responseText) {
      responseText = this.defaultResponse(transcript);
    }
    const llmMs = Date.now() - llmStart;

    // 3. TTS — ElevenLabs
    const ttsStart = Date.now();
    const audioBase64Out = await this.synthesize(responseText);
    const ttsMs = Date.now() - ttsStart;

    return {
      transcript,
      responseText,
      audioBase64: audioBase64Out,
      latency: { sttMs, llmMs, ttsMs, totalMs: Date.now() - t0 },
    };
  }

  private objectionResponse(obj: ObjectionEntry, transcript: string): string {
    if (obj.id === "real_person") return "I completely understand. I'm actually an AI assistant, and I can transfer you to a licensed human agent right now. Would you like me to do that?";
    if (obj.id === "price") return "I hear you. Many people find that a 20-year term policy runs around $30 to $60 a month depending on health. Would you like me to have an agent send you exact options?";
    if (obj.id === "spouse_approval") return "That makes total sense. I can have an agent prepare a one-page summary you can review together. Want me to set that up?";
    if (obj.id === "work_policy") return "Work coverage is great, but it typically stays with the job. An individual policy stays with you. Would you like to compare?";
    if (obj.id === "not_interested") return "No problem at all. I'll make sure you're not contacted again. Thank you for your time!";
    if (obj.id === "already_covered") return "That's great to hear. Would you like a free annual review to make sure it still fits your needs? No obligation.";
    return "I understand. Would you like me to schedule a call with a licensed agent who can help?";
  }

  private defaultResponse(transcript: string): string {
    if (!transcript) return "I'm sorry, I didn't catch that. Could you say that again?";
    if (transcript.length < 20) return "Thanks for sharing. Can you tell me a bit more about what kind of coverage you're looking for?";
    return "Thank you. Based on what you've shared, a licensed agent can put together personalized options. Would you like me to schedule a quick callback?";
  }

  private async synthesize(text: string): Promise<string> {
    const { audioBase64 } = await synthesizeSpeech(text, this.elevenlabsKey);
    return audioBase64;
  }

  close() {}
}
