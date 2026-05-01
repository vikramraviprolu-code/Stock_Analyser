import type { Metadata } from "next";
import { AppErrorBoundary } from "@/src/components/AppErrorBoundary";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stock Analyser",
  description: "Public-source stock screening and momentum analysis."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <AppErrorBoundary>{children}</AppErrorBoundary>
      </body>
    </html>
  );
}
