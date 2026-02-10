import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import SpaRedirect from "./spa-redirect";
import RegisterSW from "./register-sw";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Bball Stats",
  description: "Pickup basketball stats tracker",
  manifest: "/manifest.json",
  themeColor: "#030712",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Bball Stats",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-950 text-gray-100 min-h-screen`}
      >
        <nav className="border-b border-gray-800 px-6 py-4">
          <div className="max-w-5xl mx-auto flex items-center gap-8">
            <Link href="/" className="text-xl font-bold text-white">
              Bball Stats
            </Link>
            <div className="flex gap-6 text-sm text-gray-400">
              <Link href="/" className="hover:text-white transition-colors">
                Leaderboard
              </Link>
              <Link
                href="/games"
                className="hover:text-white transition-colors"
              >
                Games
              </Link>
              <Link
                href="/record"
                className="hover:text-white transition-colors"
              >
                Record
              </Link>
            </div>
          </div>
        </nav>
        <SpaRedirect />
        <RegisterSW />
        <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
