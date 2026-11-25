import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import ErrorReporter from "@/components/ErrorReporter";
import { SITE_NAME, SITE_URL, TARGET } from "@/lib/season";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_NAME,
  description: `Next season's fantasy football board today: ${TARGET} projections tuned to your league, mock drafts against bots that draft like your leaguemates, and trade, waiver and luck tools for this season.`,
  applicationName: SITE_NAME,
};

export const viewport: Viewport = {
  themeColor: "#020617",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <ErrorReporter />
        {children}
        {/* Page-view analytics; collects nothing until Web Analytics is enabled in the Vercel dashboard */}
        <Analytics />
      </body>
    </html>
  );
}
