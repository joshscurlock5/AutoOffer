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
        // Dark surfaces & headings — a lighter, friendly navy-blue (less heavy).
        navy: {
          DEFAULT: "#1E4A7E",
          700: "#285A93",
          800: "#1E4A7E",
          900: "#16365C",
        },
        // Primary — a light, bright high-trust blue (modern fintech sky-blue).
        brand: {
          DEFAULT: "#3B82F6",
          50: "#EFF6FF",
          100: "#DBEAFE",
          200: "#BFDBFE",
          500: "#3B82F6",
          600: "#2563EB",
          700: "#1D4FD0",
        },
        // Secondary — a brighter sky/azure for highlights, badges & promos.
        accent: {
          DEFAULT: "#2E90FA",
          600: "#1E7AD8",
          700: "#1763C4",
        },
        // Cool light neutral for alternating section backgrounds (trust reads cool).
        cream: "#F1F5FB",
        ink: "#0E1B2E",
        muted: "#475569",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Arial", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      maxWidth: {
        content: "1200px",
      },
      borderRadius: {
        xl: "14px",
        "2xl": "20px",
      },
      boxShadow: {
        card: "0 10px 30px -12px rgba(16,42,76,0.16)",
        soft: "0 4px 20px -8px rgba(16,42,76,0.14)",
        lift: "0 24px 60px -20px rgba(16,42,76,0.28)",
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
