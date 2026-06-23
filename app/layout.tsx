import type { Metadata } from "next";
import { Suspense } from "react";
import Script from "next/script";
import { Inter } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import StickyMobileBar from "@/components/StickyMobileBar";
import ExitIntent from "@/components/ExitIntent";
import Analytics from "@/components/Analytics";
import CookieNotice from "@/components/CookieNotice";
import ChatWidget from "@/components/ChatWidget";
import JsonLd from "@/components/JsonLd";
import { site } from "@/lib/site-config";
import { organizationSchema } from "@/lib/seo";
import { GA_ID } from "@/lib/analytics";

// Self-hosted via next/font. Inter is the whole site's typeface — logos included.
const sans = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://driveoffer.ca"),
  title: {
    default: `${site.name} — ${site.tagline}`,
    template: `%s | ${site.name}`,
  },
  description: site.description,
  openGraph: {
    title: `${site.name} — ${site.tagline}`,
    description: site.description,
    type: "website",
    locale: "en_CA",
    url: "https://driveoffer.ca",
    siteName: site.name,
    // Explicit /public static image (reliably served on Amplify), NOT the
    // app/opengraph-image.png metadata route which 404s there.
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 800,
        alt: `${site.name} — ${site.tagline}`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${site.name} — ${site.tagline}`,
    description: site.description,
    images: ["/og-image.jpg"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={sans.variable}>
      <body className="flex min-h-screen flex-col pb-20 lg:pb-0">
        {GA_ID && (
          <>
            {/* Define gtag + config BEFORE hydration so early user events aren't
                dropped. send_page_view:false — <Analytics/> owns page_view so
                client-side route changes are counted. Ad/remarketing signals
                off (first-party measurement only). */}
            <Script id="ga4-init" strategy="beforeInteractive">
              {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}',{send_page_view:false,allow_google_signals:false,allow_ad_personalization_signals:false});`}
            </Script>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
              strategy="afterInteractive"
            />
            <Suspense fallback={null}>
              <Analytics />
            </Suspense>
          </>
        )}
        <JsonLd data={organizationSchema()} />
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        <StickyMobileBar />
        <ExitIntent />
        <CookieNotice />
        <ChatWidget />
      </body>
    </html>
  );
}
