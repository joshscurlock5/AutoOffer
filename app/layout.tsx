import type { Metadata } from "next";
import { Suspense } from "react";
import Script from "next/script";
import { Inter } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import StickyMobileBar from "@/components/StickyMobileBar";
import StickyCTA from "@/components/StickyCTA";
import ExitIntent from "@/components/ExitIntent";
import ResumeBanner from "@/components/ResumeBanner";
import Analytics from "@/components/Analytics";
import ChatWidget from "@/components/ChatWidget";
import ConsentBanner from "@/components/ConsentBanner";
import ClarityScript from "@/components/ClarityScript";
import JsonLd from "@/components/JsonLd";
import { site } from "@/lib/site-config";
import { organizationSchema } from "@/lib/seo";
import { GA_ID } from "@/lib/analytics";
import { META_PIXEL_ID } from "@/lib/metaPixel";

// Self-hosted via next/font. Inter is the whole site's typeface — logos included.
const sans = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.driveoffer.ca"),
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
    url: "https://www.driveoffer.ca",
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
  // Meta (Facebook) Business — domain verification. Rendered server-side into
  // <head> (NOT JS-injected), which is what Meta's crawler requires.
  verification: {
    other: {
      "facebook-domain-verification": "p7987a4h02blae0wxyq1jw6lt5b6g5",
    },
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
                off (first-party measurement only). The leading guard honours
                the consent banner's opt-out (lib/consent.ts): a stored denial
                disables GA before it can init. */}
            <Script id="ga4-init" strategy="beforeInteractive">
              {`var aoDeny=true;try{aoDeny=localStorage.getItem('ao_consent')==='denied';}catch(e){}if(aoDeny){window['ga-disable-${GA_ID}']=true;window.__aoNoTrack=true;}window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}',{send_page_view:false,allow_google_signals:false,allow_ad_personalization_signals:false});`}
            </Script>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
              strategy="afterInteractive"
            />
          </>
        )}
        {META_PIXEL_ID && (
          <>
            {/* Meta Pixel base — init only. PageView (first render + every route
                change) is fired by <Analytics/>, mirroring the GA setup, so it's
                counted exactly once. Skipped entirely when the consent banner's
                opt-out is stored (trackMeta no-ops when fbq never loads). */}
            <Script id="meta-pixel" strategy="afterInteractive">
              {`var aoDenyPx=true;try{aoDenyPx=localStorage.getItem('ao_consent')==='denied';}catch(e){}if(aoDenyPx){window.__aoNoTrack=true;}if(!window.__aoNoTrack){!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${META_PIXEL_ID}');}`}
            </Script>
          </>
        )}
        {(GA_ID || META_PIXEL_ID) && (
          <Suspense fallback={null}>
            <Analytics />
          </Suspense>
        )}
        <JsonLd data={organizationSchema()} />
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        <StickyMobileBar />
        <StickyCTA />
        <ExitIntent />
        <ResumeBanner />
        <ChatWidget />
        <ClarityScript />
        <ConsentBanner />
      </body>
    </html>
  );
}
