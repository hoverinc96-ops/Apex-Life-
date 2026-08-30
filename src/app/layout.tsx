import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Apex Life AI — Your AI-Powered Life Insurance Sales Team",
  description:
    "Apex Life AI replaces inside-sales teams with autonomous AI agents that handle lead generation, qualification, voice negotiation, and closing — 24/7.",
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
