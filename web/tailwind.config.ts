import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#FBFAF7",
        "paper-alt": "#F3F1EB",
        border: "#D9D5C9",
        ink: "#141414",
        cobalt: "#1652F0",
        "cobalt-soft": "#DBEAFE",
        human: {
          fill: "#F7E8E3",
          accent: "#B85446",
          ink: "#7A2E23",
        },
        uncertain: {
          fill: "#F6EBD6",
          accent: "#C08A3E",
          ink: "#7A5418",
        },
        ai: {
          fill: "#E7EEDE",
          accent: "#6B8C4F",
          ink: "#3E5828",
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
