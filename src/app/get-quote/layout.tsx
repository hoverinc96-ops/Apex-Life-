import type { Metadata } from "next";

// OG/Twitter metadata for /get-quote. Strings reused verbatim from approved
// on-page copy: H1 "Life insurance, without the runaround." and the footer
// trust strip. og:image alt per owner-approved share-card spec.
export const metadata: Metadata = {
  title: "Apex Life — Life insurance, without the runaround.",
  description:
    "No obligation · No spam · Opt out anytime · Your details are never sold",
  openGraph: {
    title: "Apex Life — Life insurance, without the runaround.",
    description:
      "No obligation · No spam · Opt out anytime · Your details are never sold",
    images: [
      {
        url: "/og-quote.png",
        width: 1200,
        height: 630,
        alt: "Apex Life — No obligation · No spam · Opt out anytime. Send me my options.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Apex Life — Life insurance, without the runaround.",
    description:
      "No obligation · No spam · Opt out anytime · Your details are never sold",
    images: ["/og-quote.png"],
  },
};

export default function GetQuoteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
