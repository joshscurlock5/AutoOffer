import type { Metadata } from "next";
import { site, mailHref, fullAddress } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${site.name} collects, uses and protects your personal information.`,
};

export default function PrivacyPage() {
  const sections = [
    {
      h: "Information we collect",
      p: [
        "When you request an offer or contact us, we collect the details you provide: your name, email address, phone number, vehicle information (year, make, model, trim, mileage, condition) and any photos you choose to upload.",
        "We may also collect basic technical information such as your browser type and pages visited to help us improve the site.",
      ],
    },
    {
      h: "How we use your information",
      p: [
        "We use your information solely to provide our service: to prepare and deliver your offer, to contact you about selling your vehicle, to schedule an inspection, and to complete a purchase.",
        "If you take part in our referral program, we use the contact details provided to administer referral rewards.",
      ],
    },
    {
      h: "Analytics & cookies",
      p: [
        "We use Google Analytics 4, a service provided by Google LLC, to understand how visitors use our site. Google Analytics sets cookies (such as _ga) in your browser and collects technical and usage information including your IP address, device and browser type, the pages you visit, and how you move through our offer process. We use this only in aggregate to measure and improve the site and the offer flow.",
        "We do not send your name, email address, or phone number to Google Analytics — that information is used only to prepare and deliver your offer, as described above.",
        "Google processes this analytics information on servers in the United States, which means it may be stored or accessed outside Canada and is subject to U.S. law.",
        "You can opt out by blocking or clearing cookies in your browser settings, by installing Google's Analytics Opt-out Browser Add-on at https://tools.google.com/dlpage/gaoptout, or by choosing “Turn off analytics” on the notice shown when you first visit our site (your choice is remembered in your browser's local storage, alongside preferences like your form progress and a random session identifier).",
      ],
    },
    {
      h: "Session recordings & heatmaps (Microsoft Clarity)",
      p: [
        "We use Microsoft Clarity, a service provided by Microsoft Corporation, to understand how visitors interact with our pages — where people click, how far they scroll, and where they get stuck — so we can improve the site. Clarity records page interactions (clicks, scrolling, mouse movement) and produces anonymized session replays and heatmaps. Text you type into forms is masked by default and is not recorded.",
        "Clarity sets cookies in your browser and processes this information on Microsoft servers in the United States. Recordings are retained by Microsoft for approximately 30 days. Learn more at https://privacy.microsoft.com/privacystatement.",
        "You can opt out by choosing “Turn off analytics” on the notice shown when you first visit our site, or by blocking cookies in your browser.",
      ],
    },
    {
      h: "Advertising (Meta Pixel & Conversions API)",
      p: [
        "We advertise on Facebook and Instagram, and we use the Meta Pixel and Meta Conversions API (services provided by Meta Platforms, Inc.) to measure how those ads perform and to show relevant ads to people like you. The Pixel sets cookies in your browser (such as _fbp and _fbc).",
        "To match a conversion to an ad interaction, we share limited information with Meta: a securely hashed (irreversibly scrambled) version of your email address, phone number and name, together with your IP address, browser and device information, and the Meta cookie identifiers above. We do not send Meta your name, email address or phone number in readable form — those identifiers are hashed before they ever leave our systems, and Meta uses them only for matching.",
        "If you ask us to sell your car and we complete a purchase, we may also send Meta a hashed record of that conversion (and its value) so we can measure which ads lead to real sales. This contains the same hashed identifiers — never your readable contact details.",
        "Meta processes this information on servers that may be located outside Canada, including in the United States. You can manage ad personalization in your Facebook and Instagram settings, and limit or clear cookies in your browser. Learn more in Meta's Privacy Policy at https://www.facebook.com/privacy/policy.",
      ],
    },
    {
      h: "Email & text message receipts",
      p: [
        "When we email or text you — for example your offer or a booking confirmation — our email provider (Resend) and text-message provider (Twilio) send us delivery receipts: whether the message arrived or bounced, and whether a link in an email was clicked (and, where enabled, whether the email was opened). We use this only to make sure offers actually reach you and to stop contacting addresses that no longer work.",
        "If you mark one of our emails as spam, we automatically stop sending you follow-up emails. You can also opt out at any time by replying STOP to a text or emailing us.",
      ],
    },
    {
      h: "How we share your information",
      p: [
        "We do not sell your personal information. We share it only with service providers who help us operate (for example, payment processing, the analytics and session-recording providers described in “Analytics & cookies” and “Session recordings & heatmaps”, the advertising provider described in “Advertising”, and the email and text-message providers described in “Email & text message receipts” above) and only as needed to deliver our service or measure our advertising, or where required by law.",
      ],
    },
    {
      h: "Data retention & security",
      p: [
        "We keep your information only as long as necessary to provide our service and meet legal obligations, and we take reasonable measures to protect it from unauthorized access.",
      ],
    },
    {
      h: "Your rights",
      p: [
        "Consistent with Canadian privacy law (PIPEDA) and applicable provincial legislation, you may request access to, correction of, or deletion of your personal information at any time.",
        `To make a request, email us at ${site.email}.`,
      ],
    },
    {
      h: "Contact us",
      p: [
        `If you have questions about this policy or your information, contact ${site.legalName} at ${site.email} or ${site.phoneDisplay}. Our office is located at ${fullAddress}.`,
      ],
    },
  ];

  return (
    <>
      <section className="bg-gradient-to-b from-brand-50 to-white">
        <div className="container-x py-14 sm:py-16">
          <h1 className="font-display text-4xl font-extrabold text-navy sm:text-5xl">Privacy Policy</h1>
          <p className="mt-3 text-muted">Last updated: July 5, 2026</p>
        </div>
      </section>

      <section className="py-14 sm:py-16">
        <div className="container-x max-w-3xl">
          <p className="text-lg text-muted">
            {site.legalName} (&ldquo;{site.name}&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) respects your
            privacy. This policy explains what we collect, how we use it, and the
            choices you have.
          </p>

          <div className="mt-10 space-y-10">
            {sections.map((s) => (
              <div key={s.h}>
                <h2 className="font-display text-xl font-bold text-navy">{s.h}</h2>
                {s.p.map((para, i) => (
                  <p key={i} className="mt-3 leading-relaxed text-muted">{para}</p>
                ))}
              </div>
            ))}
          </div>

          <div className="mt-12 rounded-2xl bg-slate-50 p-6">
            <p className="text-muted">
              Questions about your privacy? Email{" "}
              <a href={mailHref} className="font-semibold text-brand hover:underline">{site.email}</a>.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
