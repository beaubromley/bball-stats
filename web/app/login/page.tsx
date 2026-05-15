"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/app/components/AuthProvider";

function LoginInner() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  /**
   * Where to bounce back to after a successful login. Set by the
   * authedFetch wrapper when an API call 401s mid-session, so the user
   * lands back on the page they were trying to use. Sanity-checked to
   * a same-origin pathname to prevent open-redirect abuse.
   */
  function resolveReturnUrl(): string | null {
    const raw = searchParams.get("return");
    if (!raw) return null;
    // Only accept same-origin paths — no protocol-relative or absolute URLs.
    if (!raw.startsWith("/") || raw.startsWith("//")) return null;
    return raw;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const ok = await login(password);
    setSubmitting(false);
    if (ok) {
      const returnUrl = resolveReturnUrl();
      if (returnUrl) {
        router.push(returnUrl);
        return;
      }
      // No return URL: admin lands on record, viewer on home.
      const isAdminPw = password === "ymcaball";
      router.push(isAdminPw ? "/record" : "/");
    } else {
      setError("Wrong password");
    }
  }

  return (
    <div className="max-w-sm mx-auto py-16">
      <h1 className="text-2xl font-bold mb-6 text-center">Admin Login</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
          className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-600 focus:outline-none focus:border-blue-500"
        />
        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
        <button
          type="submit"
          disabled={submitting || !password}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 dark:disabled:text-gray-600 text-white font-semibold rounded-lg transition-colors"
        >
          {submitting ? "Logging in..." : "Log In"}
        </button>
      </form>
      <p className="text-center text-xs text-gray-400 dark:text-gray-600 italic mt-8">
        &ldquo;He who determines what is measured determines what is true.&rdquo;
      </p>
    </div>
  );
}

export default function LoginPage() {
  // useSearchParams requires a Suspense boundary in app router.
  return (
    <Suspense fallback={<div className="text-gray-500 text-center py-16">Loading...</div>}>
      <LoginInner />
    </Suspense>
  );
}
