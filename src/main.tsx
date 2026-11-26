import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/700.css";
import "./utils/monacoSetup";
import App from "./App.tsx";
import { SettingsWindowApp } from "./components/SettingsModal.tsx";
import { AboutWindowApp } from "./components/AboutModal.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import "./index.css";

const windowParam = new URLSearchParams(window.location.search).get("window");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {windowParam === "settings" ? (
      <ErrorBoundary>
        <SettingsWindowApp />
      </ErrorBoundary>
    ) : windowParam === "about" ? (
      <ErrorBoundary>
        <AboutWindowApp />
      </ErrorBoundary>
    ) : (
      <App />
    )}
  </React.StrictMode>
);
