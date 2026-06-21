import Link from "next/link";
import { Section } from "./Section";
import { ArrowRight } from "./icons";

export default function SecurePayment() {
  return (
    <Section className="bg-cream">
      <div className="mx-auto max-w-col wide:max-w-none">
        <div className="rounded-3xl bg-slate-50 p-6 sm:p-10 wide:p-14">
          <div className="grid items-center gap-8 wide:grid-cols-2 wide:gap-12">
            <div className="aspect-[4/3] w-full overflow-hidden rounded-2xl bg-slate-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/secure-payment.jpg"
                alt="A DriveOffer seller holding their payment"
                className="h-full w-full object-cover object-center"
              />
            </div>

            <div>
              <h2 className="h-section">Fast, Secure Payment</h2>
              <p className="mt-4 text-lg leading-relaxed text-muted">
                Get paid at your appointment — quickly and securely. We&apos;ll confirm
                your offer, inspect the vehicle, and pay you on the spot.
              </p>
              <Link href="/get-offer" className="btn-primary mt-7 px-8 py-4 text-lg">
                Get Your Instant Offer <ArrowRight className="h-5 w-5" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}
