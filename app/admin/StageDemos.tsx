"use client";

import { type ReactNode } from "react";

// ---------------------------------------------------------------------------
//  StageDemo — a small, looping, pure-CSS animation of one funnel stage: the
//  actual form screen it maps to, with a moving cursor performing the tracked
//  action. A button is "clicked" (press + ripple) only when the button press is
//  part of what the stage records (Visited / Reached contact / Typing info do
//  not click). Shown behind the ⓘ next to each stage on the A/B funnel.
//
//  Self-contained: all keyframes live in DEMO_CSS (sd- prefixed so nothing
//  collides with app styles) and are injected with the component. Keyed by the
//  stage's display LABEL (from lib/eventAnalytics STAGES) via STAGE_INFO.
// ---------------------------------------------------------------------------

/** Plain-English title + one-line description per funnel-stage label. Also the
 * allow-list: a label with no entry here gets no ⓘ button. */
export const STAGE_INFO: Record<string, { title: string; blurb: string }> = {
  Visited: { title: "Visited", blurb: "Someone landed on the DriveOffer website." },
  "Opened form": { title: "Opened form", blurb: "They opened the get-offer form." },
  "Entered vehicle": { title: "Entered vehicle", blurb: "They entered year, make & model, then continued." },
  "Added details": { title: "Added details", blurb: "They added mileage & condition, then continued." },
  "Reached contact": { title: "Reached contact", blurb: "They reached the contact step (shown — nothing clicked yet)." },
  "Typing info": { title: "Typing info", blurb: "They started typing their contact info." },
  Submitted: { title: "Submitted", blurb: "They submitted the form — became a lead." },
};

export function hasStageDemo(label: string): boolean {
  return label in STAGE_INFO;
}

const CURSOR_SVG =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M4 2 L4 19 L8.5 14.5 L11.5 21.5 L14.5 20.2 L11.5 13.5 L18 13.5 Z' fill='%230e1c2b' stroke='white' stroke-width='1.3' stroke-linejoin='round'/%3E%3C/svg%3E\")";

function Cursor({ anim }: { anim: string }) {
  return (
    <span
      className="sd-cursor"
      style={{ backgroundImage: CURSOR_SVG, animation: `${anim} both infinite` }}
      aria-hidden
    />
  );
}
function Ring({ anim, style }: { anim: string; style?: React.CSSProperties }) {
  return <span className="sd-ring" style={{ animation: `${anim} both infinite`, ...style }} aria-hidden />;
}

function Frame({ children, cursor }: { children: ReactNode; cursor: ReactNode }) {
  return (
    <div className="sd-frame">
      <div className="sd-hdr">
        Drive<b>Offer</b>
      </div>
      {children}
      {cursor}
    </div>
  );
}

export default function StageDemo({ stage }: { stage: string }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: DEMO_CSS }} />
      {renderStage(stage)}
    </>
  );
}

function renderStage(stage: string): ReactNode {
  switch (stage) {
    case "Visited":
      return (
        <Frame cursor={<Cursor anim="sd-cur-visited 5s ease-in-out" />}>
          <div className="sd-screen">
            <div className="sd-omni">
              🔒 <span className="sd-tw sd-caret sd-type-url" style={{ marginLeft: 6 }}>driveoffer.ca</span>
            </div>
            <div className="sd-hero sd-hero-in">
              <div className="sd-logo">Drive<b>Offer</b></div>
              <div className="sd-tag">Sell your car the easy way.</div>
              <div className="sd-cta">Get a Free Offer</div>
            </div>
          </div>
        </Frame>
      );
    case "Opened form":
      return (
        <Frame cursor={<Cursor anim="sd-cur-open 5s ease-in-out" />}>
          <div className="sd-screen">
            <div className="sd-home-out">
              <div className="sd-h2">Get your offer</div>
              <div className="sd-lbl">Free • 60 seconds</div>
              <div className="sd-btn sd-press-open" style={{ marginTop: 60, position: "relative" }}>
                Get a Free Offer →<Ring anim="sd-ring-open 5s ease-in-out" style={{ left: "50%", marginLeft: -13, top: 4 }} />
              </div>
            </div>
            <div className="sd-fade sd-form-in">
              <div className="sd-lbl">Year</div><div className="sd-field"><span className="sd-ph">Year</span></div>
              <div className="sd-lbl">Make</div><div className="sd-field"><span className="sd-ph">Make</span></div>
              <div className="sd-lbl">Model</div><div className="sd-field"><span className="sd-ph">Model</span></div>
            </div>
          </div>
        </Frame>
      );
    case "Entered vehicle":
      return (
        <Frame cursor={<Cursor anim="sd-cur-veh 5.5s ease-in-out" />}>
          <div className="sd-screen">
            <div className="sd-lbl">Year</div>
            <div className="sd-field"><span className="sd-ph">Year</span><span className="sd-val sd-val-y" style={{ position: "absolute", left: 10 }}>2025</span></div>
            <div className="sd-lbl">Make</div>
            <div className="sd-field"><span className="sd-ph">Make</span><span className="sd-val sd-val-mk" style={{ position: "absolute", left: 10 }}>BMW</span></div>
            <div className="sd-lbl">Model</div>
            <div className="sd-field"><span className="sd-ph">Model</span><span className="sd-val sd-val-md" style={{ position: "absolute", left: 10 }}>i4</span></div>
            <div className="sd-btn sd-press-veh" style={{ marginTop: 8, position: "relative" }}>
              Get a Free Offer →<Ring anim="sd-ring-veh 5.5s ease-in-out" style={{ left: "50%", marginLeft: -13, top: 5 }} />
            </div>
          </div>
        </Frame>
      );
    case "Added details":
      return (
        <Frame cursor={<Cursor anim="sd-cur-det 5.5s ease-in-out" />}>
          <div className="sd-screen">
            <div className="sd-vcard">
              <div className="sd-car" />
              <div style={{ textAlign: "left" }}>
                <div className="sd-lbl" style={{ margin: 0 }}>Your vehicle</div>
                <div style={{ fontWeight: 800, fontSize: 13 }}>2025 BMW i4</div>
              </div>
            </div>
            <div className="sd-lbl">Mileage (km)</div>
            <div className="sd-field"><span className="sd-tw sd-caret sd-type-km">80000</span></div>
            <div className="sd-btn sd-press-det" style={{ marginTop: 18, position: "relative" }}>
              Continue →<Ring anim="sd-ring-det 5.5s ease-in-out" style={{ left: "50%", marginLeft: -13, top: 5 }} />
            </div>
          </div>
        </Frame>
      );
    case "Reached contact":
      return (
        <Frame cursor={<Cursor anim="sd-cur-reach 4.5s ease-in-out" />}>
          <div className="sd-screen sd-slide-in">
            <div className="sd-h2">How should we reach you?</div>
            <div className="sd-row"><div className="sd-pill sd-on">Call</div><div className="sd-pill">Text</div><div className="sd-pill">Email</div></div>
            <div className="sd-lbl">Mobile phone</div><div className="sd-field"><span className="sd-ph">(___) ___-____</span></div>
            <div className="sd-lbl">Email (optional)</div><div className="sd-field"><span className="sd-ph">you@email.com</span></div>
          </div>
        </Frame>
      );
    case "Typing info":
      return (
        <Frame cursor={<Cursor anim="sd-cur-type 5s ease-in-out" />}>
          <div className="sd-screen">
            <div className="sd-h2">How should we reach you?</div>
            <div className="sd-row"><div className="sd-pill sd-on">Call</div><div className="sd-pill">Text</div><div className="sd-pill">Email</div></div>
            <div className="sd-lbl">Mobile phone</div>
            <div className="sd-field"><span className="sd-tw sd-caret sd-type-phone">(780) 555-01</span><Ring anim="sd-ring-type 5s ease-in-out" style={{ left: 96, top: 3 }} /></div>
            <div className="sd-lbl">Email (optional)</div><div className="sd-field"><span className="sd-ph">you@email.com</span></div>
          </div>
        </Frame>
      );
    case "Submitted":
      return (
        <Frame cursor={<Cursor anim="sd-cur-sub 5s ease-in-out" />}>
          <div className="sd-screen">
            <div className="sd-h2">Almost done</div>
            <div className="sd-lbl">Mobile phone</div><div className="sd-field"><span className="sd-val">(780) 555-0142</span></div>
            <div className="sd-lbl">Email (optional)</div><div className="sd-field"><span className="sd-val">sarah@email.com</span></div>
            <div className="sd-btn sd-press-sub" style={{ marginTop: 16, position: "relative" }}>
              Get My Free Offer →<Ring anim="sd-ring-sub 5s ease-in-out" style={{ left: "50%", marginLeft: -13, top: 5 }} />
            </div>
            <div className="sd-check sd-check-in"><div className="sd-circle">✓</div><div className="sd-checktxt">Offer request sent!</div></div>
          </div>
        </Frame>
      );
    default:
      return null;
  }
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
.sd-fade{position:absolute;inset:0;padding:14px;background:#fff}
.sd-check{position:absolute;inset:0;background:rgba(255,255,255,.94);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;opacity:0}
.sd-check .sd-circle{width:52px;height:52px;border-radius:50%;background:#16a34a;color:#fff;font-size:28px;display:flex;align-items:center;justify-content:center}
.sd-check .sd-checktxt{font-size:13px;font-weight:700;color:#16a34a}

@keyframes sd-cur-visited{0%{transform:translate(175px,300px)}16%{transform:translate(112px,60px)}58%{transform:translate(112px,60px)}72%{transform:translate(120px,190px)}100%{transform:translate(120px,190px)}}
@keyframes sd-type-url{0%,18%{width:0}54%,100%{width:88px}}
@keyframes sd-hero-in{0%,58%{opacity:.12}74%,100%{opacity:1}}
.sd-type-url{animation:sd-type-url 5s steps(13) infinite}
.sd-hero-in{animation:sd-hero-in 5s ease-in-out infinite}

@keyframes sd-cur-open{0%{transform:translate(180px,300px)}30%{transform:translate(120px,206px)}100%{transform:translate(120px,206px)}}
@keyframes sd-ring-open{0%,26%{opacity:0;transform:scale(.5)}34%{opacity:.9;transform:scale(1)}46%,100%{opacity:0;transform:scale(1.25)}}
@keyframes sd-press-open{0%,28%{transform:scale(1)}34%{transform:scale(.95)}42%,100%{transform:scale(1)}}
@keyframes sd-home-out{0%,42%{opacity:1}52%,100%{opacity:0}}
@keyframes sd-form-in{0%,48%{opacity:0}62%,100%{opacity:1}}
.sd-press-open{animation:sd-press-open 5s ease-in-out infinite}
.sd-home-out{animation:sd-home-out 5s ease-in-out infinite}
.sd-form-in{animation:sd-form-in 5s ease-in-out infinite}

@keyframes sd-cur-veh{0%{transform:translate(180px,300px)}12%{transform:translate(120px,74px)}30%{transform:translate(120px,128px)}48%{transform:translate(120px,182px)}66%{transform:translate(120px,300px)}100%{transform:translate(120px,300px)}}
@keyframes sd-val-y{0%,13%{opacity:0}19%,100%{opacity:1}}
@keyframes sd-val-mk{0%,31%{opacity:0}37%,100%{opacity:1}}
@keyframes sd-val-md{0%,49%{opacity:0}55%,100%{opacity:1}}
@keyframes sd-press-veh{0%,66%{transform:scale(1)}72%{transform:scale(.95)}80%,100%{transform:scale(1)}}
@keyframes sd-ring-veh{0%,64%{opacity:0;transform:scale(.5)}72%{opacity:.9;transform:scale(1)}84%,100%{opacity:0;transform:scale(1.25)}}
.sd-val-y{animation:sd-val-y 5.5s ease-in-out infinite}
.sd-val-mk{animation:sd-val-mk 5.5s ease-in-out infinite}
.sd-val-md{animation:sd-val-md 5.5s ease-in-out infinite}
.sd-press-veh{animation:sd-press-veh 5.5s ease-in-out infinite}

@keyframes sd-cur-det{0%{transform:translate(180px,300px)}22%{transform:translate(120px,150px)}60%{transform:translate(120px,150px)}74%{transform:translate(120px,300px)}100%{transform:translate(120px,300px)}}
@keyframes sd-type-km{0%,26%{width:0}56%,100%{width:52px}}
@keyframes sd-press-det{0%,74%{transform:scale(1)}80%{transform:scale(.95)}88%,100%{transform:scale(1)}}
@keyframes sd-ring-det{0%,72%{opacity:0;transform:scale(.5)}80%{opacity:.9;transform:scale(1)}92%,100%{opacity:0;transform:scale(1.25)}}
.sd-type-km{animation:sd-type-km 5.5s steps(5) infinite}
.sd-press-det{animation:sd-press-det 5.5s ease-in-out infinite}

@keyframes sd-slide-in{0%{opacity:0;transform:translateY(16px)}30%,100%{opacity:1;transform:translateY(0)}}
@keyframes sd-cur-reach{0%{transform:translate(180px,300px)}40%{transform:translate(70px,58px)}100%{transform:translate(70px,58px)}}
.sd-slide-in{animation:sd-slide-in 4.5s ease-out infinite}

@keyframes sd-cur-type{0%{transform:translate(180px,300px)}24%{transform:translate(120px,150px)}100%{transform:translate(120px,150px)}}
@keyframes sd-type-phone{0%,28%{width:0}66%,100%{width:104px}}
@keyframes sd-ring-type{0%,22%{opacity:0;transform:scale(.5)}30%{opacity:.9;transform:scale(1)}42%,100%{opacity:0;transform:scale(1.25)}}
.sd-type-phone{animation:sd-type-phone 5s steps(11) infinite}

@keyframes sd-cur-sub{0%{transform:translate(180px,300px)}38%{transform:translate(120px,300px)}100%{transform:translate(120px,300px)}}
@keyframes sd-press-sub{0%,38%{transform:scale(1)}44%{transform:scale(.95)}52%,100%{transform:scale(1)}}
@keyframes sd-ring-sub{0%,36%{opacity:0;transform:scale(.5)}44%{opacity:.9;transform:scale(1)}56%,100%{opacity:0;transform:scale(1.25)}}
@keyframes sd-check-in{0%,54%{opacity:0}66%,100%{opacity:1}}
.sd-press-sub{animation:sd-press-sub 5s ease-in-out infinite}
.sd-check-in{animation:sd-check-in 5s ease-in-out infinite}
`;
