import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite-Konfiguration mit React-Plugin und Entwicklungsserver-Port 3000
export default defineConfig({
  base: "./", // Ermöglicht das Laden über relative Pfade (z. B. für file:// Protokoll per Doppelklick)
  plugins: [react()],
  server: {
    port: 3000,
    open: true
  }
});
// Version 1.4

