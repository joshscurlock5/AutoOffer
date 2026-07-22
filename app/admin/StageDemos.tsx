"use client";

import { type ReactNode } from "react";

// ---------------------------------------------------------------------------
//  StageDemo — a small, looping, pure-CSS animation of one funnel stage: the
//  actual form screen it maps to, with a moving cursor performing the tracked
//  action. A button is "clicked" (press + ripple) only when the button press is
//  part of what the stage records; field-entry stages just fill a field.
//
//  Self-contained: all keyframes live in DEMO_CSS (sd- prefixed so nothing
//  collides with app styles). Keyed by the stage's display LABEL (from
//  lib/eventAnalytics STAGES) via STAGE_INFO.
// ---------------------------------------------------------------------------

/** Plain-English title + one-line description per funnel-stage label. Also the
 * allow-list: a label with no entry here gets no ⓘ button. */
export const STAGE_INFO: Record<string, { title: string; blurb: string }> = {
  Visited: { title: "Visited", blurb: "Someone landed on the DriveOffer website." },
  "Touched form": {
    title: "Touched form",
    blurb: "Engaged the offer form — a field tap OR a “Get a Free Offer” button. Both count as one; the split below shows which came first.",
  },
  "Entered make": { title: "Entered make", blurb: "Picked their car’s make." },
  "Entered model": { title: "Entered model", blurb: "Picked their car’s model." },
  "Submitted vehicle": { title: "Submitted vehicle", blurb: "Pressed “Get a Free Offer” to continue past the vehicle step." },
  "Entered trim": { title: "Entered trim", blurb: "Picked a trim (optional — it’s on the details step)." },
  "Entered mileage": { title: "Entered mileage", blurb: "Entered mileage. Condition is pre-filled, so it can’t be tracked separately." },
  "Submitted details": { title: "Submitted details", blurb: "Pressed “Continue” past the details step." },
  "Entered phone": { title: "Entered phone", blurb: "Typed their phone number." },
  "Entered email": { title: "Entered email", blurb: "Typed their email address." },
  Submitted: { title: "Submitted", blurb: "Pressed “Get My Free Offer” — became a lead." },
};

export function hasStageDemo(label: string): boolean {
  return label in STAGE_INFO;
}

const CURSOR_SVG =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M4 2 L4 19 L8.5 14.5 L11.5 21.5 L14.5 20.2 L11.5 13.5 L18 13.5 Z' fill='%230e1c2b' stroke='white' stroke-width='1.3' stroke-linejoin='round'/%3E%3C/svg%3E\")";

function Cursor({ anim }: { anim: string }) {
  return <span className="sd-cursor" style={{ backgroundImage: CURSOR_SVG, animation: `${anim} both infinite` }} aria-hidden />;
}
function Ring({ anim, style }: { anim: string; style?: React.CSSProperties }) {
  return <span className="sd-ring" style={{ animation: `${anim} both infinite`, ...style }} aria-hidden />;
}
function Frame({ children, cursor }: { children: ReactNode; cursor: ReactNode }) {
  return (
    <div className="sd-frame">
      <div className="sd-hdr">Drive<b>Offer</b></div>
      {children}
      {cursor}
    </div>
  );
}

/** A form field with a placeholder and an optional value overlay (static or animated). */
function Field({ ph, value }: { ph: string; value?: ReactNode }) {
  return (
    <div className="sd-field">
      <span className="sd-ph">{ph}</span>
      {value}
    </div>
  );
}
const staticVal = (text: string) => <span className="sd-val" style={{ position: "absolute", left: 10 }}>{text}</span>;
const animVal = (text: string, cls: string) => <span className={`sd-val ${cls}`} style={{ position: "absolute", left: 10 }}>{text}</span>;

export default function StageDemo({ stage }: { stage: string }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: DEMO_CSS }} />
      {renderStage(stage)}
    </>
  );
}

/** The Year/Make/Model + "Get a Free Offer" vehicle step, shared by stages 2–5. */
function VehicleForm({ make, model, button }: { make?: ReactNode; model?: ReactNode; button: ReactNode }) {
  return (
    <div className="sd-screen">
      <div className="sd-lbl">Year</div><Field ph="Year" value={staticVal("2025")} />
      <div className="sd-lbl">Make</div><Field ph="Make" value={make} />
      <div className="sd-lbl">Model</div><Field ph="Model" value={model} />
      {button}
    </div>
  );
}

function renderStage(stage: string): ReactNode {
  switch (stage) {
    case "Visited":
      return (
        <Frame cursor={<Cursor anim="sd-cur-visited 5s ease-in-out" />}>
          <div className="sd-screen">
            <div className="sd-omni">🔒 <span className="sd-tw sd-caret sd-type-url" style={{ marginLeft: 6 }}>driveoffer.ca</span></div>
            <div className="sd-hero sd-hero-in">
              <div className="sd-logo">Drive<b>Offer</b></div>
              <div className="sd-tag">Sell your car the easy way.</div>
              <div className="sd-cta">Get a Free Offer</div>
            </div>
          </div>
        </Frame>
      );
    case "Touched form":
      return (
        <Frame cursor={<Cursor anim="sd-cur-touch 4.5s ease-in-out" />}>
          <VehicleForm
            make={<Ring anim="sd-ring-touch 4.5s ease-in-out" style={{ left: 100, top: 4 }} />}
            button={<div className="sd-btn sd-btn-idle" style={{ marginTop: 8 }}>Get a Free Offer →</div>}
          />
        </Frame>
      );
    case "Entered make":
      return (
        <Frame cursor={<Cursor anim="sd-cur-make 5s ease-in-out" />}>
          <VehicleForm
            make={animVal("BMW", "sd-val-make")}
            button={<div className="sd-btn sd-btn-idle" style={{ marginTop: 8 }}>Get a Free Offer →</div>}
          />
        </Frame>
      );
    case "Entered model":
      return (
        <Frame cursor={<Cursor anim="sd-cur-model 5s ease-in-out" />}>
          <VehicleForm
            make={staticVal("BMW")}
            model={animVal("i4", "sd-val-model")}
            button={<div className="sd-btn sd-btn-idle" style={{ marginTop: 8 }}>Get a Free Offer →</div>}
          />
        </Frame>
      );
    case "Submitted vehicle":
      return (
        <Frame cursor={<Cursor anim="sd-cur-subveh 5s ease-in-out" />}>
          <VehicleForm
            make={staticVal("BMW")}
            model={staticVal("i4")}
            button={
              <div className="sd-btn sd-press-subveh" style={{ marginTop: 8, position: "relative" }}>
                Get a Free Offer →<Ring anim="sd-ring-subveh 5s ease-in-out" style={{ left: "50%", marginLeft: -13, top: 5 }} />
              </div>
            }
          />
        </Frame>
      );
    case "Entered trim":
      return (
        <Frame cursor={<Cursor anim="sd-cur-trim 5s ease-in-out" />}>
          <DetailsForm trim={animVal("M Sport", "sd-val-trim")} button={<div className="sd-btn sd-btn-idle" style={{ marginTop: 16 }}>Continue →</div>} />
        </Frame>
      );
    case "Entered mileage":
      return (
        <Frame cursor={<Cursor anim="sd-cur-mile 5.5s ease-in-out" />}>
          <DetailsForm
            trim={staticVal("M Sport")}
            mileage={<span className="sd-tw sd-caret sd-type-km">80000</span>}
            button={<div className="sd-btn sd-btn-idle" style={{ marginTop: 16 }}>Continue →</div>}
          />
        </Frame>
      );
    case "Submitted details":
      return (
        <Frame cursor={<Cursor anim="sd-cur-subdet 5s ease-in-out" />}>
          <DetailsForm
            trim={staticVal("M Sport")}
            mileage={<span className="sd-val">80000</span>}
            button={
              <div className="sd-btn sd-press-subdet" style={{ marginTop: 16, position: "relative" }}>
                Continue →<Ring anim="sd-ring-subdet 5s ease-in-out" style={{ left: "50%", marginLeft: -13, top: 5 }} />
              </div>
            }
          />
        </Frame>
      );
    case "Entered phone":
      return (
        <Frame cursor={<Cursor anim="sd-cur-phone 5s ease-in-out" />}>
          <ContactForm phone={<span className="sd-tw sd-caret sd-type-phone">(780) 555-01</span>} button={<div className="sd-btn sd-btn-idle" style={{ marginTop: 14 }}>Get My Free Offer →</div>} />
        </Frame>
      );
    case "Entered email":
      return (
        <Frame cursor={<Cursor anim="sd-cur-email 5s ease-in-out" />}>
          <ContactForm
            phone={<span className="sd-val">(780) 555-0142</span>}
            email={<span className="sd-tw sd-caret sd-type-email">sarah@email.com</span>}
            button={<div className="sd-btn sd-btn-idle" style={{ marginTop: 14 }}>Get My Free Offer →</div>}
          />
        </Frame>
      );
    case "Submitted":
      return (
        <Frame cursor={<Cursor anim="sd-cur-sub 5s ease-in-out" />}>
          <ContactForm
            phone={<span className="sd-val">(780) 555-0142</span>}
            email={<span className="sd-val">sarah@email.com</span>}
            button={
              <div className="sd-btn sd-press-sub" style={{ marginTop: 14, position: "relative" }}>
                Get My Free Offer →<Ring anim="sd-ring-sub 5s ease-in-out" style={{ left: "50%", marginLeft: -13, top: 5 }} />
              </div>
            }
          />
          <div className="sd-check sd-check-in"><div className="sd-circle">✓</div><div className="sd-checktxt">Offer request sent!</div></div>
        </Frame>
      );
    default:
      return null;
  }
}

/** The "Add a few details" step (trim + mileage + Continue), shared by stages 6–8. */
function DetailsForm({ trim, mileage, button }: { trim?: ReactNode; mileage?: ReactNode; button: ReactNode }) {
  return (
    <div className="sd-screen">
      <div className="sd-vcard">
        <div className="sd-car" />
        <div style={{ textAlign: "left" }}>
          <div className="sd-lbl" style={{ margin: 0 }}>Your vehicle</div>
          <div style={{ fontWeight: 800, fontSize: 13 }}>2025 BMW i4</div>
        </div>
      </div>
      <div className="sd-lbl">Trim</div><Field ph="Select trim" value={trim} />
      <div className="sd-lbl">Mileage (km)</div>
      <div className="sd-field">{mileage ?? <span className="sd-ph">e.g. 80000</span>}</div>
      {button}
    </div>
  );
}

/** The contact step (phone + email + Get My Free Offer), shared by stages 9–11. */
function ContactForm({ phone, email, button }: { phone?: ReactNode; email?: ReactNode; button: ReactNode }) {
  return (
    <div className="sd-screen">
      <div className="sd-h2">How should we reach you?</div>
      <div className="sd-row"><div className="sd-pill sd-on">Call</div><div className="sd-pill">Text</div><div className="sd-pill">Email</div></div>
      <div className="sd-lbl">Mobile phone</div>
      <div className="sd-field">{phone ?? <span className="sd-ph">(___) ___-____</span>}</div>
      <div className="sd-lbl">Email (optional)</div>
      <div className="sd-field">{email ?? <span className="sd-ph">you@email.com</span>}</div>
      {button}
    </div>
  );
}

const DEMO_CSS = `
.sd-frame{position:relative;width:240px;height:392px;border-radius:24px;border:1px solid #e2e8f0;background:#fff;overflow:hidden;box-shadow:0 10px 34px rgba(2,8,23,.14);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0e1c2b}
.sd-hdr{height:36px;display:flex;align-items:center;justify-content:center;background:#0e1c2b;color:#fff;font-weight:800;font-size:13px}
.sd-hdr b{color:#4f7cf7}
.sd-screen{position:absolute;top:36px;left:0;right:0;bottom:0;padding:14px}
.sd-lbl{font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.04em;margin:0 0 4px}
.sd-field{height:32px;border:1px solid #dbe4ef;border-radius:9px;display:flex;align-items:center;padding:0 10px;font-size:12px;background:#fff;margin-bottom:11px;position:relative;overflow:hidden}
.sd-ph{color:#94a3b8}
.sd-val{color:#0e1c2b;font-weight:600}
.sd-btn{height:36px;border-radius:999px;background:#2563EB;color:#fff;font-weight:700;font-size:12.5px;display:flex;align-items:center;justify-content:center;gap:6px}
.sd-btn-idle{opacity:.6}
.sd-pill{height:30px;border:1px solid #e2e8f0;border-radius:999px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;flex:1}
.sd-pill.sd-on{background:#0e1c2b;color:#fff;border-color:#0e1c2b}
.sd-row{display:flex;gap:7px;margin-bottom:11px}
.sd-h2{font-size:14px;font-weight:800;margin:0 0 10px}
.sd-cursor{position:absolute;top:0;left:0;width:19px;height:19px;z-index:30;filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.35));pointer-events:none;background-repeat:no-repeat;background-size:contain}
.sd-ring{position:absolute;top:-4px;left:-4px;width:26px;height:26px;border-radius:50%;border:2px solid #2563EB;opacity:0}
.sd-tw{display:inline-block;overflow:hidden;white-space:nowrap;vertical-align:bottom;width:0}
.sd-caret{border-right:1.5px solid #0e1c2b}
.sd-omni{height:30px;border-radius:8px;background:#f1f5f9;border:1px solid #e2e8f0;display:flex;align-items:center;padding:0 10px;font-size:12px;color:#64748b;margin-bottom:14px}
.sd-hero{opacity:.12;text-align:center;padding-top:6px}
.sd-hero .sd-logo{font-size:22px;font-weight:800}
.sd-hero .sd-logo b{color:#4f7cf7}
.sd-hero .sd-tag{font-size:11px;color:#64748b;margin-top:6px}
.sd-hero .sd-cta{height:34px;border-radius:999px;background:#2563EB;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;margin-top:14px}
.sd-car{width:74px;height:40px;background:#3b82f6;border-radius:8px 12px 6px 6px;position:relative;flex:0 0 auto}
.sd-car:before{content:"";position:absolute;left:12px;top:-9px;width:38px;height:16px;background:#60a5fa;border-radius:8px 8px 0 0}
.sd-car:after{content:"";position:absolute;left:10px;bottom:-6px;width:12px;height:12px;background:#1e293b;border-radius:50%;box-shadow:40px 0 #1e293b}
.sd-vcard{display:flex;gap:12px;align-items:center;background:#f5f8fc;border:1px solid #e2e8f0;border-radius:12px;padding:10px;margin-bottom:14px}
.sd-check{position:absolute;inset:0;background:rgba(255,255,255,.94);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;opacity:0}
.sd-check .sd-circle{width:52px;height:52px;border-radius:50%;background:#16a34a;color:#fff;font-size:28px;display:flex;align-items:center;justify-content:center}
.sd-check .sd-checktxt{font-size:13px;font-weight:700;color:#16a34a}

/* Visited */
@keyframes sd-cur-visited{0%{transform:translate(175px,300px)}16%{transform:translate(112px,60px)}58%{transform:translate(112px,60px)}72%{transform:translate(120px,190px)}100%{transform:translate(120px,190px)}}
@keyframes sd-type-url{0%,18%{width:0}54%,100%{width:88px}}
@keyframes sd-hero-in{0%,58%{opacity:.12}74%,100%{opacity:1}}
.sd-type-url{animation:sd-type-url 5s steps(13) infinite}
.sd-hero-in{animation:sd-hero-in 5s ease-in-out infinite}

/* Touched form — tap the make field, no fill, no button */
@keyframes sd-cur-touch{0%{transform:translate(180px,320px)}36%{transform:translate(118px,133px)}100%{transform:translate(118px,133px)}}
@keyframes sd-ring-touch{0%,34%{opacity:0;transform:scale(.5)}44%{opacity:.9;transform:scale(1)}58%,100%{opacity:0;transform:scale(1.25)}}

/* Entered make */
@keyframes sd-cur-make{0%{transform:translate(180px,320px)}30%{transform:translate(118px,133px)}100%{transform:translate(118px,133px)}}
@keyframes sd-val-make{0%,32%{opacity:0}40%,100%{opacity:1}}
.sd-val-make{animation:sd-val-make 5s ease-in-out infinite}

/* Entered model */
@keyframes sd-cur-model{0%{transform:translate(180px,320px)}30%{transform:translate(118px,188px)}100%{transform:translate(118px,188px)}}
@keyframes sd-val-model{0%,32%{opacity:0}40%,100%{opacity:1}}
.sd-val-model{animation:sd-val-model 5s ease-in-out infinite}

/* Submitted vehicle — click Get a Free Offer */
@keyframes sd-cur-subveh{0%{transform:translate(180px,320px)}40%{transform:translate(120px,248px)}100%{transform:translate(120px,248px)}}
@keyframes sd-press-subveh{0%,40%{transform:scale(1)}46%{transform:scale(.95)}54%,100%{transform:scale(1)}}
@keyframes sd-ring-subveh{0%,38%{opacity:0;transform:scale(.5)}46%{opacity:.9;transform:scale(1)}58%,100%{opacity:0;transform:scale(1.25)}}
.sd-press-subveh{animation:sd-press-subveh 5s ease-in-out infinite}

/* Entered trim */
@keyframes sd-cur-trim{0%{transform:translate(180px,320px)}32%{transform:translate(120px,150px)}100%{transform:translate(120px,150px)}}
@keyframes sd-val-trim{0%,34%{opacity:0}42%,100%{opacity:1}}
.sd-val-trim{animation:sd-val-trim 5s ease-in-out infinite}

/* Entered mileage — type the number */
@keyframes sd-cur-mile{0%{transform:translate(180px,320px)}26%{transform:translate(120px,205px)}100%{transform:translate(120px,205px)}}
@keyframes sd-type-km{0%,30%{width:0}60%,100%{width:52px}}
.sd-type-km{animation:sd-type-km 5.5s steps(5) infinite}

/* Submitted details — click Continue */
@keyframes sd-cur-subdet{0%{transform:translate(180px,320px)}42%{transform:translate(120px,262px)}100%{transform:translate(120px,262px)}}
@keyframes sd-press-subdet{0%,42%{transform:scale(1)}48%{transform:scale(.95)}56%,100%{transform:scale(1)}}
@keyframes sd-ring-subdet{0%,40%{opacity:0;transform:scale(.5)}48%{opacity:.9;transform:scale(1)}60%,100%{opacity:0;transform:scale(1.25)}}
.sd-press-subdet{animation:sd-press-subdet 5s ease-in-out infinite}

/* Entered phone — type the number */
@keyframes sd-cur-phone{0%{transform:translate(180px,320px)}26%{transform:translate(120px,150px)}100%{transform:translate(120px,150px)}}
@keyframes sd-type-phone{0%,30%{width:0}66%,100%{width:104px}}
.sd-type-phone{animation:sd-type-phone 5s steps(11) infinite}

/* Entered email — type the address */
@keyframes sd-cur-email{0%{transform:translate(180px,320px)}26%{transform:translate(120px,205px)}100%{transform:translate(120px,205px)}}
@keyframes sd-type-email{0%,30%{width:0}70%,100%{width:118px}}
.sd-type-email{animation:sd-type-email 5s steps(15) infinite}

/* Submitted — click Get My Free Offer + success */
@keyframes sd-cur-sub{0%{transform:translate(180px,320px)}40%{transform:translate(120px,268px)}100%{transform:translate(120px,268px)}}
@keyframes sd-press-sub{0%,40%{transform:scale(1)}46%{transform:scale(.95)}54%,100%{transform:scale(1)}}
@keyframes sd-ring-sub{0%,38%{opacity:0;transform:scale(.5)}46%{opacity:.9;transform:scale(1)}58%,100%{opacity:0;transform:scale(1.25)}}
@keyframes sd-check-in{0%,58%{opacity:0}70%,100%{opacity:1}}
.sd-press-sub{animation:sd-press-sub 5s ease-in-out infinite}
.sd-check-in{animation:sd-check-in 5s ease-in-out infinite}
`;
