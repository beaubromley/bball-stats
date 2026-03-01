import type { Metadata } from "next";
import { Inter, Bebas_Neue } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import SpaRedirect from "./spa-redirect";
import RegisterSW from "./register-sw";
import { AuthProvider } from "./components/AuthProvider";
import ThemeProvider from "./components/ThemeProvider";
import Nav from "./components/Nav";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const bebasNeue = Bebas_Neue({
  weight: "400",
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "YBA Stats",
  description: "Pickup basketball stats tracker",
  manifest: "/manifest.json",
  themeColor: "#030712",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "YBA Stats",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body
        className={`${inter.variable} ${bebasNeue.variable} antialiased bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 min-h-screen`}
      >
        <ThemeProvider>
          <AuthProvider>
            <Nav />
            <SpaRedirect />
            <RegisterSW />
            <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
          </AuthProvider>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
