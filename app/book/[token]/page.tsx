"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { cad } from "@/lib/format";
import { site } from "@/lib/site-config";

type Slot = { iso: string; timeLabel: string };
type Day = { date: string; dateLabel: string; slots: Slot[] };
type BookData = {
  ok: boolean;
  vehicle: { year: number | string; make: string; model: string } | null;
  offer: { low: number; high: number } | null;
  booked: string | null;
  days: Day[];
};

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

export default function BookPage() {
  const params = useParams<{ token: string }>();
  const token = (params?.token as string) || "";

  const [data, setData] = useState<BookData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState("");
  const [slot, setSlot] = useState("");
  const [location, setLocation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/book?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d: BookData) => {
        setData(d);
        if (d.ok && d.days?.length) setSelectedDate(d.days[0].date);
      })
      .catch(() => setData({ ok: false } as BookData))
      .finally(() => setLoading(false));
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!slot) {
      setError("Please pick a time.");
      return;
    }
    if (!location.trim()) {
      setError("Please enter the address or location where we should meet you.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const r = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, startISO: slot, location: location.trim() }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error();
      setDone(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError("Couldn't book that time — please pick another, or call/text us.");
    } finally {
      setSubmitting(false);
    }
  }

  const car = data?.vehicle ? `${data.vehicle.year} ${data.vehicle.make} ${data.vehicle.model}` : "your car";

  // Build a month-style calendar grid spanning the available days.
  function buildCalendar(days: Day[]) {
    const avail = new Set(days.map((d) => d.date));
    const parse = (s: string) => {
      const [y, m, d] = s.split("-").map(Number);
      return new Date(y, m - 1, d);
    };
    const first = parse(days[0].date);
    const last = parse(days[days.length - 1].date);
    const start = new Date(first);
    start.setDate(start.getDate() - start.getDay()); // back to Sunday
    const end = new Date(last);
    end.setDate(end.getDate() + (6 - end.getDay())); // forward to Saturday
    const cells: { key: string; day: number; avail: boolean }[] = [];
    for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) {
      const y = dt.getFullYear();
      const m = dt.getMonth() + 1;
      const d = dt.getDate();
      const key = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({ key, day: d, avail: avail.has(key) });
    }
    const monthLabel =
      first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear()
        ? first.toLocaleDateString("en-CA", { month: "long", year: "numeric" })
        : `${first.toLocaleDateString("en-CA", { month: "long" })} – ${last.toLocaleDateString("en-CA", { month: "long", year: "numeric" })}`;
    return { cells, monthLabel };
  }

  const selectedDay = data?.days?.find((d) => d.date === selectedDate) || null;

  return (
    <div className="container-x py-10 sm:py-14">
      <div className="mx-auto max-w-2xl">
        {loading ? (
          <div className="card p-8 text-center text-muted">Loading your booking…</div>
        ) : !data?.ok ? (
          <div className="card p-8 text-center">
            <h1 className="font-display text-2xl font-bold text-navy">Booking link not found</h1>
            <p className="mt-2 text-muted">This link may have expired. Please call or text us and we&apos;ll set up your pickup.</p>
          </div>
        ) : done ? (
          <div className="card p-8 text-center">
            <div className="text-5xl">✅</div>
            <h1 className="mt-4 font-display text-3xl font-extrabold text-navy">You&apos;re booked!</h1>
            <p className="mt-3 text-lg text-muted">
              We&apos;ve sent a confirmation with your date, time, and location. A DriveOffer rep will come to you, confirm your offer on the spot, and pay you right there if it&apos;s a yes.
            </p>
          </div>
        ) : (
          <>
            <h1 className="text-center font-display text-2xl font-bold text-navy sm:text-3xl">Book your pickup</h1>
            <p className="mt-2 text-center text-muted">
              Pick a time for {car}. We come to you, confirm your offer, and pay on the spot.
            </p>
            {data.offer && (
              <p className="mt-2 text-center text-sm font-semibold text-emerald-700">
                Your offer: {cad(data.offer.low)} – {cad(data.offer.high)}
              </p>
            )}
            <p className="mx-auto mt-3 max-w-md rounded-xl bg-emerald-50 px-4 py-2.5 text-center text-sm text-navy">
              Booking here is optional — the fastest way to finalize is to{" "}
              <a href={`tel:${site.phoneE164}`} className="font-semibold text-emerald-700 hover:underline">
                call or text {site.phoneDisplay}
              </a>
              .
            </p>

            {data.days.length === 0 ? (
              <div className="card mt-6 p-8 text-center text-muted">
                No open times online right now — please call or text us and we&apos;ll set one up.
              </div>
            ) : (
              <form onSubmit={submit} className="card mt-6 p-6 sm:p-8">
                {(() => {
                  const { cells, monthLabel } = buildCalendar(data.days);
                  return (
                    <div>
                      <div className="mb-3 flex items-center justify-between">
                        <span className="label mb-0">Choose a day</span>
                        <span className="text-sm font-semibold text-navy">{monthLabel}</span>
                      </div>
                      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-muted">
                        {WEEKDAYS.map((w, i) => (
                          <div key={i} className="py-1">{w}</div>
                        ))}
                      </div>
                      <div className="mt-1 grid grid-cols-7 gap-1">
                        {cells.map((c) =>
                          c.avail ? (
                            <button
                              key={c.key}
                              type="button"
                              onClick={() => {
                                setSelectedDate(c.key);
                                setSlot("");
                              }}
                              aria-pressed={selectedDate === c.key}
                              className={`aspect-square rounded-lg text-sm font-semibold transition ${
                                selectedDate === c.key
                                  ? "bg-brand-600 text-white shadow-soft"
                                  : "bg-brand-600/5 text-navy hover:bg-brand-600/15"
                              }`}
                            >
                              {c.day}
                            </button>
                          ) : (
                            <div key={c.key} className="grid aspect-square place-items-center text-sm text-slate-300">
                              {c.day}
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  );
                })()}

                {selectedDay && (
                  <div className="mt-6">
                    <label className="label">
                      Choose a time <span className="font-normal text-muted">· {selectedDay.dateLabel}</span>
                    </label>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {selectedDay.slots.map((s) => (
                        <button
                          key={s.iso}
                          type="button"
                          onClick={() => setSlot(s.iso)}
                          className={`rounded-xl border px-2 py-2.5 text-sm font-semibold transition ${
                            slot === s.iso ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 bg-white text-navy hover:border-brand-600"
                          }`}
                        >
                          {s.timeLabel}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-6">
                  <label className="label" htmlFor="loc">Address / location</label>
                  <input
                    id="loc"
                    className="field"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Where should we meet you?"
                    autoComplete="street-address"
                  />
                  <p className="mt-1.5 text-xs text-muted">We come to you — just the address or spot where we&apos;ll meet.</p>
                </div>

                {error && <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

                <button type="submit" disabled={submitting} className="btn-primary mt-6 w-full py-4 text-lg disabled:opacity-60">
                  {submitting ? "Booking…" : "Confirm my pickup"}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
