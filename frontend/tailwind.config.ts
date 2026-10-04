import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        nectar: {
          ink: "#0c0a08",
          panel: "#16110d",
          line: "#2a2118",
          gold: "#e8b86d",
          honey: "#f4d19b",
          rust: "#c46b3a",
          mist: "#c9b8a3",
          ok: "#7dcea0",
          wait: "#e6c36a",
          bad: "#e07a6a",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist)", "ui-sans-serif", "system-ui"],
        display: ["var(--font-fraunces)", "ui-serif", "Georgia"],
      },
    },
  },
  plugins: [],
};

export default config;
