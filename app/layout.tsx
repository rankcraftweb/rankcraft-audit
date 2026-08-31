import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

const TITLE = "RankCraft Audit — Free Website Audit";
// Names all four scores AuditResults renders, in the order they appear
// on screen. It read "performance, SEO, and accessibility" and left out
// Best Practices, so the page was promising three of the four it gives.
const DESCRIPTION =
  "Get a free audit of your site's performance, accessibility, best practices, and SEO.";

export const metadata: Metadata = {
  // Lets the relative /og-image.png below resolve to an absolute URL,
  // which Open Graph requires - a relative one is silently ignored by
  // every scraper.
  metadataBase: new URL("https://audit.rankcraftweb.com"),
  title: TITLE,
  description: DESCRIPTION,
  // No `alternates.canonical` here. Metadata set on the root layout
  // applies to every route below it, so a canonical of "/" would make
  // each /report/[token] page claim the home page as its canonical,
  // which is simply untrue. og:url already states the real address of
  // the page people share.
  icons: {
    icon: "/favicon-32.png",
    apple: "/apple-touch-icon.png",
  },
  // Without these the link renders as a bare text card wherever it is
  // shared - Facebook, LinkedIn, Messenger, Slack - and a share by
  // someone else is the only free distribution this tool gets.
  openGraph: {
    type: "website",
    url: "/",
    siteName: "RankCraft Web",
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_PH",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "RankCraft Audit: free website audit covering performance, accessibility, best practices and SEO",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og-image.png"],
  },
};

// Same GA4 property as rankcraftweb.com, so audit-tool and main-site
// sessions stitch together into one funnel instead of two disconnected
// properties.
const GA_MEASUREMENT_ID = "G-S1816MHVM3";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
          strategy="afterInteractive"
        />
        <Script id="ga4-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_MEASUREMENT_ID}');
          `}
        </Script>
      </head>
      <body className="min-h-full font-[Poppins,sans-serif]">{children}</body>
    </html>
  );
}
