// End-to-end smoke test. Run the app (npm start / npm run dev) then:
//   node scripts/smoke-test.mjs
// Verifies every page renders and the full lead -> admin -> photo flow works.

const BASE = process.env.BASE || "http://localhost:3000";
const PASSWORD = process.env.ADMIN_PASSWORD || "autooffer-admin";

let pass = 0;
let fail = 0;
function ok(name, cond, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ✓  ${name}`);
  } else {
    fail++;
    console.log(`  ✗  ${name}  ${extra}`);
  }
}

async function waitReady() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(BASE + "/");
      if (r.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function main() {
  if (!(await waitReady())) {
    console.log("SERVER NOT READY at " + BASE);
    process.exit(1);
  }
  console.log("Server is up. Running checks...\n");

  // --- pages ---
  for (const p of ["/", "/get-offer", "/about", "/contact", "/privacy", "/referral", "/admin"]) {
    const r = await fetch(BASE + p);
    ok(`GET ${p} -> 200`, r.status === 200, `(got ${r.status})`);
  }

  const home = await (await fetch(BASE + "/")).text();
  ok("home headline present", /Sell your car today/.test(home));
  ok("home phone number present", /\(780\) 952-4504/.test(home));
  ok("home value widget present", /See What Your Car Is Worth/.test(home));
  ok(
    "home shows two CTAs (estimate + call)",
    /Get My Estimate/.test(home) && /Call or text/.test(home),
  );

  // --- funnel CTA source attribution (regression guard for OfferCtaLink's
  //     query merge: ?source= must MERGE, not clobber an existing ?make=) ---
  for (const q of ["?source=smoketest", "?make=Toyota", "?make=Toyota&source=footer_make"]) {
    const r = await fetch(BASE + "/get-offer" + q);
    ok(`GET /get-offer${q} -> 200`, r.status === 200, `(got ${r.status})`);
  }
  ok(
    "footer make link merges source WITHOUT clobbering make",
    /\/get-offer\?make=[^"&]+&(amp;)?source=footer_make/.test(home),
  );
  ok(
    "no /get-offer link has a double '?' (broken merge)",
    !/\/get-offer\?[^"]*\?/.test(home),
  );
  ok(
    "header entry CTA stamps a source",
    /\/get-offer\?source=header_(desktop|mobile)/.test(home),
  );

  const admin = await (await fetch(BASE + "/admin")).text();
  ok("admin shows login gate", /Admin/.test(admin) && /Password/.test(admin));

  // --- create a vehicle lead WITH a photo ---
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64",
  );
  const fd = new FormData();
  fd.append("kind", "vehicle");
  fd.append("year", "2019");
  fd.append("make", "Dodge");
  fd.append("model", "Challenger");
  fd.append("trim", "R/T");
  fd.append("mileageKm", "85000");
  fd.append("name", "Test Seller");
  fd.append("email", "test@example.com");
  fd.append("phone", "(587) 555-1234");
  fd.append("referralCode", "FRIEND-AB12");
  fd.append("photos", new Blob([png], { type: "image/png" }), "car.png");

  const lr = await fetch(BASE + "/api/leads", { method: "POST", body: fd });
  const lj = await lr.json().catch(() => ({}));
  ok("POST /api/leads -> ok", lr.status === 200 && lj.ok === true, JSON.stringify(lj));
  const leadId = lj.id;

  // --- email-only lead (no phone) must save (regression guard for the
  //     silent-fail bug: client allowed it, server used to reject it) ---
  const efd = new FormData();
  efd.append("kind", "vehicle");
  efd.append("year", "2018");
  efd.append("make", "Honda");
  efd.append("model", "Civic");
  efd.append("mileageKm", "60000");
  efd.append("name", "Email Only Test");
  efd.append("email", "email-only-test@example.com");
  efd.append("contactMethod", "email");
  const elr = await fetch(BASE + "/api/leads", { method: "POST", body: efd });
  const elj = await elr.json().catch(() => ({}));
  ok("POST email-only lead (no phone) -> ok", elr.status === 200 && elj.ok === true, JSON.stringify(elj));

  // --- referral ---
  const rr = await fetch(BASE + "/api/referrals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      referrerName: "Jane Doe",
      referrerEmail: "jane@example.com",
      referrerPhone: "(403) 555-9999",
      friendName: "Bob",
      friendPhone: "(403) 555-0000",
    }),
  });
  const rj = await rr.json().catch(() => ({}));
  ok("POST /api/referrals -> ok with code", rr.status === 200 && rj.ok === true && !!rj.code, JSON.stringify(rj));

  // --- auth gating ---
  ok("admin leads without cookie -> 401", (await fetch(BASE + "/api/admin/leads")).status === 401);
  const wrong = await fetch(BASE + "/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "wrongpassword" }),
  });
  ok("admin login wrong password -> 401", wrong.status === 401, `(got ${wrong.status})`);

  // --- login ---
  const login = await fetch(BASE + "/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: PASSWORD }),
  });
  ok("admin login -> 200", login.status === 200, `(got ${login.status})`);
  const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
  ok("login sets session cookie", /ao_session=/.test(cookie));

  // --- authed data ---
  const al = await fetch(BASE + "/api/admin/leads", { headers: { Cookie: cookie } });
  const aj = await al.json().catch(() => ({}));
  ok("authed admin leads -> 200", al.status === 200, `(got ${al.status})`);
  const found = (aj.leads || []).find((l) => l.id === leadId);
  ok("submitted lead is visible in admin", !!found, `leadCount=${(aj.leads || []).length}`);
  if (found) {
    ok("lead has server-computed estimate", !!found.estimate && (found.estimate.low > 0 || found.estimate.unique === true), JSON.stringify(found.estimate));
    ok("lead retained uploaded photo", Array.isArray(found.photos) && found.photos.length >= 1, `photos=${found.photos?.length}`);
    ok("lead vehicle data correct", found.vehicle?.make === "Dodge" && found.vehicle?.model === "Challenger");
    ok("lead referral code captured", found.referralCode === "FRIEND-AB12");
    ok("lead defaults to status 'new'", found.status === "new");
  }
  ok("referral visible in admin", (aj.referrals || []).some((r) => r.referrer?.email === "jane@example.com"));

  // --- gated photo serving ---
  if (found && found.photos?.[0]) {
    const url = `${BASE}/api/uploads/${leadId}/${found.photos[0].file}`;
    ok("photo blocked without auth -> 401", (await fetch(url)).status === 401);
    const a = await fetch(url, { headers: { Cookie: cookie } });
    ok("photo served to admin -> image", a.status === 200 && (a.headers.get("content-type") || "").startsWith("image/"), `(${a.status} ${a.headers.get("content-type")})`);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
