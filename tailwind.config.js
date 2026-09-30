import forms from "@tailwindcss/forms";

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{vue,ts}"],
  theme: {
    extend: {
      colors: {
        ink: "#0d1117",
        mist: "#f3f7fb",
        signal: {
          high: "#ff6b6b",
          medium: "#ffd166",
          low: "#7bd88f"
        }
      },
      fontFamily: {
        display: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
        body: ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "PingFang SC", "Microsoft YaHei", "sans-serif"]
      },
      boxShadow: {
        panel: "0 18px 60px rgba(3, 12, 25, 0.18)",
        glow: "0 0 0 1px rgba(255,255,255,0.08), 0 20px 80px rgba(25, 118, 210, 0.18)"
      },
      backgroundImage: {
        grid: "linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px)"
      }
    }
  },
  plugins: [forms]
};
