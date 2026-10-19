import type { Metadata } from "next";

// OG/Twitter metadata for /book. Strings reused verbatim from approved on-page
// copy: H1 "Request a call" and the intro paragraph's first sentence.
export const metadata: Metadata = {
  title: "Apex Life — Request a call",
  description:
    "Tell us what you'd like to talk about and a time that works for you.",
  openGraph: {
    title: "Apex Life — Request a call",
    description:
      "Tell us what you'd like to talk about and a time that works for you.",
    images: [
      {
        url: "/og-book.png",
        width: 1200,
        height: 630,
        alt: "Apex Life — Request a call.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Apex Life — Request a call",
    description:
      "Tell us what you'd like to talk about and a time that works for you.",
    images: ["/og-book.png"],
  },
};

export default function BookLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
