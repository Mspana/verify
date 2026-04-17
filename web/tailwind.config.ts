import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#FBFAF7",
        ink: "#141414",
        cobalt: "#1652F0",
        "ink-muted": "#6B6B68",
        "paper-edge": "#EFEEE9",
        human: {
          fill: "#F7E8E3",
          accent: "#B85446",
        },
        uncertain: {
          fill: "#F6EBD6",
          accent: "#C08A3E",
        },
        ai: {
          fill: "#E7EEDE",
          accent: "#6B8C4F",
        },
      },
      borderRadius: {
        btn: "8px",
        card: "12px",
        frame: "24px",
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "PingFang SC",
          "Noto Sans SC",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
} satisfies Config;
