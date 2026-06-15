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
      h: "How we share your information",
      p: [
        "We do not sell your personal information. We share it only with service providers who help us operate (for example, payment processing) and only as needed to deliver our service, or where required by law.",
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
          <p className="mt-3 text-muted">Last updated: June 2026</p>
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
