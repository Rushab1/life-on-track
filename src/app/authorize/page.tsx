"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";

/** Extract OAuth params from URL query string. */
function getOAuthParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    response_type: params.get("response_type"),
    client_id: params.get("client_id") ?? "",
    redirect_uri: params.get("redirect_uri") ?? "",
    code_challenge: params.get("code_challenge") ?? "",
    code_challenge_method: params.get("code_challenge_method"),
    state: params.get("state") ?? "",
    scope: params.get("scope") ?? "",
  };
}

const STORAGE_KEY = "oauth_authorize_params";

export default function AuthorizePage() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [consenting, setConsenting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore or read OAuth params
  const [oauthParams, setOauthParams] = useState<ReturnType<typeof getOAuthParams> | null>(null);

  useEffect(() => {
    // On mount: read params from URL, or restore from sessionStorage (after magic link return)
    const urlParams = getOAuthParams();
    if (urlParams.client_id && urlParams.redirect_uri) {
      // Fresh redirect from Claude — save params
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(urlParams));
      setOauthParams(urlParams);
    } else {
      // Returning from magic link — restore
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        setOauthParams(JSON.parse(stored) as ReturnType<typeof getOAuthParams>);
      }
    }

    // Check session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Magic link should redirect back to this page (params restored from sessionStorage)
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + "/authorize" },
    });

    setLoading(false);
    if (err) {
      setError(err.message);
    } else {
      setMagicLinkSent(true);
    }
  };

  const handleConsent = useCallback(async () => {
    if (!session || !oauthParams) return;
    setConsenting(true);
    setError(null);

    try {
      const res = await fetch("/api/oauth/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: oauthParams.client_id,
          redirect_uri: oauthParams.redirect_uri,
          code_challenge: oauthParams.code_challenge,
          state: oauthParams.state,
          scope: oauthParams.scope,
          access_token: session.access_token,
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Authorization failed");
        setConsenting(false);
        return;
      }

      // Clean up stored params and redirect
      sessionStorage.removeItem(STORAGE_KEY);
      window.location.href = body.redirect_url;
    } catch {
      setError("Network error");
      setConsenting(false);
    }
  }, [session, oauthParams]);

  const handleDeny = async () => {
    if (!oauthParams?.redirect_uri) return;
    sessionStorage.removeItem(STORAGE_KEY);
    // The server validates redirect_uri against the client registration —
    // never redirect the browser to a raw query-string URL (open redirect).
    try {
      const res = await fetch("/api/oauth/deny", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: oauthParams.client_id,
          redirect_uri: oauthParams.redirect_uri,
          state: oauthParams.state,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Invalid authorization request");
        return;
      }
      window.location.href = body.redirect_url;
    } catch {
      setError("Network error");
    }
  };

  // --- Validation ---
  if (!loading && !oauthParams?.client_id) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <p className="text-stone-500">Invalid authorization request. Missing parameters.</p>
      </div>
    );
  }

  // --- Login form ---
  if (!loading && !session) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold tracking-tight text-stone-100 text-center mb-2">Life on Track</h1>
          <p className="text-stone-500 text-center text-sm mb-8">
            Sign in to authorize access to your data
          </p>
          <div className="card p-6">
            {magicLinkSent ? (
              <div className="text-center">
                <p className="text-stone-100 font-medium mb-2">Check your email</p>
                <p className="text-stone-500 text-sm">
                  We sent a magic link to <strong>{email}</strong>
                </p>
              </div>
            ) : (
              <form onSubmit={handleLogin}>
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
                {error && <p className="text-rose-400 text-sm mb-4">{error}</p>}
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
        </div>
      </div>
    );
  }

  // --- Loading ---
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-stone-500">Loading...</p>
      </div>
    );
  }

  // --- Consent screen ---
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold tracking-tight text-stone-100 text-center mb-2">Authorize Access</h1>
        <p className="text-stone-500 text-center text-sm mb-8">
          An application wants to access your Life on Track data
        </p>
        <div className="card p-6">
          <div className="mb-6">
            <p className="text-sm text-stone-300 mb-3">This will allow the application to:</p>
            <ul className="text-sm text-stone-400 space-y-1.5 ml-4 list-disc">
              <li>Read and write your daily logs</li>
              <li>Read and write your activities</li>
              <li>Read and write your workouts</li>
              <li>Read and write your plans</li>
            </ul>
          </div>
          <p className="text-xs text-stone-500 mb-4">
            Signed in as {session?.user?.email}
          </p>
          {error && <p className="text-rose-400 text-sm mb-4">{error}</p>}
          <div className="flex gap-3">
            <button
              onClick={handleDeny}
              className="btn btn-secondary flex-1 py-2.5"
            >
              Deny
            </button>
            <button
              onClick={handleConsent}
              disabled={consenting}
              className="btn btn-primary flex-1 py-2.5"
            >
              {consenting ? "Authorizing..." : "Allow"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
