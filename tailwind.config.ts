import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],  theme: {
    extend: {
      colors: {
        bgdeep: "#0B2E22",
        bgpanel: "#0F3B2A",
        bgpanel2: "#123F2C",
        stripe: "#0F4531",
        ink: "#F4F1E4",
        inkdim: "#AFC6B4",
        gold: "#F2C14E",
        golddim: "#C99A2E",
        greenbright: "#4ADE80",
        redcard: "#E4572E"
      },
      fontFamily: {
        display: ["Anton", "sans-serif"],
        body: ["'Work Sans'", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"]
      }
    }
  },
  plugins: []
};

export default config;
