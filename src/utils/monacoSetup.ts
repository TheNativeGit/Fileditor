import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";

// Configure Monaco to run 100% locally via bundled Vite Web Workers (offline & GDPR-clean, no CDN)
(self as any).MonacoEnvironment = {
  getWorker(_: unknown, label: string) {
    if (label === "json") {
      return new jsonWorker();
    }
    if (label === "html" || label === "xml") {
      return new htmlWorker();
    }
    return new editorWorker();
  }
};

loader.config({ monaco });
