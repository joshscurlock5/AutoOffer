/** @type {import('next').NextConfig} */

// Baseline security headers applied to every response. Deliberately NOT setting a
// strict script/style CSP yet (would need nonces + testing against GA/Next inline
// scripts); frame-ancestors 'none' + X-Frame-Options block clickjacking, which is
// the high-value part. Add a full CSP later as a follow-up.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
