import type { Metadata } from "next";
import Link from "next/link";
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
  title: "Website UX Reviewer",
  description: "Analyze website UX issues with evidence and scoring.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div className="mx-auto min-h-screen max-w-6xl px-4 py-6 md:px-8">
          <header className="mb-8 flex items-center justify-between border-b border-black/10 pb-4 dark:border-white/15">
            <h1 className="text-xl font-semibold">Website UX Reviewer</h1>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/" className="hover:underline">
                Home
              </Link>
              <Link href="/history" className="hover:underline">
                History
              </Link>
              <Link href="/status" className="hover:underline">
                Status
              </Link>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
