import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { site, mailHref, amvicLicence } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: `The terms that apply when you use ${site.name} and request an offer on your vehicle.`,
};

type Block = string | { ul: string[] } | { node: ReactNode };

export default function TermsPage() {
  const sections: { h: string; body: Block[] }[] = [
    {
      h: "About DriveOffer",
      body: [
        "DriveOffer helps people across Canada sell their vehicles. You enter details about your car — such as the year, make, model, trim, kilometres, condition and your contact information, and optionally photos or your VIN — and we may show you an estimated offer range to give you a sense of what your vehicle could be worth.",
        "From there, a licensed buyer reviews your information, may contact you, and can arrange an inspection and purchase. These Terms apply to your use of the Site whether or not you go on to sell your vehicle.",
      ],
    },
    {
      h: "Vehicle Estimates Are Not Final Offers",
      body: [
        "Any price, estimate or offer range shown on the Site is a preliminary estimate only. It is not a guaranteed or final offer to buy your vehicle.",
        "A final offer depends on a number of things, including:",
        {
          ul: [
            "a physical inspection of the vehicle;",
            "its actual condition;",
            "accident and history reports;",
            "title and lien status;",
            "current market demand;",
            "the accuracy and completeness of the information you provide; and",
            "final approval by the buyer.",
          ],
        },
        "Because of this, your final offer may be higher or lower than any estimate shown online, or the buyer may decide not to make an offer at all.",
      ],
    },
    {
      h: "Licensed Buyer / Partner Relationship",
      body: [
        "DriveOffer connects vehicle sellers with a licensed vehicle buyer/wholesaler. The actual purchase of your vehicle may be completed by a licensed buyer or partner rather than by the Site operator directly.",
        amvicLicence
          ? `Our affiliated buyer operates as ${amvicLicence}.`
          : "Our affiliated buyer operates as a licensed wholesaler.",
        "Any purchase is a separate transaction between you and the buyer/partner, on the terms you agree to with them at the time of sale. We are not responsible for the independent acts or decisions of a buyer/partner, although we expect them to deal with you fairly and lawfully.",
      ],
    },
    {
      h: "No Obligation",
      body: [
        "Requesting an estimate or submitting a form does not create any obligation. You are never required to sell your vehicle, and DriveOffer and its buyer/partner are never required to buy it.",
        "You are free to walk away at any point before a sale is finalized, and so are we.",
      ],
    },
    {
      h: "What We Don't Guarantee",
      body: [
        "We work hard to give you a fair, convenient way to sell your car, but we cannot promise specific outcomes. In particular, DriveOffer does not guarantee:",
        {
          ul: [
            "that you will receive the highest possible offer for your vehicle;",
            "that we or our buyer/partner will purchase every vehicle submitted;",
            "same-day payment in every case; or",
            "any specific sale price, offer amount or timeline.",
          ],
        },
      ],
    },
    {
      h: "Vehicle Information and Seller Responsibilities",
      body: [
        "You are responsible for giving us accurate, complete and honest information about your vehicle. This includes details about:",
        {
          ul: [
            "ownership, and your legal right or authority to sell the vehicle;",
            "title status and any liens, loans or money still owing;",
            "accident history and prior damage;",
            "mechanical condition and any known issues;",
            "mileage / kilometres; and",
            "any photos or documents you submit.",
          ],
        },
        "Providing inaccurate or incomplete information may change or cancel an estimate or offer. By submitting a vehicle, you confirm that you own it or have the authority to sell it and that the information you provide is true to the best of your knowledge.",
      ],
    },
    {
      h: "Consent to Be Contacted",
      body: [
        "When you submit your details, you agree that DriveOffer and its buyer/partner may contact you about your vehicle and a possible purchase by phone, SMS/text, email or other reasonable methods, using the contact information you provide.",
        "Standard message and data rates may apply to calls and texts. You can ask us to stop contacting you at any time — for example, by replying STOP to a text or by emailing us.",
        {
          node: (
            <>
              How we handle your personal information is explained in our{" "}
              <Link href="/privacy" className="font-semibold text-brand hover:underline">
                Privacy Policy
              </Link>
              .
            </>
          ),
        },
      ],
    },
    {
      h: "Referral Program Terms",
      body: [
        "From time to time we may run a referral program — for example, “Refer a friend, earn $100.” When we do, the following applies.",
        "A referral reward (currently $100) is only paid when all of these are true:",
        {
          ul: [
            "the person you refer submits a valid lead;",
            "they are not already in our system;",
            "they complete a vehicle sale to DriveOffer or our buyer/partner; and",
            "that transaction is fully finalized.",
          ],
        },
        "No self-referrals, duplicate referrals, fake or fraudulent leads, or other abuse. Referred customers must be genuine and submitted with their knowledge.",
        "DriveOffer may withhold or deny a referral reward for any referral that is suspicious, invalid, incomplete or appears to involve fraud or abuse. We may change, pause or end the referral program at any time, and our decision on referral rewards is final.",
      ],
    },
    {
      h: "Acceptable Use",
      body: [
        "When using the Site, you agree not to:",
        {
          ul: [
            "submit fake, false or misleading vehicle or contact information;",
            "use the Site for any unlawful purpose or in violation of any applicable law;",
            "impersonate any person or misrepresent your identity;",
            "submit a vehicle you do not own or do not have authority to sell; or",
            "interfere with, disrupt or attempt to gain unauthorized access to the Site or its systems.",
          ],
        },
      ],
    },
    {
      h: "Your Privacy",
      body: [
        {
          node: (
            <>
              Your use of the Site is also covered by our{" "}
              <Link href="/privacy" className="font-semibold text-brand hover:underline">
                Privacy Policy
              </Link>
              , which explains what personal information we collect and how we use it. Please review
              it to understand our privacy practices.
            </>
          ),
        },
      ],
    },
    {
      h: "Third-Party Links and Services",
      body: [
        "The Site may link to or rely on third-party websites, tools or services (for example mapping, analytics, vehicle-history or payment providers). We don't control those third parties and aren't responsible for their content, products or practices. Using them is at your own risk and may be subject to their own terms.",
      ],
    },
    {
      h: "No Warranties",
      body: [
        "The Site and its content are provided “as is” and “as available,” without warranties of any kind, whether express or implied, to the fullest extent permitted by law. We don't warrant that the Site will always be available, error-free or secure, or that any estimate or information on it is accurate or complete.",
      ],
    },
    {
      h: "Limitation of Liability",
      body: [
        "To the fullest extent permitted by law, DriveOffer, [Legal Entity Name] and our affiliates, partners and their respective owners and staff will not be liable for any indirect, incidental, special or consequential damages, or for any lost profits, lost data or lost opportunity, arising out of or related to your use of the Site, any estimate, or any dealings with a buyer/partner.",
        "Nothing in these Terms limits any rights you have under applicable Canadian consumer-protection law that cannot legally be limited.",
      ],
    },
    {
      h: "Changes to These Terms",
      body: [
        "We may update these Terms from time to time. When we do, we'll change the “Last updated” date at the top of this page. Changes take effect when posted, and your continued use of the Site means you accept the updated Terms.",
      ],
    },
    {
      h: "Termination and Suspension",
      body: [
        "We may suspend or end your access to the Site, or decline to provide an estimate or service, at any time and for any reason — including if we believe you have violated these Terms or misused the Site.",
      ],
    },
    {
      h: "Governing Law",
      body: [
        "These Terms are governed by the laws of [Province/Territory], Canada, together with the applicable federal laws of Canada, without regard to conflict-of-law rules. You agree that the courts located in [Province/Territory] will handle any disputes, except where applicable law requires otherwise.",
      ],
    },
    {
      h: "Contact Us",
      body: [
        "Questions about these Terms? We're happy to help. You can reach us using the details below.",
      ],
    },
  ];

  return (
    <>
      <section className="bg-gradient-to-b from-brand-50 to-white">
        <div className="container-x py-14 sm:py-16">
          <h1 className="font-display text-4xl font-extrabold text-navy sm:text-5xl">Terms of Use</h1>
          <p className="mt-3 text-muted">Last updated: [Month DD, YYYY]</p>
        </div>
      </section>

      <section className="py-14 sm:py-16">
        <div className="container-x max-w-3xl">
          <p className="text-lg text-muted">
            {`These Terms of Use (“Terms”) govern your use of DriveOffer.ca and the services we provide through it (the “Site”). The Site is operated by [Legal Entity Name] (“${site.name}”, “we”, “us”). By using the Site, requesting an estimate, or submitting your vehicle or contact details, you agree to these Terms. If you do not agree, please do not use the Site.`}
          </p>

          <div className="mt-10 space-y-10">
            {sections.map((s) => (
              <div key={s.h}>
                <h2 className="font-display text-xl font-bold text-navy">{s.h}</h2>
                {s.body.map((block, i) =>
                  typeof block === "string" ? (
                    <p key={i} className="mt-3 leading-relaxed text-muted">{block}</p>
                  ) : "ul" in block ? (
                    <ul key={i} className="mt-3 list-disc space-y-2 pl-5 leading-relaxed text-muted">
                      {block.ul.map((item, j) => (
                        <li key={j}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p key={i} className="mt-3 leading-relaxed text-muted">{block.node}</p>
                  )
                )}
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-2xl bg-slate-50 p-6">
            <p className="font-semibold text-navy">Contact details</p>
            <ul className="mt-3 space-y-1.5 text-muted">
              <li>[Legal Entity Name] (operating as {site.name})</li>
              <li>
                Email:{" "}
                <a href={mailHref} className="font-semibold text-brand hover:underline">
                  {site.email}
                </a>
              </li>
              <li>Phone: {site.phoneDisplay}</li>
              <li>Mailing address: [Business Address]</li>
              {amvicLicence ? <li>{amvicLicence}</li> : null}
            </ul>
          </div>

          <p className="mt-8 text-sm text-muted">
            These Terms are provided in plain language for your convenience and are not legal advice.
          </p>
        </div>
      </section>
    </>
  );
}
