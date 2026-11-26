import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, Trash2, Copy, Check } from "lucide-react";
import { logger } from "../utils/logger";
import { useI18nStore } from "../i18n";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    copied: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null, copied: false };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    logger.error("ReactErrorBoundary", error.message, errorInfo.componentStack ?? undefined);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetStorage = () => {
    try {
      localStorage.clear();
      logger.warn("ReactErrorBoundary", "User triggered local storage clear to recover app.");
      window.location.reload();
    } catch (e) {
      console.error(e);
    }
  };

  private handleCopyError = () => {
    const errorText = `${this.state.error?.toString() || ""}\n\nStack:${this.state.errorInfo?.componentStack || ""}`;
    navigator.clipboard.writeText(errorText);
    this.setState({ copied: true });
    setTimeout(() => this.setState({ copied: false }), 2000);
  };

  public render() {
    if (this.state.hasError) {
      const t = useI18nStore.getState().t;
      return (
        <div className="w-screen h-screen flex items-center justify-center bg-[#090d16] text-white p-6 font-sans select-none">
          <div className="bg-[#0e1624] border border-rose-500/30 rounded-xl p-8 max-w-xl w-full shadow-2xl space-y-5">
            <div className="flex items-center space-x-3 text-rose-400">
              <AlertTriangle size={32} className="shrink-0" />
              <div>
                <h1 className="text-lg font-bold text-white">{t("errorBoundary.title")}</h1>
                <p className="text-xs text-slate-400 font-mono">{t("errorBoundary.subtitle")}</p>
              </div>
            </div>

            <div className="bg-[#060a12] border border-slate-800 rounded-lg p-3 text-[11px] font-mono space-y-1 text-slate-300 max-h-48 overflow-y-auto">
              <p className="font-bold text-rose-300">{this.state.error?.toString()}</p>
              {this.state.errorInfo && (
                <pre className="text-[10px] text-slate-500 whitespace-pre-wrap pt-1">
                  {this.state.errorInfo.componentStack}
                </pre>
              )}
            </div>

            <div className="text-[11px] text-slate-400 leading-relaxed">
              {t("errorBoundary.logHint")}
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-800">
              <button
                onClick={this.handleCopyError}
                className="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                {this.state.copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                {this.state.copied ? t("errorBoundary.copied") : t("errorBoundary.copyError")}
              </button>
              <button
                onClick={this.handleResetStorage}
                className="px-3 py-1.5 rounded-md bg-rose-950/60 hover:bg-rose-900 border border-rose-500/40 text-rose-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Trash2 size={13} /> {t("errorBoundary.resetStorage")}
              </button>
              <button
                onClick={this.handleReload}
                className="px-4 py-1.5 rounded-md bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw size={13} /> {t("errorBoundary.reload")}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
