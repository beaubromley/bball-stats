import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import SpaRedirect from "./spa-redirect";
import RegisterSW from "./register-sw";
import { AuthProvider } from "./components/AuthProvider";
import Nav from "./components/Nav";
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
        <AuthProvider>
          <Nav />
          <SpaRedirect />
          <RegisterSW />
          <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
