import React, { useEffect, useRef, useState } from "react";
import { Modal, Button, ConfigProvider, theme } from "antd";
import {
  Sparkles,
  CheckCircle2,
  Info,
  X,
  Globe,
  ExternalLink,
  Scale,
  ChevronDown,
  ChevronUp,
  FileClock,
  Github
} from "lucide-react";
import { APP_VERSION } from "../version";
import { useTranslation, useI18nStore } from "../i18n";
import { useFileStore } from "../store/useFileStore";
import { renderMarkdownToHtml } from "../utils/markdownParser";
import { invokeTauriSafe, isTauriEnv, listenTauri } from "../utils/tauriBridge";
import rawChangelog from "../../CHANGELOG.md?raw";

const openWebsite = async (url: string) => {
  if (isTauriEnv()) {
    await invokeTauriSafe("open_external_url", { url });
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
};

const OPEN_SOURCE_CREDITS = [
  { name: "Tauri & Tauri Plugins", license: "MIT OR Apache-2.0", url: "https://tauri.app" },
  { name: "React & React DOM", license: "MIT", url: "https://react.dev" },
  { name: "Monaco Editor (monaco-editor)", license: "MIT", url: "https://microsoft.github.io/monaco-editor/" },
  { name: "Ant Design & Icons", license: "MIT", url: "https://ant.design" },
  { name: "Ajv JSON Schema Validator", license: "MIT", url: "https://ajv.js.org" },
  { name: "DOMPurify", license: "MPL-2.0 OR Apache-2.0", url: "https://github.com/cure53/DOMPurify" },
  { name: "uppsala (XML / XSD / XPath)", license: "BSD-2-Clause", url: "https://github.com/kushaldas/uppsala" },
  { name: "Zustand", license: "MIT", url: "https://zustand-demo.pmnd.rs" },
  { name: "Tailwind CSS", license: "MIT", url: "https://tailwindcss.com" },
  { name: "Lucide Icons (lucide-react)", license: "ISC", url: "https://lucide.dev" },
  { name: "Serde, Chrono, Log & rfd", license: "MIT / Apache-2.0", url: "https://crates.io" },
  { name: "Plus Jakarta Sans & JetBrains Mono (@fontsource)", license: "SIL OFL-1.1", url: "https://fontsource.org" }
];

interface AboutContentProps {
  onClose: () => void;
  showHeaderCloseButton?: boolean;
}

export const AboutContent: React.FC<AboutContentProps> = ({
  onClose,
  showHeaderCloseButton = false
}) => {
  const { t } = useTranslation();
  const [showFeatures, setShowFeatures] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const [showLicenses, setShowLicenses] = useState(false);
  const featuresSectionRef = useRef<HTMLDivElement>(null);
  const changelogSectionRef = useRef<HTMLDivElement>(null);
  const licensesSectionRef = useRef<HTMLDivElement>(null);

  const handleToggleFeatures = () => {
    const next = !showFeatures;
    setShowFeatures(next);
    if (next) {
      setTimeout(() => {
        featuresSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 60);
    }
  };

  const features = [
    t("app.feature1"),
    t("app.feature2"),
    t("app.feature3"),
    t("app.feature4"),
    t("app.feature5"),
    t("app.feature6")
  ];

  const changelogHtml = renderMarkdownToHtml(rawChangelog);

  const handleToggleChangelog = () => {
    const next = !showChangelog;
    setShowChangelog(next);
    if (next) {
      setTimeout(() => {
        changelogSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 40);
    }
  };

  const handleToggleLicenses = () => {
    const next = !showLicenses;
    setShowLicenses(next);
    if (next) {
      setTimeout(() => {
        licensesSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 40);
    }
  };

  return (
    <div className="flex flex-col text-slate-200 h-full w-full overflow-hidden bg-[#0b101b]">
      {/* Header with Logo, Version, Website & GitHub */}
      <div className="relative px-5 sm:px-6 pt-5 pb-4 bg-gradient-to-b from-[#141c2e] to-[#0b101b] border-b border-slate-800/80 shrink-0">
        {showHeaderCloseButton && (
          <button
            onClick={onClose}
            className="absolute top-5 right-5 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors cursor-pointer"
            title={t("tabs.close")}
          >
            <X size={16} />
          </button>
        )}

        <div className="flex items-center gap-3.5">
          <img src="/Logo.png" alt="Fileditor" className="w-11 h-11 object-contain select-none" />
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2.5">
              <h2 className="text-base font-bold text-white tracking-wide">Fileditor</h2>
              <span
                className="px-2 py-0.5 rounded-full text-[11px] font-mono font-medium border"
                style={{
                  backgroundColor: "rgba(var(--color-primary-accent-rgb), 0.16)",
                  color: "var(--color-primary-accent)",
                  borderColor: "rgba(var(--color-primary-accent-rgb), 0.45)"
                }}
              >
                v{APP_VERSION}
              </span>
            </div>
            <p className="text-xs font-medium mt-0.5" style={{ color: "var(--color-primary-accent)" }}>
              {t("app.aboutSubtitle")}
            </p>
            <div className="mt-1.5 flex items-center gap-4 flex-wrap">
              <button
                type="button"
                onClick={() => openWebsite("https://nativeproduction.de")}
                className="inline-flex items-center gap-1.5 text-[11px] font-mono text-slate-300 hover:text-white transition-colors w-fit cursor-pointer group"
              >
                <Globe size={12} style={{ color: "var(--color-primary-accent)" }} />
                <span className="underline decoration-slate-600 group-hover:decoration-white underline-offset-2">
                  nativeproduction.de
                </span>
                <ExternalLink size={10} className="text-slate-500 group-hover:text-white" />
              </button>

              <button
                type="button"
                onClick={() => openWebsite("https://github.com/TheNativeGit/Fileditor")}
                className="inline-flex items-center gap-1.5 text-[11px] font-mono text-slate-300 hover:text-white transition-colors w-fit cursor-pointer group"
              >
                <Github size={12} style={{ color: "var(--color-primary-accent)" }} />
                <span className="underline decoration-slate-600 group-hover:decoration-white underline-offset-2">
                  GitHub
                </span>
                <ExternalLink size={10} className="text-slate-500 group-hover:text-white" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable Content Body */}
      <div className="p-5 sm:p-6 space-y-5 text-[12.5px] leading-relaxed flex-1 min-h-0 overflow-y-auto scrollbar-thin">
        {/* Supported Features Block (Collapsible) */}
        <div ref={featuresSectionRef} className="space-y-1.5">
          <button
            type="button"
            onClick={handleToggleFeatures}
            className="w-full flex items-center justify-between text-xs font-semibold text-slate-100 uppercase tracking-wider font-mono py-1 cursor-pointer hover:text-white"
          >
            <span className="flex items-center gap-1.5">
              <Sparkles size={13} style={{ color: "var(--color-primary-accent)" }} />
              {t("app.featuresTitle")}
            </span>
            {showFeatures ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
          </button>
          {showFeatures && (
            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {features.map((feat, idx) => (
                <div key={idx} className="flex items-start gap-2.5 text-slate-300">
                  <CheckCircle2 size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                  <span>{feat}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bundled Offline Changelog */}
        <div ref={changelogSectionRef} className="space-y-1.5">
          <button
            type="button"
            onClick={handleToggleChangelog}
            className="w-full flex items-center justify-between text-xs font-semibold text-slate-100 uppercase tracking-wider font-mono py-1 cursor-pointer hover:text-white"
          >
            <span className="flex items-center gap-1.5">
              <FileClock size={13} style={{ color: "var(--color-primary-accent)" }} />
              {t("app.changelogTitle")}
            </span>
            {showChangelog ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
          </button>
          {showChangelog && (
            <div
              className="p-3.5 rounded-xl bg-slate-900/50 border border-slate-800/70 max-h-64 overflow-y-auto scrollbar-thin text-xs text-slate-300 space-y-2 markdown-zoom-container"
              dangerouslySetInnerHTML={{ __html: changelogHtml }}
            />
          )}
        </div>

        {/* Open Source & Third-Party Licenses */}
        <div ref={licensesSectionRef} className="space-y-1.5">
          <button
            type="button"
            onClick={handleToggleLicenses}
            className="w-full flex items-center justify-between text-xs font-semibold text-slate-100 uppercase tracking-wider font-mono py-1 cursor-pointer hover:text-white"
          >
            <span className="flex items-center gap-1.5">
              <Scale size={13} style={{ color: "var(--color-primary-accent)" }} />
              {t("app.openSourceTitle")}
            </span>
            {showLicenses ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
          </button>
          {showLicenses && (
            <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800/70 space-y-1.5 text-[11px]">
              <p className="text-slate-400 pb-1.5 border-b border-slate-800/80">
                {t("app.openSourceDesc")}
              </p>
              <div className="divide-y divide-slate-800/50">
                {OPEN_SOURCE_CREDITS.map((item) => (
                  <div key={item.name} className="py-1.5 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => openWebsite(item.url)}
                      className="text-slate-300 hover:text-white text-left truncate cursor-pointer hover:underline"
                    >
                      {item.name}
                    </button>
                    <span
                      className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-950/70 border border-slate-800 shrink-0"
                      style={{ color: "var(--color-primary-accent)" }}
                    >
                      {item.license}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Development Note */}
        <div className="space-y-1.5">
          <h3 className="text-xs font-semibold text-slate-100 flex items-center gap-1.5 uppercase tracking-wider font-mono">
            <Info size={13} className="text-sky-400" />
            {t("app.noteTitle")}
          </h3>
          <div className="p-3.5 rounded-xl bg-slate-900/40 border border-slate-800/60 text-slate-300 text-[12px]">
            {t("app.noteDesc")}
          </div>
        </div>
      </div>

      {/* Footer with Copyright & Close button */}
      <div className="px-5 sm:px-6 py-3 bg-[#0e1626]/90 border-t border-slate-800/80 flex items-center justify-between gap-2.5 flex-wrap shrink-0">
        <div className="text-[11px] text-slate-400 font-mono truncate">
          <span>{t("app.copyright")}</span>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-auto">
          <Button
            type="primary"
            onClick={onClose}
            className="text-white font-medium text-xs px-4 h-8 rounded-lg border-none cursor-pointer shrink-0"
          >
            {t("tabs.close")}
          </Button>
        </div>
      </div>
    </div>
  );
};

export const AboutWindowApp: React.FC = () => {
  const accentTheme = useFileStore((s) => s.accentTheme);
  const { t } = useTranslation();

  const handleClose = () => {
    invokeTauriSafe("close_current_window");
  };

  useEffect(() => {
    const title = t("app.aboutTitle");
    document.title = title;
    invokeTauriSafe("set_window_title", { title });
  }, [t]);

  useEffect(() => {
    let disposed = false;
    let unlistenTheme: (() => void) | null = null;
    let unlistenLang: (() => void) | null = null;

    const setupListeners = async () => {
      const u1 = await listenTauri<any>("fileditor-accent-theme-changed", (payload) => {
        if (payload) {
          useFileStore.getState().setAccentTheme(payload);
        }
      });
      if (u1) {
        if (disposed) u1();
        else unlistenTheme = u1;
      }

      const u2 = await listenTauri<string>("fileditor-language-changed", (payload) => {
        if (typeof payload === "string") {
          useI18nStore.getState().setLanguage(payload);
        }
      });
      if (u2) {
        if (disposed) u2();
        else unlistenLang = u2;
      }
    };
    setupListeners();

    const handleStorage = (e: StorageEvent) => {
      if (e.key === "fileditor_accent_theme" && e.newValue) {
        try {
          useFileStore.getState().setAccentTheme(JSON.parse(e.newValue));
        } catch {}
      }
      if (e.key === "fileditor_language" && e.newValue) {
        useI18nStore.getState().setLanguage(e.newValue);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      disposed = true;
      if (unlistenTheme) unlistenTheme();
      if (unlistenLang) unlistenLang();
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: accentTheme.primaryAccent,
          fontFamily: "Plus Jakarta Sans, sans-serif",
          borderRadius: 6
        }
      }}
    >
      <div className="h-screen w-screen overflow-hidden bg-[#0b101b]">
        <AboutContent onClose={handleClose} showHeaderCloseButton={false} />
      </div>
    </ConfigProvider>
  );
};

interface AboutModalProps {
  open: boolean;
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ open, onClose }) => {
  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      centered
      closable={false}
      width={560}
      style={{ maxWidth: "94vw" }}
      styles={{
        content: {
          padding: 0,
          borderRadius: "14px",
          overflow: "hidden",
          backgroundColor: "#0b101b",
          border: "1px solid rgba(51, 65, 85, 0.6)",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)",
          height: 560,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column"
        },
        body: {
          padding: 0,
          flex: "1 1 0%",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden"
        }
      }}
    >
      <AboutContent onClose={onClose} showHeaderCloseButton={true} />
    </Modal>
  );
};
