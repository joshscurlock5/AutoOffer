"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { site } from "@/lib/site-config";
import { Lock, ArrowRight } from "@/components/icons";

export default function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setError("Incorrect password. Please try again.");
        setLoading(false);
        return;
      }
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-[70vh] place-items-center bg-slate-50 px-5 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-navy text-white">
            <Lock className="h-7 w-7" />
          </span>
          <h1 className="mt-4 font-display text-2xl font-bold text-navy">
            {site.name} Admin
          </h1>
          <p className="mt-1 text-sm text-muted">Enter your password to view leads.</p>
        </div>

        <form onSubmit={submit} className="card p-6">
          <label className="label" htmlFor="pw">Password</label>
          <input
            id="pw"
            type="password"
            autoFocus
            className="field"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary mt-5 w-full disabled:opacity-60">
            {loading ? "Signing in…" : "Sign In"}
            {!loading && <ArrowRight className="h-4 w-4" />}
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-muted">
          Set the password in <code className="rounded bg-slate-200 px-1">.env.local</code>
        </p>
      </div>
    </div>
  );
}
