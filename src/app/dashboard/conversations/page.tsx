"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface ConversationMessage {
  id: string;
  sender_role: string;
  content: string;
  created_at: string;
}

interface ConversationFeedItem {
  id: string;
  lead_id: string | null;
  channel: string;
  direction: string;
  summary: string | null;
  sentiment_score: number | null;
  key_objections: string[] | null;
  ai_agent_id: string | null;
  created_at: string;
  lead_first_name: string | null;
  lead_last_name: string | null;
  lead_email: string | null;
  messages: ConversationMessage[];
}

const CHANNEL_ICONS: Record<string, string> = {
  voice: "📞",
  sms: "💬",
  email: "✉️",
  web_chat: "💻",
};

const fmtDate = (iso: string): string =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

function sentimentColor(score: number | null): string {
  if (score === null) return "bg-slate-600/30 text-slate-400";
  if (score >= 0.6) return "bg-emerald-500/20 text-emerald-400";
  if (score >= 0.4) return "bg-amber-500/20 text-amber-400";
  return "bg-red-500/20 text-red-400";
}

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<ConversationFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/conversations/feed", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`Request failed (${r.status})`);
        return r.json();
      })
      .then((data) => setConversations(data as ConversationFeedItem[]))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load conversations"))
      .finally(() => setLoading(false));
  }, []);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex-1 overflow-auto p-8">
      <h2 className="text-lg font-bold text-slate-200">Conversations</h2>
      <p className="mt-1 text-sm text-slate-500">
        Live conversation history across voice, SMS, and email. Click a conversation to read the full thread.
      </p>

      {loading && (
        <div className="mt-6 rounded-xl border border-navy-700 bg-navy-800/60 p-5 text-sm text-slate-400">
          Loading conversations…
        </div>
      )}

      {error && (
        <div className="mt-6 max-w-2xl rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-300">
          Could not load conversations: {error}
        </div>
      )}

      {!loading && !error && conversations.length === 0 && (
        <div className="mt-16 flex flex-col items-center justify-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-navy-800 text-2xl">
            💬
          </div>
          <h3 className="text-base font-semibold text-slate-300">No conversations yet</h3>
          <p className="mt-1 max-w-sm text-sm text-slate-500">
            When the AI agents connect with leads, their conversations will appear here.
          </p>
        </div>
      )}

      {!loading && !error && conversations.length > 0 && (
        <div className="mt-6 space-y-4">
          {conversations.map((conv) => {
            const isOpen = expanded.has(conv.id);
            const leadName =
              conv.lead_first_name && conv.lead_last_name
                ? `${conv.lead_first_name} ${conv.lead_last_name}`
                : "Unknown lead";
            const latest = conv.messages[conv.messages.length - 1];
            const preview = latest?.content ?? conv.summary ?? "No messages yet";
            const score = conv.sentiment_score as number | null;

            return (
              <div
                key={conv.id}
                className="overflow-hidden rounded-xl border border-navy-700/50 bg-navy-800/60 transition hover:border-navy-600"
              >
                <button
                  onClick={() => toggle(conv.id)}
                  className="flex w-full flex-col gap-2 p-5 text-left sm:flex-row sm:items-center"
                >
                  {/* Channel icon */}
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-navy-700 text-lg">
                    {CHANNEL_ICONS[conv.channel] ?? "💬"}
                  </span>

                  {/* Body */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {conv.lead_id ? (
                        <Link
                          href={`/dashboard?select=${encodeURIComponent(conv.lead_id)}`}
                          className="font-semibold text-slate-200 underline-offset-2 hover:text-gold-400 hover:underline"
                          title="Open this lead"
                        >
                          {leadName} →
                        </Link>
                      ) : (
                        <span className="font-semibold text-slate-200">{leadName}</span>
                      )}
                      <span className="rounded bg-navy-700 px-2 py-0.5 text-[10px] font-medium uppercase text-slate-400">
                        {conv.channel}
                      </span>
                      <span className="text-[10px] text-slate-500 capitalize">{conv.direction}</span>
                      <span className="ml-auto text-xs text-slate-500">{fmtDate(conv.created_at)}</span>
                    </div>
                    <p className="mt-1 truncate text-sm text-slate-400">{preview}</p>
                  </div>

                  {/* Sentiment + expand */}
                  <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${sentimentColor(score)}`}>
                      Sentiment {score !== null ? `${(score * 100).toFixed(0)}%` : "—"}
                    </span>
                    <span
                      className={`text-xs text-slate-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    >
                      ▼
                    </span>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-navy-700/40 bg-navy-900/40 px-5 py-4">
                    {conv.summary && (
                      <p className="mb-4 text-xs leading-relaxed text-slate-300">{conv.summary}</p>
                    )}
                    {conv.key_objections && conv.key_objections.length > 0 && (
                      <div className="mb-4 flex flex-wrap gap-1">
                        {conv.key_objections.map((obj, i) => (
                          <span
                            key={i}
                            className="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] text-red-400"
                          >
                            {obj.replace(/_/g, " ")}
                          </span>
                        ))}
                      </div>
                    )}
                    {conv.messages.length === 0 ? (
                      <p className="text-xs text-slate-600">No messages in this thread.</p>
                    ) : (
                      <div className="space-y-2">
                        {conv.messages.map((msg) => {
                          const isAi = msg.sender_role === "ai";
                          return (
                            <div key={msg.id} className={`flex ${isAi ? "justify-start" : "justify-end"}`}>
                              <div
                                className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                                  isAi ? "bg-navy-700 text-slate-200" : "bg-gold-500/20 text-gold-300"
                                }`}
                              >
                                <p className="mb-0.5 text-[10px] font-semibold uppercase opacity-60">
                                  {isAi ? "AI Agent" : leadName}
                                </p>
                                <p>{msg.content}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
