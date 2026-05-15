/**
 * Client-side fetch wrapper that detects expired sessions and bounces
 * to the login page with a return URL.
 *
 * Usage — drop-in replacement for `fetch()` in any client-side authed
 * call:
 *
 *   import { authedFetch } from "@/lib/authed-fetch";
 *   const res = await authedFetch("/api/deepgram/token");
 *
 * On a 401 response the user is redirected to /login?return=<here>;
 * the call returns a rejected promise so any `.then()` chain stops
 * executing rather than continuing with a bad response.
 */
export async function authedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 401 && typeof window !== "undefined") {
    // Don't loop if we're already on the login page
    if (!window.location.pathname.startsWith("/login")) {
      const here = window.location.pathname + window.location.search;
      window.location.href = `/login?return=${encodeURIComponent(here)}`;
    }
    throw new Error("Session expired — redirecting to login");
  }
  return res;
}
