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

  const handleDeny = () => {
    if (!oauthParams?.redirect_uri) return;
    sessionStorage.removeItem(STORAGE_KEY);
    const url = new URL(oauthParams.redirect_uri);
    url.searchParams.set("error", "access_denied");
    if (oauthParams.state) url.searchParams.set("state", oauthParams.state);
    window.location.href = url.toString();
  };

  // --- Validation ---
  if (!loading && !oauthParams?.client_id) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <p className="text-gray-500">Invalid authorization request. Missing parameters.</p>
      </div>
    );
  }

  // --- Login form ---
  if (!loading && !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">Life on Track</h1>
          <p className="text-gray-500 text-center text-sm mb-8">
            Sign in to authorize access to your data
          </p>
          <div className="bg-white rounded-2xl shadow-sm p-6">
            {magicLinkSent ? (
              <div className="text-center">
                <p className="text-gray-900 font-medium mb-2">Check your email</p>
                <p className="text-gray-500 text-sm">
                  We sent a magic link to <strong>{email}</strong>
                </p>
              </div>
            ) : (
              <form onSubmit={handleLogin}>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent mb-4"
                />
                {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  // --- Consent screen ---
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">Authorize Access</h1>
        <p className="text-gray-500 text-center text-sm mb-8">
          An application wants to access your Life on Track data
        </p>
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <div className="mb-6">
            <p className="text-sm text-gray-700 mb-3">This will allow the application to:</p>
            <ul className="text-sm text-gray-600 space-y-1.5 ml-4 list-disc">
              <li>Read and write your daily logs</li>
              <li>Read and write your activities</li>
              <li>Read and write your workouts</li>
              <li>Read and write your plans</li>
            </ul>
          </div>
          <p className="text-xs text-gray-400 mb-4">
            Signed in as {session?.user?.email}
          </p>
          {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
          <div className="flex gap-3">
            <button
              onClick={handleDeny}
              className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              Deny
            </button>
            <button
              onClick={handleConsent}
              disabled={consenting}
              className="flex-1 py-2.5 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              {consenting ? "Authorizing..." : "Allow"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
