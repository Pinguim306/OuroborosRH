import type { Metadata } from "next";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { AppShell } from "@/components/AppShell";
import { SearchProvider } from "@/components/SearchProvider";
import { AuthProvider } from "@/components/AuthProvider";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  metadataBase: new URL("https://coil.trading"),
  title: "Coil — Multi-chain Token Launchpad",
  description:
    "Launch tokens on Robinhood Chain and Arc. Every trade winds the coil: fees become permanent liquidity and holders earn a share just by holding.",
  openGraph: {
    title: "Coil — Multi-chain Token Launchpad",
    description:
      "Launch tokens on Robinhood Chain and Arc. Every trade winds the coil: fees become permanent liquidity and holders earn a share just by holding.",
    url: "https://coil.trading",
    siteName: "Coil",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Coil — every trade winds the coil" }],
  },
  twitter: {
    // Was `summary`, with no image at all: every Coil link posted anywhere unfurled as a bare line
    // of text. The large card is the whole point of having artwork.
    card: "summary_large_image",
    site: "@coiltrading",
    title: "Coil — Multi-chain Token Launchpad",
    description:
      "Launch tokens on Robinhood Chain and Arc. Every trade winds the coil: fees become permanent liquidity and holders earn a share just by holding.",
    images: ["/og.png"],
  },
};

/**
 * Type system. Display carries the brand voice (geometric, slightly quirky — it reads as
 * "engineered", which is the point of the coil); Inter does the reading work at small sizes; the
 * mono is picked for hex: JetBrains Mono disambiguates 0/O and 1/l/I, which matters when a wrong
 * character in a contract address costs money.
 */
const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const body = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="font-body antialiased">
        <Providers>
          <AuthProvider>
            <SearchProvider>
              <AppShell>{children}</AppShell>
            </SearchProvider>
          </AuthProvider>
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
