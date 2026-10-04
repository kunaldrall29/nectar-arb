import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        nectar: {
          bg: "#0a0b0f",
          panel: "#12141c",
          border: "#252836",
          amber: "#f5b942",
          mint: "#3dd6c3",
          rose: "#f07178",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
