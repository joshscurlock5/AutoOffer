const steps = [
  {
    icon: "/icons/step-tell-us.png",
    title: "Tell us about your car",
    body: "Send your details and a few photos.",
  },
  {
    icon: "/icons/step-come-to-you.png",
    title: "We come to you",
    body: "A quick inspection, wherever you are.",
  },
  {
    icon: "/icons/step-get-paid.png",
    title: "Get paid",
    body: "Paid on the spot — we handle the paperwork.",
  },
];

export default function HowItWorks() {
  return (
    <section id="how" className="bg-cream py-8 sm:py-12">
      <div className="container-x">
        <div className="mx-auto max-w-col wide:max-w-none">
          <h2 className="h-section">How it works</h2>

          <div className="mt-6 grid gap-6 wide:grid-cols-3">
            {steps.map((s) => (
              <div key={s.title} className="card h-full px-7 pb-9 pt-6 sm:px-8 sm:pb-11 sm:pt-7">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`${s.icon}?v=2`} alt="" aria-hidden="true" className="h-16 w-16" />
                <h3 className="mt-7 text-xl font-bold text-navy">{s.title}</h3>
                <p className="mt-4 text-muted">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
