import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1.25rem",
      screens: { "2xl": "1200px" },
    },
    extend: {
      colors: {
        // Dark surfaces & headings — a deep forest "ink", not the stock Stripe navy.
        navy: {
          DEFAULT: "#10291E",
          700: "#17402E",
          800: "#10291E",
          900: "#0A1C14",
        },
        // Primary — confident "money" green (not Tailwind's default blue).
        brand: {
          DEFAULT: "#1A7F54",
          50: "#ECFBF2",
          100: "#D5F4E2",
          200: "#A7E8C8",
          500: "#1A7F54",
          600: "#156945",
          700: "#114F35",
        },
        // Secondary — a real gold that does work everywhere (CTAs, offer figure, stats).
        accent: {
          DEFAULT: "#F0B429",
          600: "#D69A1C",
          700: "#B7831A",
        },
        // Warm neutral for alternating section backgrounds (vs cold slate).
        cream: "#FAF6EE",
        ink: "#12231B",
        muted: "#475569",
      },
      fontFamily: {
        sans: ["Hanken Grotesk", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Arial", "sans-serif"],
        display: ["Bricolage Grotesque", "Hanken Grotesk", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      maxWidth: {
        content: "1200px",
      },
      borderRadius: {
        xl: "14px",
        "2xl": "20px",
      },
      boxShadow: {
        card: "0 10px 30px -12px rgba(16,41,30,0.16)",
        soft: "0 4px 20px -8px rgba(16,41,30,0.14)",
        lift: "0 24px 60px -20px rgba(16,41,30,0.28)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pop-in": {
          "0%": { opacity: "0", transform: "scale(0.92)" },
          "60%": { transform: "scale(1.03)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s ease-out both",
        "pop-in": "pop-in 0.45s cubic-bezier(.2,.8,.2,1) both",
      },
    },
  },
  plugins: [],
};

export default config;
