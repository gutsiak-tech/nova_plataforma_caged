// Tailwind source of truth.
// This CommonJS config is the active config loaded by PostCSS/Vite.
// Keep visual tokens aligned with dashboard/src/index.css and dashboard/src/lib/theme.ts.

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "Segoe UI",
          "Inter",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "Noto Sans",
          "Liberation Sans",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Consolas",
          "Liberation Mono",
          "monospace",
        ],
      },
      boxShadow: {
        soft:
          "0 1px 1px rgba(0,0,0,.06), 0 12px 40px rgba(15, 23, 42, .10)",
        lift:
          "0 1px 2px rgba(0,0,0,.08), 0 28px 90px rgba(15, 23, 42, .18)",
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.35rem",
      },
    },
  },
  plugins: [require("@tailwindcss/forms"), require("@tailwindcss/typography")],
};
