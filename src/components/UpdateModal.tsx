import React, { useEffect, useState } from "react";
import { Modal, Button, Checkbox, Progress, message } from "antd";
import { Download, CheckCircle2, Sparkles, X, RefreshCw, EyeOff, ExternalLink } from "lucide-react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { APP_VERSION } from "../version";
import { useTranslation } from "../i18n";
import { useFileStore } from "../store/useFileStore";
import { renderMarkdownToHtml } from "../utils/markdownParser";
import { invokeTauriSafe, isTauriEnv } from "../utils/tauriBridge";
import { logger } from "../utils/logger";

export const SKIPPED_UPDATE_VERSION_KEY = "fileditor_skipped_update_version";
const GITHUB_RELEASES_URL = "https://github.com/TheNativeGit/Fileditor/releases";

interface UpdateModalProps {
  open: boolean;
  manualTrigger: boolean;
  onClose: () => void;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({
  open,
  manualTrigger,
  onClose
}) => {
  const { t } = useTranslation();
  const { autoCheckUpdates, setAutoCheckUpdates } = useFileStore();

  const [status, setStatus] = useState<"idle" | "checking" | "available" | "uptodate" | "downloading" | "error">("idle");
  const [updateObj, setUpdateObj] = useState<Update | null>(null);
  const [downloadPercent, setDownloadPercent] = useState<number>(0);
  const [errorDetail, setErrorDetail] = useState<string>("");

  const performCheck = async (isManual: boolean) => {
    if (!isTauriEnv()) {
      setStatus("uptodate");
      return;
    }

    setStatus("checking");
    setErrorDetail("");
    setUpdateObj(null);

    try {
      const update = await check();
      if (update && update.available) {
        const skippedVer = localStorage.getItem(SKIPPED_UPDATE_VERSION_KEY);
        if (!isManual && skippedVer === update.version) {
          logger.info("Updater", `Skipping notification for ignored version v${update.version}`);
          setStatus("idle");
          onClose();
          return;
        }
        setUpdateObj(update);
        setStatus("available");
      } else {
        if (isManual) {
          setStatus("uptodate");
        } else {
          setStatus("idle");
          onClose();
        }
      }
    } catch (err: any) {
      const rawMsg = String(err?.message || err || "");
      logger.warn("Updater", `Update check error: ${rawMsg}`);
      // Before first public GitHub release exists (404 / no release JSON yet), treat cleanly as up-to-date
      if (/404|not found|could not fetch a valid release|release json/i.test(rawMsg)) {
        if (isManual) {
          setStatus("uptodate");
        } else {
          setStatus("idle");
          onClose();
        }
      } else if (isManual) {
        setErrorDetail(rawMsg);
        setStatus("error");
      } else {
        setStatus("idle");
        onClose();
      }
    }
  };

  useEffect(() => {
    if (open) {
      performCheck(manualTrigger);
    }
  }, [open, manualTrigger]);

  const handleInstallUpdate = async () => {
    if (!updateObj) return;
    setStatus("downloading");
    setDownloadPercent(0);

    let downloadedBytes = 0;
    let totalBytes = 0;

    try {
      await updateObj.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            totalBytes = event.data.contentLength || 0;
            setDownloadPercent(2);
            break;
          case "Progress":
            downloadedBytes += event.data.chunkLength;
            if (totalBytes > 0) {
              const pct = Math.min(99, Math.round((downloadedBytes / totalBytes) * 100));
              setDownloadPercent(pct);
            }
            break;
          case "Finished":
            setDownloadPercent(100);
            break;
        }
      });

      message.success(t("updater.installSuccess"));
      await relaunch();
    } catch (err: any) {
      logger.error("Updater", `Failed to download/install update: ${err?.message || err}`);
      setErrorDetail(String(err?.message || err || ""));
      setStatus("error");
    }
  };

  const handleIgnoreVersion = () => {
    if (updateObj?.version) {
      localStorage.setItem(SKIPPED_UPDATE_VERSION_KEY, updateObj.version);
      message.info(t("updater.versionIgnored", { version: updateObj.version }));
    }
    onClose();
  };

  const openReleasesPage = () => {
    invokeTauriSafe("open_external_url", { url: GITHUB_RELEASES_URL });
  };

  const releaseNotesHtml = updateObj?.body
    ? renderMarkdownToHtml(updateObj.body)
    : "";

  const shouldShowModal = open && (manualTrigger || status === "available" || status === "downloading");

  return (
    <Modal
      open={shouldShowModal}
      onCancel={status === "downloading" ? undefined : onClose}
      footer={null}
      centered
      closable={false}
      width={580}
      style={{ maxWidth: "94vw" }}
      styles={{
        content: {
          padding: 0,
          borderRadius: "14px",
          overflow: "hidden",
          backgroundColor: "#0b101b",
          border: "1px solid rgba(51, 65, 85, 0.65)",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.75)"
        },
        body: { padding: 0 }
      }}
    >
      <div className="flex flex-col text-slate-200 max-h-[82vh]">
        {/* Header */}
        <div className="relative px-6 py-4 bg-gradient-to-b from-[#141c2e] to-[#0b101b] border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/Logo.png" alt="Fileditor" className="w-9 h-9 object-contain select-none" />
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
                <span>{t("updater.title")}</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-slate-700 bg-slate-900 text-slate-300">
                  v{APP_VERSION}
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">{t("updater.subtitle")}</p>
            </div>
          </div>

          {status !== "downloading" && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors cursor-pointer"
              title={t("tabs.close")}
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 overflow-y-auto scrollbar-thin flex-1 min-h-0">
          {status === "checking" && (
            <div className="py-10 flex flex-col items-center justify-center space-y-3 text-slate-300">
              <RefreshCw size={28} className="animate-spin" style={{ color: "var(--color-primary-accent)" }} />
              <span className="text-xs font-mono">{t("updater.checking")}</span>
            </div>
          )}

          {status === "uptodate" && (
            <div className="py-8 flex flex-col items-center justify-center space-y-3 text-center">
              <CheckCircle2 size={36} className="text-emerald-400" />
              <div className="text-sm font-bold text-white">{t("updater.upToDateTitle")}</div>
              <div className="text-xs text-slate-400 max-w-sm">
                {t("updater.upToDateDesc", { version: APP_VERSION })}
              </div>
              <button
                type="button"
                onClick={openReleasesPage}
                className="mt-1 inline-flex items-center gap-1.5 text-xs font-mono text-slate-400 hover:text-white cursor-pointer underline underline-offset-2"
              >
                <span>GitHub Releases</span>
                <ExternalLink size={11} />
              </button>
            </div>
          )}

          {status === "error" && (
            <div className="py-6 flex flex-col items-center justify-center space-y-3 text-center">
              <div className="text-sm font-bold text-rose-400">{t("updater.errorTitle")}</div>
              <p className="text-xs text-slate-400 max-w-md">{t("updater.errorDesc")}</p>
              {errorDetail && (
                <div className="text-[10px] font-mono text-slate-500 bg-slate-950/70 border border-slate-800 px-3 py-1.5 rounded max-w-full truncate">
                  {errorDetail}
                </div>
              )}
              <div className="flex items-center gap-2 pt-2">
                <Button size="small" icon={<RefreshCw size={12} />} onClick={() => performCheck(true)} className="text-xs">
                  {t("updater.retry")}
                </Button>
                <Button size="small" icon={<ExternalLink size={12} />} onClick={openReleasesPage} className="text-xs">
                  GitHub Releases
                </Button>
              </div>
            </div>
          )}

          {(status === "available" || status === "downloading") && updateObj && (
            <div className="space-y-4">
              <div
                className="p-3.5 rounded-xl border flex items-center justify-between gap-3"
                style={{
                  backgroundColor: "rgba(var(--color-primary-accent-rgb), 0.1)",
                  borderColor: "rgba(var(--color-primary-accent-rgb), 0.35)"
                }}
              >
                <div className="flex items-center gap-2.5">
                  <Sparkles size={18} style={{ color: "var(--color-primary-accent)" }} className="shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-white">
                      {t("updater.newVersionAvailable", { version: updateObj.version })}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      v{APP_VERSION} → v{updateObj.version}
                    </div>
                  </div>
                </div>
              </div>

              {releaseNotesHtml ? (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-mono uppercase tracking-wider font-semibold text-slate-400">
                    {t("updater.changelogHeader")}
                  </div>
                  <div
                    className="p-4 rounded-xl bg-[#090d16] border border-slate-800/90 max-h-60 overflow-y-auto scrollbar-thin text-xs text-slate-300 space-y-2 markdown-zoom-container"
                    dangerouslySetInnerHTML={{ __html: releaseNotesHtml }}
                  />
                </div>
              ) : (
                <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800 text-xs text-slate-400 italic">
                  {t("updater.noReleaseNotes")}
                </div>
              )}

              {status === "downloading" && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-xs font-mono text-slate-300">
                    <span>{t("updater.downloading")}</span>
                    <span>{downloadPercent}%</span>
                  </div>
                  <Progress
                    percent={downloadPercent}
                    showInfo={false}
                    strokeColor="var(--color-primary-accent)"
                    trailColor="#1e293b"
                    size="small"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer with reminder checkbox & actions */}
        <div className="px-6 py-3.5 bg-[#0e1626]/95 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <Checkbox
            checked={autoCheckUpdates}
            disabled={status === "downloading"}
            onChange={(e) => setAutoCheckUpdates(e.target.checked)}
            className="text-[11px] text-slate-400 select-none"
          >
            <span className="text-[11px] text-slate-400">{t("updater.autoCheckLabel")}</span>
          </Checkbox>

          <div className="flex items-center justify-end gap-2 shrink-0 flex-wrap">
            {status === "available" && updateObj && (
              <>
                <Button
                  size="small"
                  icon={<EyeOff size={12} />}
                  onClick={handleIgnoreVersion}
                  className="bg-transparent border-slate-700 text-slate-400 hover:text-white text-xs h-8 px-3 rounded-lg"
                >
                  {t("updater.ignoreVersion")}
                </Button>
                <Button
                  size="small"
                  onClick={onClose}
                  className="bg-transparent border-slate-700 text-slate-300 hover:text-white text-xs h-8 px-3 rounded-lg"
                >
                  {t("updater.remindLater")}
                </Button>
                <Button
                  type="primary"
                  size="small"
                  icon={<Download size={13} />}
                  onClick={handleInstallUpdate}
                  className="border-none text-white font-semibold text-xs h-8 px-4 rounded-lg"
                >
                  {t("updater.installNow")}
                </Button>
              </>
            )}

            {(status === "uptodate" || status === "error" || status === "checking") && (
              <Button
                type="primary"
                size="small"
                onClick={onClose}
                className="border-none text-white font-medium text-xs h-8 px-4 rounded-lg"
              >
                {t("tabs.close")}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};
