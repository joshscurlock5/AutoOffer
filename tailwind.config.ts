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
      // Custom high breakpoint: sections that use a wide multi-column desktop
      // layout switch to their phone view here (~85% of the 1390px max content)
      // instead of compressing down through the tablet range.
      screens: {
        wide: "1245px",
      },
      colors: {
        // Headings & dark surfaces — near-black & neutral (NOT blue). Brand stays blue.
        navy: {
          DEFAULT: "#16181D",
          700: "#2A2D34",
          800: "#16181D",
          900: "#0E0F13",
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
        // Section background — a cool off-white so white cards/inputs lift off it
        // (depth). Was pure white; the elevated palette gives sections a ground.
        cream: "#F5F8FC",
        ink: "#16181D",
        muted: "#4B5563",

        // ---- Semantic design tokens (resolve to CSS vars in app/globals.css) ----
        // Additive: the objects above stay for back-compat; these enable classes
        // like bg-primary, bg-surface, text-content, border-line, text-success.
        // See the design-system doc + docs/design-tokens for the migration map.
        primary: {
          DEFAULT: "rgb(var(--color-primary-rgb, 37 99 235) / <alpha-value>)",
          hover: "var(--color-primary-hover)",
          active: "var(--color-primary-active)",
          emphasis: "var(--color-primary-emphasis)",
          tint: "var(--color-brand-tint)",
        },
        secondary: {
          DEFAULT: "var(--color-secondary)",
          hover: "var(--color-secondary-hover)",
          active: "var(--color-secondary-active)",
        },
        surface: {
          DEFAULT: "var(--color-surface)",
          raised: "var(--color-surface-raised)",
          inverse: "var(--color-surface-inverse)",
          dark: "var(--color-surface-dark)",
          "dark-hover": "var(--color-surface-dark-hover)",
          tooltip: "var(--color-surface-tooltip)",
        },
        canvas: {
          DEFAULT: "var(--color-bg-page)",
          section: "var(--color-bg-section)",
          subtle: "var(--color-bg-subtle)",
          app: "var(--color-bg-app)",
          hover: "var(--color-bg-hover)",
        },
        content: {
          DEFAULT: "var(--color-text-primary)",
          secondary: "var(--color-text-secondary)",
          placeholder: "var(--color-text-placeholder)",
          disabled: "var(--color-text-disabled)",
          "on-primary": "var(--color-text-on-primary)",
          link: "var(--color-text-link)",
          "link-hover": "var(--color-text-link-hover)",
        },
        line: {
          DEFAULT: "var(--color-border)",
          strong: "var(--color-border-strong)",
          hover: "var(--color-border-hover)",
          focus: "var(--color-border-focus)",
        },
        focus: "rgb(var(--color-primary-rgb, 37 99 235) / <alpha-value>)",
        success: {
          DEFAULT: "var(--color-success)",
          bg: "var(--color-success-bg)",
          strong: "var(--color-success-strong)",
          "bg-strong": "var(--color-success-bg-strong)",
          money: "var(--color-success-money)",
        },
        warning: {
          DEFAULT: "var(--color-warning)",
          bg: "var(--color-warning-bg)",
          strong: "var(--color-warning-strong)",
          "bg-strong": "var(--color-warning-bg-strong)",
        },
        error: {
          DEFAULT: "var(--color-error)",
          "on-bg": "var(--color-error-on-bg)",
          bg: "var(--color-error-bg)",
          "bg-strong": "var(--color-error-bg-strong)",
          strong: "var(--color-error-strong)",
        },
        info: {
          DEFAULT: "var(--color-info)",
          bg: "var(--color-info-bg)",
        },
        star: "var(--color-star)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Arial", "sans-serif"],
        // Headings use Inter too (same as body) for a clean, professional look.
        display: ["var(--font-sans)", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Arial", "sans-serif"],
        // Logo lockups now use the site font (Inter), same as everything else.
        logo: ["var(--font-sans)", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Arial", "sans-serif"],
      },
      maxWidth: {
        content: "1390px",
        // Width of the stacked "phone view" content column (below the `wide`
        // breakpoint). Every section shares it so their left/right edges line up.
        col: "697px",
      },
      borderRadius: {
        xl: "14px",
        "2xl": "20px",
      },
      boxShadow: {
        card: "0 12px 34px -14px rgba(16,42,76,0.22)",
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
