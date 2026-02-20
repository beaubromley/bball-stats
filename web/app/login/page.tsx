"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/components/AuthProvider";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const ok = await login(password);
    setSubmitting(false);
    if (ok) {
      router.push("/record");
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
