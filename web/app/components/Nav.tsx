"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/app/components/AuthProvider";

export default function Nav() {
  const { isAdmin, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  const links = [
    { href: "/", label: "Leaderboard" },
    { href: "/games", label: "Games" },
    { href: "/stats", label: "Stats" },
    ...(isAdmin
      ? [{ href: "/record", label: "Record" }]
      : [{ href: "/login", label: "Login" }]),
  ];

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <nav className="border-b border-gray-800 px-4 md:px-6 py-3 md:py-4">
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        {/* Logo — always visible */}
        <Link href="/" onClick={() => setMenuOpen(false)}>
          <img src="/logo.png" alt="Rankin YMCA Stats" width={120} height={40} />
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-6 text-sm text-gray-400">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`hover:text-white transition-colors ${isActive(link.href) ? "text-white" : ""}`}
            >
              {link.label}
            </Link>
          ))}
          {isAdmin && (
            <button
              onClick={logout}
              className="text-gray-500 hover:text-red-400 transition-colors"
            >
              Logout
            </button>
          )}
        </div>

        {/* Mobile hamburger button */}
        <button
          onClick={() => setMenuOpen((prev) => !prev)}
          className="md:hidden p-2 text-gray-400 hover:text-white transition-colors"
          aria-label="Menu"
        >
          {menuOpen ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div className="md:hidden mt-3 pt-3 border-t border-gray-800 flex flex-col gap-3 text-sm">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className={`py-1 transition-colors ${isActive(link.href) ? "text-white" : "text-gray-400 hover:text-white"}`}
            >
              {link.label}
            </Link>
          ))}
          {isAdmin && (
            <button
              onClick={() => { logout(); setMenuOpen(false); }}
              className="text-left py-1 text-gray-500 hover:text-red-400 transition-colors"
            >
              Logout
            </button>
          )}
        </div>
      )}
    </nav>
  );
}
