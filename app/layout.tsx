import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RankCraft Audit — Free Website Audit",
  description: "Get a free performance, SEO, and accessibility audit for your website.",
  icons: {
    icon: "/favicon-32.png",
    apple: "/apple-touch-icon.png",
  },
};

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
      </head>
      <body className="min-h-full font-[Poppins,sans-serif]">{children}</body>
    </html>
  );
}
