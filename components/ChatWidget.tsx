"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { site, telHref } from "@/lib/site-config";
import type { ChatMessage } from "@/lib/types";
import { Chat, Send, X, ChevronLeft, ChevronDown, ArrowRight, Phone, Home } from "./icons";

const KEY = "ao_chat_id";
type View = "home" | "messages" | "conversation";

// Quick-pick emojis for the message box. Literal emojis render fine in the
// browser (this is client-side, not the Telegram JSON path).
const EMOJIS = ["👍","🙏","😀","😂","❤️","🔥","🎉","👌","😊","🙌","💯","🚗","💰","✅","👋","🤝","😎","🤔","😅","🙂","😍","👏","✨","😉","😮","😢","🙃","🤷"];

// Placeholder team avatars (overlapping, like Clutch) so it reads as a team
// rather than a single bot. Swap these for real team photos when available.
const TEAM_AVATARS = [
  { initial: "S", className: "from-blue-500 to-blue-700" },
  { initial: "M", className: "from-emerald-500 to-emerald-700" },
  { initial: "A", className: "from-violet-500 to-violet-700" },
];

/** A usable phone (10+ digits) or a basic email — required before the first send. */
function validContact(v: string): boolean {
  const t = v.trim();
  if (t.replace(/\D/g, "").length >= 10) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

function AvatarStack() {
  return (
    <div className="flex shrink-0 -space-x-2">
      {TEAM_AVATARS.map((a) => (
        <span
          key={a.initial}
          className={`grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br ${a.className} text-xs font-bold text-white ring-2 ring-white`}
        >
          {a.initial}
        </span>
      ))}
    </div>
  );
}

export default function ChatWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("home");
  const [convId, setConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [contact, setContact] = useState("");
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Restore an existing conversation id (returning visitor).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const id = localStorage.getItem(KEY);
      if (id) setConvId(id);
    } catch {
      /* private mode */
    }
  }, []);

  // Poll for new (admin) messages while the conversation is open.
  useEffect(() => {
    if (!open || view !== "conversation" || !convId) return;
    let active = true;
    const load = async () => {
      try {
        const r = await fetch(`/api/chat?conversationId=${encodeURIComponent(convId)}`);
        const d = await r.json();
        if (active && Array.isArray(d.messages)) setMessages(d.messages);
      } catch {
        /* ignore */
      }
    };
    load();
    const t = setInterval(load, 5000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [open, view, convId]);

  // Keep the thread scrolled to the latest message.
  useEffect(() => {
    if (open && view === "conversation") scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, open, view]);

  if (pathname?.startsWith("/admin")) return null;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    // Require a phone or email before the first message of a new conversation.
    if (!convId && !validContact(contact)) return;
    setSending(true);
    const optimistic: ChatMessage = {
      id: `local-${Date.now()}`,
      role: "visitor",
      text,
      at: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);
    setInput("");
    setShowEmoji(false);
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: convId, text, contact: contact.trim() || undefined }),
      });
      const d = await r.json();
      if (d.conversationId) {
        setConvId(d.conversationId);
        try {
          localStorage.setItem(KEY, d.conversationId);
        } catch {
          /* ignore */
        }
      }
      if (Array.isArray(d.messages)) setMessages(d.messages);
    } catch {
      /* leave the optimistic message; the next poll/send reconciles */
    } finally {
      setSending(false);
    }
  }

  const rowClass =
    "flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left shadow-soft transition hover:-translate-y-0.5 hover:border-brand hover:shadow-card";

  const bottomNav = (
    <div className="grid grid-cols-2 border-t border-slate-200 bg-white">
      <button
        onClick={() => setView("home")}
        className={`flex flex-col items-center gap-0.5 py-2.5 text-xs font-semibold transition ${view === "home" ? "text-brand-700" : "text-muted hover:text-navy"}`}
      >
        <Home className="h-5 w-5" /> Home
      </button>
      <button
        onClick={() => setView("messages")}
        className={`flex flex-col items-center gap-0.5 py-2.5 text-xs font-semibold transition ${view === "messages" ? "text-brand-700" : "text-muted hover:text-navy"}`}
      >
        <Chat className="h-5 w-5" /> Messages
      </button>
    </div>
  );

  const lastMessage = messages[messages.length - 1];

  return (
    <>
      {/* Launcher (stays visible; flips to a chevron while open) */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close chat" : "Chat with us"}
        className="chat-fab fixed right-4 z-50 grid h-14 w-14 place-items-center rounded-full bg-brand-600 text-white shadow-lift hover:-translate-y-0.5 hover:bg-brand-700 lg:right-5"
      >
        {open ? <ChevronDown className="h-6 w-6" /> : <Chat className="h-6 w-6" />}
      </button>

      {/* Panel */}
      {open && (
        <div className="chat-panel fixed right-4 z-50 flex h-[62rem] max-h-[calc(100vh-5rem)] w-[calc(100vw-2rem)] max-w-[35rem] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lift lg:right-5">
          {/* -------------------- HOME -------------------- */}
          {view === "home" && (
            <>
              <div className="bg-brand-600 px-5 pb-8 pt-5 text-white">
                <div className="flex items-center justify-between">
                  <span className="font-logo text-lg font-extrabold tracking-tight">DriveOffer</span>
                  <button onClick={() => setOpen(false)} aria-label="Close chat" className="rounded-lg p-1 text-white/80 transition hover:bg-white/10">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <h3 className="mt-12 font-display text-[1.7rem] font-extrabold leading-tight">Hi there 👋</h3>
                <p className="mt-1 text-lg font-medium text-white/90">How can we help you sell your car?</p>
              </div>

              <div className="-mt-4 flex-1 space-y-3 overflow-y-auto px-4 pb-4">
                <button onClick={() => setView("conversation")} className={rowClass}>
                  <span>
                    <span className="block font-bold text-navy">Send us a message</span>
                    <span className="block text-sm text-muted">We usually reply within minutes.</span>
                  </span>
                  <ArrowRight className="h-5 w-5 shrink-0 text-brand-700" />
                </button>
                <a href={telHref} className={rowClass}>
                  <span>
                    <span className="block font-bold text-navy">Call or text us</span>
                    <span className="block text-sm text-muted">{site.phoneDisplay}</span>
                  </span>
                  <Phone className="h-5 w-5 shrink-0 text-brand-700" />
                </a>
                <Link href="/get-offer" onClick={() => setOpen(false)} className={rowClass}>
                  <span>
                    <span className="block font-bold text-navy">Get my free estimate</span>
                    <span className="block text-sm text-muted">See what your car is worth.</span>
                  </span>
                  <ArrowRight className="h-5 w-5 shrink-0 text-brand-700" />
                </Link>
              </div>

              {bottomNav}
            </>
          )}

          {/* -------------------- MESSAGES -------------------- */}
          {view === "messages" && (
            <>
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                <h3 className="font-display text-lg font-bold text-navy">Messages</h3>
                <button onClick={() => setOpen(false)} aria-label="Close chat" className="rounded-lg p-1 text-muted transition hover:bg-slate-100">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {messages.length > 0 ? (
                  <button
                    onClick={() => setView("conversation")}
                    className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-soft transition hover:border-brand"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-600 text-white">
                      <Chat className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-bold text-navy">{site.name} team</span>
                      <span className="block truncate text-sm text-muted">{lastMessage?.text}</span>
                    </span>
                  </button>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                    <Chat className="h-10 w-10 text-slate-300" />
                    <p className="mt-3 font-bold text-navy">No messages</p>
                    <p className="mt-1 text-sm text-muted">Messages from the team will be shown here.</p>
                  </div>
                )}
              </div>

              <div className="px-4 pb-4">
                <button onClick={() => setView("conversation")} className="btn-primary w-full">
                  Send us a message <ArrowRight className="h-4 w-4" />
                </button>
              </div>

              {bottomNav}
            </>
          )}

          {/* -------------------- CONVERSATION -------------------- */}
          {view === "conversation" && (
            <>
              <div className="flex items-center gap-2.5 border-b border-slate-200 px-3 py-3">
                <button onClick={() => setView("messages")} aria-label="Back" className="rounded-lg p-1 text-navy transition hover:bg-slate-100">
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <AvatarStack />
                <div className="flex-1 leading-tight">
                  <div className="text-sm font-bold text-navy">{site.name} team</div>
                </div>
                <button onClick={() => setOpen(false)} aria-label="Close chat" className="rounded-lg p-1 text-muted transition hover:bg-slate-100">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div ref={scrollRef} className="flex-1 overflow-y-auto bg-white p-4">
                <p className="px-6 py-8 text-center text-sm text-muted">
                  Ask us anything about the {site.name} process.
                </p>
                <div className="space-y-3">
                  {messages.map((m) => (
                    <Bubble key={m.id} role={m.role}>
                      {m.text}
                    </Bubble>
                  ))}
                </div>
              </div>

              <form onSubmit={send} className="relative border-t border-slate-200 p-3">
                {showEmoji && (
                  <div className="absolute bottom-full left-3 right-3 mb-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-lift">
                    <div className="grid grid-cols-7 gap-1">
                      {EMOJIS.map((em) => (
                        <button
                          key={em}
                          type="button"
                          onClick={() => setInput((v) => v + em)}
                          className="grid h-9 w-full place-items-center rounded-lg text-xl transition hover:bg-slate-100"
                        >
                          {em}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  {!convId && (
                    <input
                      value={contact}
                      onChange={(e) => setContact(e.target.value)}
                      placeholder="Your phone or email (so we can reply)"
                      maxLength={120}
                      className="field w-full py-2.5"
                      autoFocus
                    />
                  )}
                  <div className="flex items-center gap-2">
                    <input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Type a message…"
                      maxLength={2000}
                      className="field flex-1 py-2.5"
                    />
                    <button
                      type="button"
                      onClick={() => setShowEmoji((s) => !s)}
                      aria-label="Emoji picker"
                      aria-expanded={showEmoji}
                      className={`grid h-11 w-10 shrink-0 place-items-center rounded-xl text-xl transition hover:bg-slate-100 ${showEmoji ? "bg-slate-100" : ""}`}
                    >
                      🙂
                    </button>
                    <button
                      type="submit"
                      disabled={!input.trim() || sending || (!convId && !validContact(contact))}
                      aria-label="Send"
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-600 text-white transition hover:bg-brand-700 disabled:opacity-50"
                    >
                      <Send className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </form>
            </>
          )}
        </div>
      )}
    </>
  );
}

function Bubble({ role, children }: { role: "visitor" | "admin"; children: React.ReactNode }) {
  const mine = role === "visitor";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm ${
          mine ? "bg-brand-600 text-white" : "bg-white text-navy shadow-soft"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
