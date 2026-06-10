"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function AuthForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });

    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-8">
          <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 shadow-[0_0_10px_rgb(129_140_248_/_0.9)]" aria-hidden="true" />
          <h1 className="text-2xl font-bold tracking-tight text-stone-100 text-center">
            Life on Track
          </h1>
        </div>
        <div className="card p-6">
          {sent ? (
            <div className="text-center">
              <p className="text-stone-100 font-medium mb-2">Check your email</p>
              <p className="text-stone-500 text-sm">
                We sent a magic link to <strong>{email}</strong>
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <label htmlFor="email" className="label">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="input mb-4"
              />
              {error && (
                <p className="text-rose-400 text-sm mb-4">{error}</p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary w-full py-2.5"
              >
                {loading ? "Sending..." : "Send magic link"}
              </button>
            </form>
          )}
        </div>
        <p className="text-center text-xs text-stone-500 mt-6">
          <a href="/privacy" className="hover:text-stone-300 transition-colors">
            Privacy Policy
          </a>
          <span className="mx-2">·</span>
          <a href="/terms" className="hover:text-stone-300 transition-colors">
            Terms of Service
          </a>
        </p>
      </div>
    </div>
  );
}
