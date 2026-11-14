import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { PRODUCT } from "@/config";
import "./globals.css";

// Open-licence fonts, self-hosted (no CDN requests), licences in src/fonts/.
// Bricolage Grotesque carries the site's identity; JetBrains Mono is the
// body face of the Ink look the site wears.
const bricolage = localFont({
  src: "../fonts/bricolage-grotesque-latin-wght.woff2",
  variable: "--font-bricolage",
  weight: "200 800",
  display: "swap",
});
const jetbrains = localFont({
  src: "../fonts/jetbrains-mono-latin-400.woff2",
  variable: "--font-jbmono",
  weight: "400",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Posthaste — a thought goes down in two seconds",
  description:
    "Press a shortcut anywhere, type, press Enter. The window is gone, focus is back, and the note waits in your inbox. Local-first, no account, no network requests.",
  openGraph: {
    title: "Posthaste — a thought goes down in two seconds",
    description:
      "Press a shortcut anywhere, type, press Enter. The window is gone, focus is back, and the note waits in your inbox. Local-first, no account, no network requests.",
    type: "website",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Posthaste — a thought goes down in two seconds",
    description:
      "Press a shortcut anywhere, type, press Enter. Local-first, no account, no network requests.",
    images: ["/og.png"],
  },
  icons: { icon: "/logo-256.png?v=2" },
  ...(PRODUCT.siteUrl
    ? { metadataBase: new URL(PRODUCT.siteUrl), alternates: { canonical: "/" } }
    : {}),
};

export const viewport: Viewport = {
  themeColor: "#0f0f0f",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bricolage.variable} ${jetbrains.variable}`}>
      <body>{children}</body>
    </html>
  );
}
