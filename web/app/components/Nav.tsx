"use client";

import Link from "next/link";
import { useAuth } from "@/app/components/AuthProvider";

export default function Nav() {
  const { isAdmin, logout } = useAuth();

  return (
    <nav className="border-b border-gray-800 px-6 py-4">
      <div className="max-w-5xl mx-auto flex items-center gap-8">
        <Link href="/">
          <img src="/logo.png" alt="Rankin YMCA Stats" width={120} height={40} />
        </Link>
        <div className="flex gap-6 text-sm text-gray-400">
          <Link href="/" className="hover:text-white transition-colors">
            Leaderboard
          </Link>
          <Link href="/games" className="hover:text-white transition-colors">
            Games
          </Link>
          <Link href="/stats" className="hover:text-white transition-colors">
            Stats
          </Link>
          {isAdmin ? (
            <Link href="/record" className="hover:text-white transition-colors">
              Record
            </Link>
          ) : (
            <Link href="/login" className="hover:text-white transition-colors">
              Login
            </Link>
          )}
        </div>
        {isAdmin && (
          <button
            onClick={logout}
            className="ml-auto text-sm text-gray-500 hover:text-red-400 transition-colors"
          >
            Logout
          </button>
        )}
      </div>
    </nav>
  );
}
