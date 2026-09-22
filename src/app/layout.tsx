import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { appUrl } from "@/lib/env";
import { SiteFooter } from "@/components/site-footer";
import { AnalyticsProvider } from "@/components/analytics-provider";
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
  title: {
    default: "Docloom — Docs that track your code",
    template: "%s · Docloom",
  },
  description:
    "Connect a GitHub repo and get accurate, structured markdown docs for your API — AST-verified structure, AI-written descriptions, auto-hosted at a clean docs site.",
  // appUrl() throws in production when APP_URL is unset — no silent
  // localhost fallback in deployed environments.
  metadataBase: new URL(appUrl()),
  icons: {
    // Brand order: SVG loom mark first, multi-resolution ICO fallback,
    // real Apple touch icon. (The favicon.ico asset is generated from
    // public/icon.svg by scripts/generate-icons.mjs — single brand source.)
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "48x48", type: "image/x-icon" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <AnalyticsProvider>{children}</AnalyticsProvider>
        <SiteFooter />
      </body>
    </html>
  );
}