import React, { useMemo } from "react";
import { useFileStore } from "../store/useFileStore";
import { useTranslation } from "../i18n";

export const BottomStatusBar: React.FC = () => {
  const { t } = useTranslation();
  const { mode, txtEncoding, txtLineEndings, cursorPos, jsonString } = useFileStore();

  const stats = useMemo(() => {
    const text = jsonString || "";
    const lines = text ? text.split(/\r?\n/).length : 0;
    const trimmed = text.trim();
    const words = trimmed ? trimmed.split(/\s+/).length : 0;
    const chars = text.length;
    let bytes = 0;
    try {
      bytes = new Blob([text]).size;
    } catch {
      bytes = chars;
    }
    return { lines, words, chars, bytes };
  }, [jsonString]);

  const docBadge =
    mode === "markdown" ? ".md Document" :
    mode === "json" ? ".json Document" :
    mode === "xml" ? ".xml Document" :
    mode === "txt" ? ".txt Document" :
    ".todo Document";

  return (
    <footer className="h-6 w-full bg-[#070b13] border-t border-hero-border flex items-center justify-between px-3 text-[10px] font-mono text-slate-400 select-none shrink-0 z-20">
      <div className="flex items-center space-x-3 sm:space-x-4">
        <span>{t("statusBar.lines")}: {stats.lines}</span>
        <span>{t("statusBar.words")}: {stats.words}</span>
        <span>{t("statusBar.chars")}: {stats.chars}</span>
        <span>{t("statusBar.bytes")}: {stats.bytes}</span>
      </div>
      <div className="flex items-center space-x-3 sm:space-x-4">
        <span>{t("statusBar.lineShort")}: {cursorPos?.line ?? 1}, {t("statusBar.colShort")}: {cursorPos?.col ?? 1}</span>
        <span style={{ color: "var(--color-primary-accent)" }}>{txtEncoding.toUpperCase()}</span>
        <span style={{ color: "var(--color-primary-accent)" }}>{txtLineEndings.toUpperCase()}</span>
        <span className="text-emerald-400 font-bold border-l border-slate-800 pl-3">
          {docBadge}
        </span>
      </div>
    </footer>
  );
};
