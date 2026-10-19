import type { Metadata } from "next";
import "./globals.css";

// Canonical published origin. OG/Twitter images are resolved against this so
// share previews work off-domain. Override with NEXT_PUBLIC_SITE_URL if the
// site ever moves to a custom domain.
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://8092772b2ef8b4200cd7644b1c20224a.ctonew.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Apex Life AI — Your AI-Powered Life Insurance Sales Team",
  description:
    "Apex Life AI replaces inside-sales teams with autonomous AI agents that handle lead generation, qualification, voice negotiation, and closing — 24/7.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-16.png", type: "image/png", sizes: "16x16" },
      { url: "/favicon-48.png", type: "image/png", sizes: "48x48" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
