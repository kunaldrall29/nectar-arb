import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        nectar: {
          bg: "#0b1020",
          panel: "#121a2f",
          accent: "#f6b73c",
          mint: "#3dd6c3",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
