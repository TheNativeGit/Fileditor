import React, { useState } from "react";
import { Popover, Button, Input, Select, message } from "antd";
import { Link as LinkIcon, FolderOpen, Check } from "lucide-react";
import { useFileStore } from "../store/useFileStore";
import { useTranslation } from "../i18n";
import { invokeTauriSafe } from "../utils/tauriBridge";

/**
 * Computes the default display label according to v0.12.0 rules:
 * - Web URL: Domain without "www." (e.g. https://www.google.com/web/test -> google.com)
 * - File: Filename without the last file extension (e.g. C:/Testdatei.mit.Punkt.txt -> Testdatei.mit.Punkt)
 */
export const computeDefaultLinkLabel = (target: string, isUrl: boolean): string => {
  if (!target || !target.trim()) return "";
  const trimmed = target.trim();
  const isWeb = isUrl || trimmed.toLowerCase().startsWith("http://") || trimmed.toLowerCase().startsWith("https://");
  if (isWeb) {
    try {
      const urlStr = trimmed.startsWith("http://") || trimmed.startsWith("https://") ? trimmed : "https://" + trimmed;
      const parsed = new URL(urlStr);
      return parsed.hostname.replace(/^www\./i, "");
    } catch {
      return trimmed.replace(/^https?:\/\//i, "").split("/")[0].replace(/^www\./i, "");
    }
  } else {
    const clean = trimmed.replace(/\\/g, "/");
    const base = clean.split("/").pop() || trimmed;
    const lastDot = base.lastIndexOf(".");
    if (lastDot > 0) {
      return base.substring(0, lastDot);
    }
    return base;
  }
};

interface LinkInsertPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInsertLink: (text: string, urlOrPath: string) => void;
  initialDisplayText?: string;
  initialTarget?: string;
  children: React.ReactNode;
}

export const LinkInsertPopover: React.FC<LinkInsertPopoverProps> = ({
  open,
  onOpenChange,
  onInsertLink,
  initialDisplayText,
  initialTarget,
  children
}) => {
  const { t } = useTranslation();
  const { jsonTabs } = useFileStore();
  const [linkType, setLinkType] = useState<"url" | "openTab" | "explorer">("openTab");
  const [displayText, setDisplayText] = useState("");
  const [urlText, setUrlText] = useState("");
  const [selectedTabId, setSelectedTabId] = useState<string | null>(null);
  const [chosenExplorerPath, setChosenExplorerPath] = useState("");

  React.useEffect(() => {
    if (open) {
      if (initialDisplayText !== undefined && initialDisplayText !== null) {
        setDisplayText(initialDisplayText);
      }
      if (initialTarget) {
        const isWeb = initialTarget.toLowerCase().startsWith("http://") || initialTarget.toLowerCase().startsWith("https://");
        if (isWeb) {
          setLinkType("url");
          setUrlText(initialTarget);
          if (!initialDisplayText) {
            setDisplayText(computeDefaultLinkLabel(initialTarget, true));
          }
        } else {
          setLinkType("explorer");
          setChosenExplorerPath(initialTarget);
          if (!initialDisplayText) {
            setDisplayText(computeDefaultLinkLabel(initialTarget, false));
          }
        }
      }
    }
  }, [open, initialDisplayText, initialTarget]);

  // Support pasting anywhere inside popover
  const handleContainerPaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData("text")?.trim();
    if (!pasted) return;

    const isWeb = pasted.toLowerCase().startsWith("http://") || pasted.toLowerCase().startsWith("https://");
    if (isWeb) {
      setLinkType("url");
      setUrlText(pasted);
      if (!displayText.trim()) {
        setDisplayText(computeDefaultLinkLabel(pasted, true));
      }
    } else if (/[\\/]/.test(pasted) || /^[a-zA-Z]:/i.test(pasted)) {
      setLinkType("explorer");
      const normalized = pasted.replace(/\\/g, "/");
      setChosenExplorerPath(normalized);
      if (!displayText.trim()) {
        setDisplayText(computeDefaultLinkLabel(normalized, false));
      }
    }
  };

  const handleBrowseExplorer = async () => {
    const selectedPath = await invokeTauriSafe<string | null>("open_file_dialog", {
      title: t("linkPopover.browseDialogTitle"),
      filterName: t("linkPopover.allFiles"),
      filterExt: ""
    });

    if (selectedPath) {
      const normalized = selectedPath.replace(/\\/g, "/");
      setChosenExplorerPath(normalized);
      if (!displayText.trim()) {
        setDisplayText(computeDefaultLinkLabel(normalized, false));
      }
    }
  };

  const handleTabSelectChange = (tabId: string) => {
    setSelectedTabId(tabId);
    const tab = jsonTabs.find(t => t.id === tabId);
    if (tab && !displayText.trim()) {
      setDisplayText(computeDefaultLinkLabel(tab.path || tab.title, false));
    }
  };

  const handleSubmit = () => {
    let finalPath = "";
    let isWeb = false;

    if (linkType === "url") {
      finalPath = urlText.trim();
      isWeb = true;
    } else if (linkType === "openTab") {
      const tab = jsonTabs.find(t => t.id === selectedTabId);
      finalPath = tab ? (tab.path || tab.title) : "";
      isWeb = false;
    } else if (linkType === "explorer") {
      finalPath = chosenExplorerPath.trim().replace(/\\/g, "/");
      isWeb = false;
    }

    if (!finalPath) {
      message.warning(t("linkPopover.selectTargetWarning"));
      return;
    }

    const label = displayText.trim() || computeDefaultLinkLabel(finalPath, isWeb);
    onInsertLink(label, finalPath);

    // Reset fields
    setDisplayText("");
    setUrlText("");
    setSelectedTabId(null);
    setChosenExplorerPath("");
    onOpenChange(false);
  };

  const activeLinkTypeStyle: React.CSSProperties = {
    backgroundColor: "rgba(var(--color-primary-accent-rgb), 0.18)",
    color: "var(--color-primary-accent)",
    borderColor: "rgba(var(--color-primary-accent-rgb), 0.45)"
  };

  const popoverContent = (
    <div onPaste={handleContainerPaste} className="space-y-3 p-1 w-72 font-sans select-none text-xs">
      <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
        <span className="font-bold text-white flex items-center gap-1.5">
          <LinkIcon size={13} style={{ color: "var(--color-primary-accent)" }} /> {t("linkPopover.title")}
        </span>
      </div>

      {/* Link Type Selector */}
      <div className="grid grid-cols-3 gap-1 p-0.5 bg-[#090d16] rounded border border-slate-800">
        <button
          type="button"
          onClick={() => setLinkType("openTab")}
          className={`py-1 text-[11px] font-mono rounded transition-colors text-center ${
            linkType === "openTab" ? "font-bold border" : "text-slate-400 hover:text-slate-200"
          }`}
          style={linkType === "openTab" ? activeLinkTypeStyle : undefined}
        >
          📄 {t("linkPopover.tabOpen")}
        </button>
        <button
          type="button"
          onClick={() => setLinkType("explorer")}
          className={`py-1 text-[11px] font-mono rounded transition-colors text-center ${
            linkType === "explorer" ? "font-bold border" : "text-slate-400 hover:text-slate-200"
          }`}
          style={linkType === "explorer" ? activeLinkTypeStyle : undefined}
        >
          📁 {t("linkPopover.tabExplorer")}
        </button>
        <button
          type="button"
          onClick={() => setLinkType("url")}
          className={`py-1 text-[11px] font-mono rounded transition-colors text-center ${
            linkType === "url" ? "font-bold border" : "text-slate-400 hover:text-slate-200"
          }`}
          style={linkType === "url" ? activeLinkTypeStyle : undefined}
        >
          🌐 {t("linkPopover.tabUrl")}
        </button>
      </div>

      {/* Display Text Input */}
      <div>
        <label className="text-[10px] text-slate-400 font-mono block mb-1">{t("linkPopover.displayLabel")}</label>
        <Input
          size="small"
          placeholder={t("linkPopover.displayPlaceholder")}
          value={displayText}
          onChange={(e) => setDisplayText(e.target.value)}
          onPressEnter={handleSubmit}
          className="bg-[#090d16] text-xs text-white border-slate-700"
        />
      </div>

      {/* Target Content Selection */}
      {linkType === "openTab" && (
        <div>
          <label className="text-[10px] text-slate-400 font-mono block mb-1">{t("linkPopover.selectOpenTab")}</label>
          <Select
            size="small"
            placeholder={t("linkPopover.selectPlaceholder")}
            value={selectedTabId}
            onChange={handleTabSelectChange}
            className="w-full text-xs font-mono"
            options={jsonTabs.map(tabItem => ({
              value: tabItem.id,
              label: `${tabItem.title} (${tabItem.type || "json"})`
            }))}
          />
        </div>
      )}

      {linkType === "explorer" && (
        <div className="space-y-1.5">
          <label className="text-[10px] text-slate-400 font-mono block">{t("linkPopover.explorerLabel")}</label>
          <div className="flex items-center space-x-1.5">
            <Input
              size="small"
              placeholder={t("linkPopover.explorerPlaceholder")}
              value={chosenExplorerPath}
              onChange={(e) => {
                const val = e.target.value;
                setChosenExplorerPath(val);
                if (!displayText.trim() && val) {
                  setDisplayText(computeDefaultLinkLabel(val, false));
                }
              }}
              onPressEnter={handleSubmit}
              className="bg-[#090d16] text-xs font-mono border-slate-700 flex-1 truncate"
              style={{ color: "var(--color-primary-accent)" }}
            />
            <Button
              size="small"
              icon={<FolderOpen size={13} />}
              onClick={handleBrowseExplorer}
              className="bg-slate-800 hover:bg-slate-700 text-white text-xs shrink-0"
            >
              {t("linkPopover.browse")}
            </Button>
          </div>
        </div>
      )}

      {linkType === "url" && (
        <div>
          <label className="text-[10px] text-slate-400 font-mono block mb-1">{t("linkPopover.urlLabel")}</label>
          <Input
            size="small"
            placeholder={t("linkPopover.urlPlaceholder")}
            value={urlText}
            onChange={(e) => {
              const val = e.target.value;
              setUrlText(val);
              if (!displayText.trim() && val) {
                setDisplayText(computeDefaultLinkLabel(val, true));
              }
            }}
            onPressEnter={handleSubmit}
            className="bg-[#090d16] text-xs text-white border-slate-700"
          />
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-end space-x-1.5 pt-2 border-t border-slate-800">
        <Button size="small" onClick={() => onOpenChange(false)} className="text-xs">
          {t("common.cancel")}
        </Button>
        <Button type="primary" size="small" onClick={handleSubmit} icon={<Check size={12} />} className="text-xs">
          {t("linkPopover.insertBtn")}
        </Button>
      </div>
    </div>
  );

  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
      trigger="click"
      content={popoverContent}
      placement="bottom"
    >
      {children}
    </Popover>
  );
};
