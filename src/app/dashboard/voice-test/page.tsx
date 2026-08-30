"use client";
import { useCallback, useEffect, useRef, useState } from "react";

type Latency = { sttMs: number; llmMs: number; ttsMs: number; totalMs: number };
type Turn = { id: number; speaker: "customer" | "agent"; text: string; latency?: Latency };

type VoiceResponse = {
  transcript: string;
  responseText: string;
  audioBase64: string;
  latency: Latency;
};

type Status = "idle" | "listening" | "thinking" | "speaking" | "error";

const fmtMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`);

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read recorded audio"));
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      const comma = dataUrl.indexOf(",");
      resolve(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
    };
    reader.readAsDataURL(blob);
  });
}

const STATUS_META: Record<Status, { label: string; dot: string; text: string }> = {
  idle: { label: "Ready", dot: "bg-slate-500", text: "text-slate-400" },
  listening: { label: "Listening…", dot: "bg-rose-400 animate-pulse", text: "text-rose-300" },
  thinking: { label: "Agent thinking…", dot: "bg-gold-400 animate-pulse", text: "text-gold-300" },
  speaking: { label: "Agent speaking…", dot: "bg-emerald-400 animate-pulse", text: "text-emerald-300" },
  error: { label: "Error", dot: "bg-rose-500", text: "text-rose-300" },
};

export default function VoiceTestPage() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [lastLatency, setLastLatency] = useState<Latency | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [audioSupported, setAudioSupported] = useState(true);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const turnId = useRef(0);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [turns]);

  useEffect(() => {
    if (typeof window !== "undefined" && typeof MediaRecorder === "undefined") {
      setAudioSupported(false);
    }
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      audioRef.current?.pause();
    };
  }, []);

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  };

  const playAgentAudio = useCallback((audioBase64: string) => {
    stopAudio();
    const audio = new Audio(`data:audio/mpeg;base64,${audioBase64}`);
    audioRef.current = audio;
    setStatus("speaking");
    const done = () => {
      if (audioRef.current === audio) {
        audioRef.current = null;
        setStatus(prev => (prev === "speaking" ? "idle" : prev));
      }
    };
    audio.addEventListener("ended", done, { once: true });
    audio.addEventListener("error", done, { once: true });
    audio.play().catch(() => done());
  }, []);

  const runExchange = useCallback(
    async (audioBase64: string) => {
      setStatus("thinking");
      setError(null);
      try {
        const res = await fetch("/api/voice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audioBase64 }),
        });
        const data = (await res.json().catch(() => ({}))) as Partial<VoiceResponse> & { error?: string };
        if (!res.ok) {
          throw new Error(data.error || `Voice API error (HTTP ${res.status})`);
        }
        if (!data.transcript && !data.responseText) {
          throw new Error("Incomplete response from voice API");
        }
        const latency = data.latency ?? { sttMs: 0, llmMs: 0, ttsMs: 0, totalMs: 0 };

        const customerText = data.transcript?.trim() ? data.transcript : "(no speech detected)";
        setTurns(prev => [
          ...prev,
          { id: turnId.current++, speaker: "customer", text: customerText, latency },
          { id: turnId.current++, speaker: "agent", text: data.responseText || "", latency },
        ]);
        setLastLatency(latency);

        if (data.audioBase64) {
          playAgentAudio(data.audioBase64);
        } else {
          setStatus("idle");
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("Voice test exchange failed:", err);
        setError(
          message.includes("HTTP 5") || message.includes("check API keys") || message.includes("Voice service")
            ? "Voice service unavailable — check API keys (Deepgram / ElevenLabs) are configured."
            : `Could not reach the voice pipeline: ${message}`
        );
        setStatus("error");
      }
    },
    [playAgentAudio]
  );

  const startRecording = async () => {
    if (isRecording || busy) return;
    setError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Recording is not supported in this browser — use the Simulate call button instead.");
      setStatus("error");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      let mimeType = "";
      if (typeof MediaRecorder !== "undefined") {
        if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) mimeType = "audio/webm;codecs=opus";
        else if (MediaRecorder.isTypeSupported("audio/webm")) mimeType = "audio/webm";
        else if (MediaRecorder.isTypeSupported("audio/mp4")) mimeType = "audio/mp4";
      }
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      recorder.ondataavailable = e => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunks, { type: mimeType || "audio/webm" });
        setIsRecording(false);
        try {
          const b64 = await blobToBase64(blob);
          await runExchange(b64);
        } catch (err) {
          console.error("Recording exchange failed:", err);
          setError("Could not process the recording. Try again, or use Simulate call.");
          setStatus("error");
        }
      };
      recorderRef.current = recorder;
      streamRef.current = stream;
      recorder.start();
      setIsRecording(true);
      setStatus("listening");
    } catch (err) {
      console.error("Mic access failed:", err);
      setError("Microphone access was denied or is unavailable — allow mic permission and try again, or use Simulate call.");
      setStatus("error");
    }
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  };

  const simulateCall = async () => {
    if (busy || isRecording) return;
    setBusy(true);
    setError(null);
    setStatus("thinking");
    try {
      const res = await fetch("/api/voice/sample");
      const data = (await res.json().catch(() => ({}))) as { audioBase64?: string; error?: string };
      if (!res.ok || !data.audioBase64) {
        throw new Error(data.error || `Sample synthesis failed (HTTP ${res.status})`);
      }
      await runExchange(data.audioBase64);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("Simulate call failed:", err);
      setError(
        message.includes("check API keys") || message.includes("Voice service")
          ? "Voice service unavailable — check API keys (Deepgram / ElevenLabs) are configured."
          : `Could not run the simulated call: ${message}`
      );
      setStatus("error");
    } finally {
      setBusy(false);
    }
  };

  const clearAll = () => {
    stopAudio();
    setTurns([]);
    setLastLatency(null);
    setError(null);
    setStatus("idle");
  };

  const statusMeta = STATUS_META[status];

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto w-full max-w-4xl">
        {/* Header */}
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-[.18em] text-gold-400">
              ● Live pipeline test
            </p>
            <h1 className="text-xl font-bold text-white">Voice Pipeline Test</h1>
            <p className="mt-1 text-sm text-slate-400">
              Real end-to-end run: <span className="text-slate-300">Deepgram STT</span> →{" "}
              <span className="text-slate-300">Alex (objection orchestrator)</span> →{" "}
              <span className="text-slate-300">ElevenLabs TTS</span>. Every transcript and every
              reply below comes from the live <code className="text-gold-300">/api/voice</code>{" "}
              pipeline — nothing is canned.
            </p>
          </div>
          <div
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${
              status === "error"
                ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
                : "border-navy-700 bg-navy-800/60 text-slate-300"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${statusMeta.dot}`} />
            {statusMeta.label}
          </div>
        </div>

        {/* Controls */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          {!isRecording ? (
            <button
              onClick={startRecording}
              disabled={busy || !audioSupported}
              className="rounded-lg bg-rose-500/90 px-6 py-3 text-sm font-bold text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              🎙 Record
            </button>
          ) : (
            <button
              onClick={stopRecording}
              className="rounded-lg bg-rose-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-rose-500"
            >
              ■ Stop
            </button>
          )}
          <button
            onClick={simulateCall}
            disabled={busy || isRecording}
            className="rounded-lg bg-gold-500 px-6 py-3 text-sm font-semibold text-navy-900 transition hover:bg-gold-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ▶ Simulate call
          </button>
          {turns.length > 0 && (
            <button
              onClick={clearAll}
              className="rounded-lg border border-navy-600 px-4 py-3 text-sm text-slate-400 transition hover:border-navy-500 hover:text-slate-200"
            >
              Clear
            </button>
          )}
        </div>

        {/* Hint + status line */}
        <p className="mb-4 text-xs text-slate-500">
          {audioSupported
            ? "Record — speak into your mic — or hit Simulate call to hear a full round trip without speaking: sample audio in → real transcript → real AI reply → real AI voice out."
            : "This browser doesn't support mic recording — use the Simulate call button for a full live round trip."}
        </p>

        {/* Error banner */}
        {error && (
          <div className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 p-4">
            <p className="text-sm font-semibold text-rose-300">Voice service unavailable</p>
            <p className="mt-1 text-sm text-rose-200/80">{error}</p>
          </div>
        )}

        {/* Transcript */}
        <div className="mb-5 rounded-xl border border-navy-700/50 bg-navy-800/40 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gold-500">Transcript</h2>
            <span className="text-xs text-slate-500">
              {turns.length === 0 ? "No exchanges yet" : `${turns.length / 2} exchange(s)`}
            </span>
          </div>
          {turns.length === 0 ? (
            <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-navy-700 text-sm text-slate-500">
              Customer and agent messages will appear here in real time.
            </div>
          ) : (
            <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
              {turns.map(turn => (
                <div
                  key={turn.id}
                  className={`flex ${turn.speaker === "agent" ? "justify-start" : "justify-end"} message-new`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-4 py-2.5 text-sm ${
                      turn.speaker === "agent"
                        ? "bg-navy-700/60 text-slate-200"
                        : "bg-gold-500/15 text-gold-200 ring-1 ring-gold-500/30"
                    }`}
                  >
                    <span
                      className={`mb-0.5 block text-[11px] font-semibold uppercase tracking-wide ${
                        turn.speaker === "agent" ? "text-slate-400" : "text-gold-400/80"
                      }`}
                    >
                      {turn.speaker === "agent" ? "Apex Agent" : "Customer"}
                    </span>
                    {turn.text}
                    {turn.latency && turn.speaker === "agent" && (
                      <span className="mt-1.5 block text-[10px] text-slate-500">
                        STT {fmtMs(turn.latency.sttMs)} · Think {fmtMs(turn.latency.llmMs)} · TTS{" "}
                        {fmtMs(turn.latency.ttsMs)} · Total {fmtMs(turn.latency.totalMs)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              <div ref={transcriptEndRef} />
            </div>
          )}
        </div>

        {/* Latency breakdown (last exchange, measured) */}
        <div className="rounded-xl border border-navy-700/50 bg-navy-800/40 p-5">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-gold-500">
            Latency Breakdown
          </h2>
          <p className="mb-4 text-xs text-slate-500">
            Measured from the live API response of the last exchange — not simulated.
          </p>
          {lastLatency ? (
            <div className="space-y-3">
              {(
                [
                  ["STT (Deepgram Nova-2)", lastLatency.sttMs],
                  ["Orchestrator (objection matrix)", lastLatency.llmMs],
                  ["TTS (ElevenLabs Turbo)", lastLatency.ttsMs],
                  ["Total round trip", lastLatency.totalMs],
                ] as const
              ).map(([label, ms], i) => {
                const total = lastLatency.totalMs || 1;
                const pct = Math.max(2, Math.round((ms / total) * 100));
                return (
                  <div key={label}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className={i === 3 ? "font-semibold text-gold-400" : "text-slate-300"}>
                        {label}
                      </span>
                      <span className={i === 3 ? "font-bold text-gold-400" : "text-slate-400"}>
                        {fmtMs(ms)}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded bg-navy-700">
                      <div
                        className={`h-full rounded ${i === 3 ? "bg-gold-400" : "bg-navy-600"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              Run a recording or a simulated call to see real timings.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
