import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        nectar: {
          bg: "#0b0f14",
          panel: "#121820",
          border: "#1f2a37",
          accent: "#f59e0b",
          mint: "#34d399",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
