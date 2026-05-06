import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "Tennis Academy Limassol Tournaments",
  description: "Live tennis tournament schedules, standings, and results.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/logo.png", type: "image/png" }],
    apple: [{ url: "/logo.png", type: "image/png" }],
  },
  openGraph: {
    title: "Tennis Academy Limassol Tournaments",
    description: "Live tennis tournament schedules, standings, and results.",
    images: [{ url: "/logo.png", alt: "Tournament logo" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Tennis Academy Limassol Tournaments",
    description: "Live tennis tournament schedules, standings, and results.",
    images: ["/logo.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
