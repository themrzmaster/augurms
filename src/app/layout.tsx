import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AugurMS - MapleStory v83 Guided by AI",
  description: "A classic MapleStory v83 private server with an omniscient AI Game Master. The Augur watches, adapts, and reshapes the world in real time.",
  icons: { icon: "/logo.png", apple: "/logo.png" },
  openGraph: {
    title: "AugurMS - MapleStory v83 Guided by AI",
    description: "Something ancient watches over this world. A MapleStory v83 private server with an AI oracle that dynamically tunes rates, drops, and events.",
    images: [{ url: "/logo.png", width: 1024, height: 1024 }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.className} dark`}>
      <body className="min-h-screen bg-bg-primary text-text-primary antialiased">
        {children}
      </body>
    </html>
  );
}
