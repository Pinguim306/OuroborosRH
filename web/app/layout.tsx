import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { AppShell } from "@/components/AppShell";
import { SearchProvider } from "@/components/SearchProvider";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  title: "Coil — Robinhood Chain Launchpad",
  description:
    "Launch tokens on Robinhood Chain. Every trade winds the coil: fees become permanent liquidity and holders earn a share just by holding.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-display antialiased">
        <Providers>
          <SearchProvider>
            <AppShell>{children}</AppShell>
          </SearchProvider>
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
