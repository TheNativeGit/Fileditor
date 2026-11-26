/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        hero: {
          bg: "#090d16",       // Sehr dunkles Blau/Schwarz für den Hintergrund
          panel: "#0f1626",    // Panel-Hintergrund
          border: "#1f293d",   // Randfarbe
          input: "#141c2c",    // Hintergrund für Inputs
          hover: "#1e293b",    // Hover-Hintergrund
          string: "#10b981",   // Smaragdgrün für Strings
          number: "#3b82f6",   // Blau für Zahlen
          boolean: "#8b5cf6",  // Violett für Booleans
          array: "#f59e0b",    // Bernsteingelb für Arrays
          object: "#06b6d4",   // Cyan für Objekte
          null: "#64748b"      // Schiefergrau für Null/Undefiniert
        }
      },
      fontFamily: {
        sans: ["Plus Jakarta Sans", "Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "ui-monospace", "monospace"]
      }
    }
  },
  plugins: []
};
