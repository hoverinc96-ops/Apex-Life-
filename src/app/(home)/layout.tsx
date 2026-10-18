import type { Metadata } from "next";

// OG/Twitter metadata for /. All strings reused verbatim from on-page approved
// copy (H1 "Your AI-Powered Life Insurance Sales Team"; existing site
// description). og:image alt per owner-approved share-card spec.
export const metadata: Metadata = {
  openGraph: {
    title: "Your AI-Powered Life Insurance Sales Team",
    description:
      "Apex Life AI replaces inside-sales teams with autonomous AI agents that handle lead generation, qualification, voice negotiation, and closing — 24/7.",
    images: [
      {
        url: "/og-home.png",
        width: 1200,
        height: 630,
        alt: "Apex Life — Life insurance, without the runaround.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Your AI-Powered Life Insurance Sales Team",
    description:
      "Apex Life AI replaces inside-sales teams with autonomous AI agents that handle lead generation, qualification, voice negotiation, and closing — 24/7.",
    images: ["/og-home.png"],
  },
};

export default function HomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
