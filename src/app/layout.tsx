import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ReactQueryProvider } from "@/components/providers/ReactQueryProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LoanMate — UCLM CCS Student Financial Services",
  description:
    "LoanMate is the savings and cooperative loan management platform for College of Computer Studies students at UCLM. Apply for loans, track savings, and manage your e-wallet.",
  keywords: ["LoanMate", "UCLM", "CCS", "student loan", "cooperative", "savings"],
};

/**
 * Root layout — Server Component.
 *
 * Wraps all pages with:
 * - Geist font variables
 * - Global CSS (Tailwind + shadcn tokens + LoanMate brand tokens)
 * - ReactQueryProvider (TanStack Query)
 *
 * Toast notifications are handled per-layout (dashboard / auth) using Sonner.
 */
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
      <body className="min-h-full flex flex-col bg-[var(--brand-cream)]">
        <ReactQueryProvider>{children}</ReactQueryProvider>
      </body>
    </html>
  );
}
