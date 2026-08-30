/**
 * Shared message protocol between the voice test client (browser) and the
 * WebSocket voice server at /api/voice-ws.
 *
 * The transport is JSON text frames. Audio is exchanged as base64-encoded
 * PCM16 (16 kHz, mono) for user input and base64-encoded MP3 for AI output.
 * Binary frames are also accepted on the server for future telephony layers
 * (e.g. Twilio media streams send raw binary audio).
 */

export const VOICE_WS_PATH = "/api/voice-ws";

export type VoiceStage = "stt" | "llm" | "tts";

export type VoiceStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "listening"
  | "processing"
  | "speaking"
  | "barge_in"
  | "closed"
  | "error";

/** Per-stage latency breakdown for one exchange (milliseconds). */
export interface LatencyReport {
  /** Last audio chunk → Deepgram final transcript. */
  stt_ms: number;
  /** Orchestrator (LLM) response generation. */
  llm_ms: number;
  /** Time to first TTS audio byte. */
  tts_first_ms: number;
  /** Full TTS synthesis. */
  tts_ms: number;
  /** Final transcript → complete response audio (the headline number). */
  round_trip_ms: number;
}

/* ------------------------------ client → server ------------------------------ */

export type ClientMessage = AudioMessage | TextMessage | ControlMessage;

export interface AudioMessage {
  type: "audio";
  /** base64-encoded PCM16 little-endian, 16 kHz, mono. */
  audio_base64: string;
}

export interface TextMessage {
  type: "text";
  /** Raw text to run through the orchestrator (bypasses STT). */
  text: string;
}

export interface ControlMessage {
  type: "start" | "barge_in" | "close" | "ping";
}

/* ------------------------------ server → client ------------------------------ */

export type ServerMessage =
  | StatusMessage
  | InterimMessage
  | TranscriptMessage
  | ResponseMessage
  | ErrorMessage;

export interface StatusMessage {
  type: "status";
  status: VoiceStatus;
  /** Which pipeline stage is active (for the status pills). */
  stage?: VoiceStage;
  message?: string;
}

export interface InterimMessage {
  type: "interim";
  transcript: string;
}

export interface TranscriptMessage {
  type: "transcript";
  transcript: string;
}

export interface ResponseMessage {
  type: "response";
  response_text: string;
  /** base64-encoded MP3 audio of the response. */
  audio_base64: string;
  latency: LatencyReport;
  /** Raw wall-clock stage timings (ms) for debugging. */
  stage_timings: Record<string, number>;
}

export interface ErrorMessage {
  type: "error";
  message: string;
}
