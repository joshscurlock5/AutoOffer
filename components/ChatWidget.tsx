"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { site } from "@/lib/site-config";
import type { ChatMessage } from "@/lib/types";
import { Chat, Send, X } from "./icons";

const KEY = "ao_chat_id";

export default function ChatWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [convId, setConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
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

  // Poll for new (admin) messages while the panel is open.
  useEffect(() => {
    if (!open || !convId) return;
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
  }, [open, convId]);

  // Keep the thread scrolled to the latest message.
  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, open]);

  // Don't show the widget in the admin panel.
  if (pathname?.startsWith("/admin")) return null;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    // Optimistic echo.
    const optimistic: ChatMessage = {
      id: `local-${Date.now()}`,
      role: "visitor",
      text,
      at: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);
    setInput("");
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: convId, text }),
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
      /* leave the optimistic message; the next poll/send will reconcile */
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {/* Launcher button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Chat with us"
          className="fixed bottom-24 right-4 z-50 flex items-center gap-2 rounded-full bg-brand px-4 py-3 text-white shadow-lift transition hover:bg-brand-600 lg:bottom-5 lg:right-5"
        >
          <Chat className="h-5 w-5" />
          <span className="text-sm font-semibold">Chat</span>
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed bottom-24 right-4 z-50 flex h-[28rem] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lift lg:bottom-5 lg:right-5">
          <div className="flex items-center justify-between bg-navy px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <Chat className="h-5 w-5 text-brand-200" />
              <div className="leading-tight">
                <div className="text-sm font-bold">Chat with {site.name}</div>
                <div className="text-[11px] text-white/70">A real person — usually replies fast</div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close chat" className="rounded-lg p-1 text-white/80 hover:bg-white/10">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4">
            <Bubble role="admin">
              👋 Hi! Ask us anything about selling your car — we&apos;ll get right back to you.
            </Bubble>
            {messages.map((m) => (
              <Bubble key={m.id} role={m.role}>
                {m.text}
              </Bubble>
            ))}
          </div>

          <form onSubmit={send} className="flex items-center gap-2 border-t border-slate-200 p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message…"
              maxLength={2000}
              className="field flex-1 py-2"
              autoFocus
            />
            <button
              type="submit"
              disabled={!input.trim() || sending}
              aria-label="Send"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand text-white transition hover:bg-brand-600 disabled:opacity-50"
            >
              <Send className="h-5 w-5" />
            </button>
          </form>
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
          mine ? "bg-brand text-white" : "bg-white text-navy shadow-soft"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
