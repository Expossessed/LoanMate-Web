import type { Metadata } from "next";
import "./globals.css";
import { ReactQueryProvider } from "@/components/providers/ReactQueryProvider";

export const metadata: Metadata = {
  title: "LoanMate — UCLM CCS Student Financial Services",
  description:
    "LoanMate is the savings and cooperative loan management platform for College of Computer Studies students at UCLM. Apply for loans, track savings, and manage your e-wallet.",
  keywords: ["LoanMate", "UCLM", "CCS", "student loan", "cooperative", "savings"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col bg-[var(--brand-cream)] font-sans">
        <ReactQueryProvider>{children}</ReactQueryProvider>
      </body>
    </html>
  );
}
