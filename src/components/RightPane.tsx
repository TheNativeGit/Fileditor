import React from "react";
import { useTranslation } from "../i18n";
import { useFileStore } from "../store/useFileStore";
import { ColumnView } from "./views/ColumnView";
import { TreeView } from "./views/TreeView";
import { TableView } from "./views/TableView";
import { MarkdownView } from "./views/MarkdownView";
import { AlertCircle } from "lucide-react";

export const RightPane: React.FC = () => {
  const { t } = useTranslation();
  const { mode, jsonValue, hasSyntaxError, viewMode, jsonString } = useFileStore();

  // When document is empty
  const isDocEmpty = !jsonString.trim();

  // When document has a syntax error (distinguishes valid JSON `null` from invalid syntax)
  const hasInvalidDoc = hasSyntaxError && !isDocEmpty;

  if (mode === "txt") {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-hero-bg text-slate-400 p-8 select-none">
        <div className="bg-hero-panel border border-hero-border rounded-xl p-8 max-w-md text-center shadow-xl space-y-3">
          <div className="text-4xl">📄</div>
          <h2 className="text-white font-semibold text-base">{t("rightPane.textModeTitle")}</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            {t("rightPane.textModeDesc")}
          </p>
        </div>
      </div>
    );
  }

  if (isDocEmpty) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-hero-bg text-slate-400 p-8 select-none">
        <div className="bg-hero-panel border border-hero-border rounded-xl p-8 max-w-md text-center shadow-xl">
          <div className="text-4xl mb-3">📝</div>
          <h2 className="text-white font-semibold text-lg mb-2">{t("rightPane.noDataTitle")}</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            {mode === "markdown" 
              ? t("rightPane.noDataMarkdownDesc")
              : t("rightPane.noDataDocDesc", { type: mode === "json" ? "JSON" : "XML" })}
          </p>
        </div>
      </div>
    );
  }

  if (hasInvalidDoc && mode !== "markdown") {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-hero-bg text-slate-400 p-8 select-none">
        <div className="bg-hero-panel border border-rose-950/40 rounded-xl p-8 max-w-md text-center shadow-xl">
          <div className="text-rose-500 mb-3 flex justify-center">
            <AlertCircle size={40} className="animate-bounce" />
          </div>
          <h2 className="text-white font-semibold text-lg mb-2">
            {t("rightPane.syntaxErrorTitle", { type: mode === "json" ? "JSON" : "XML" })}
          </h2>
          <p className="text-xs text-slate-400 leading-relaxed mb-4">
            {t("rightPane.syntaxErrorDesc")}
          </p>
          <div className="text-[10px] font-mono bg-rose-950/20 border border-rose-900/40 text-rose-300 p-2 rounded max-h-32 overflow-y-auto text-left">
            {mode === "json"
              ? t("rightPane.syntaxErrorJsonHint")
              : t("rightPane.syntaxErrorXmlHint")}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-hero-bg overflow-hidden flex flex-col">
      {/* Container für die aktive Ansicht */}
      <div className="flex-1 min-h-0 relative">
        {mode === "markdown" ? (
          <MarkdownView />
        ) : (
          <>
            {viewMode === "column" && <ColumnView />}
            {viewMode === "tree" && <TreeView />}
            {viewMode === "table" && <TableView />}
          </>
        )}
      </div>
    </div>
  );
};

// Version 3.1