import React, { useState } from "react";
import { Segmented, Button, message, Tooltip, Dropdown } from "antd";
import { FilePdfOutlined } from "@ant-design/icons";
import { 
  Plus,
  FolderOpen, 
  Save, 
  Copy, 
  Undo2, 
  Redo2, 
  Settings, 
  FileText,
  Braces,
  Code2,
  CheckSquare,
  Check,
  RefreshCw,
  Printer,
  Info
} from "lucide-react";
import { useFileStore } from "../store/useFileStore";
import { useToDoStore } from "../store/useToDoStore";
import { renderMarkdownForPrint } from "../utils/markdownParser";
import { SettingsModal } from "./SettingsModal";
import { AboutModal } from "./AboutModal";
import { UpdateModal } from "./UpdateModal";
import { ClickableTooltip } from "./ClickableTooltip";
import { useTranslation } from "../i18n";
import { closeCurrentNativeWindow, invokeTauriSafe, isTauriEnv } from "../utils/tauriBridge";
import { APP_VERSION } from "../version";

export const TopControlBar: React.FC = () => {
  const { t } = useTranslation();
  const {
    mode,
    jsonString,
    history,
    historyIndex,
    viewMode,
    setViewMode,
    undo,
    redo,
    jsonTabs,
    activeJsonTabId,
    addJsonTab,
    openJsonFile,
    saveJsonTab,
    saveAll,
    recentJsonFiles,
    discardedBackups,
    restoreDiscardedBackup,
    clearDiscardedBackups,
    enabledFileTypes,
    txtEncoding,
    setTxtEncoding
  } = useFileStore();

  const [messageApi, contextHolder] = message.useMessage();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isUpdateOpen, setIsUpdateOpen] = useState(false);
  const [newFileDropdownOpen, setNewFileDropdownOpen] = useState(false);
  const [pdfTooltipOpen, setPdfTooltipOpen] = useState(false);
  const [copyAnimationState, setCopyAnimationState] = useState<"idle" | "copy" | "check">("idle");
  const onlyTxt = !enabledFileTypes.xml && !enabledFileTypes.json && !enabledFileTypes.markdown && !enabledFileTypes.todo;

  const todoHistoryIndex = useToDoStore((s) => s.historyIndex);
  const todoHistoryLength = useToDoStore((s) => s.history.length);
  const canUndo = mode === "todo" ? todoHistoryIndex > 0 : historyIndex > 0;
  const canRedo = mode === "todo" ? todoHistoryIndex < todoHistoryLength - 1 : historyIndex < history.length - 1;

  // Document copying helper with icon animation & Win32 native clipboard
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonString);
      invokeTauriSafe("native_write_clipboard", { text: jsonString });

      setCopyAnimationState("copy");
      setTimeout(() => {
        setCopyAnimationState("check");
        setTimeout(() => {
          setCopyAnimationState("idle");
        }, 750);
      }, 250);
    } catch (err) {
      setCopyAnimationState("idle");
    }
  };

  const handlePrintOrExportPdf = (_isExportPdf: boolean) => {
    (document.activeElement as HTMLElement)?.blur();
    setPdfTooltipOpen(false);

    const html = renderMarkdownForPrint(jsonString);
    if (!html.trim()) {
      messageApi.open({
        type: "warning",
        content: t("menu.noMarkdownToPrint")
      });
      return;
    }

    const printRoot = document.getElementById("print-root");
    if (!printRoot) {
      return;
    }

    const activeTab = jsonTabs.find(t => t.id === activeJsonTabId);
    let pdfFilename = activeTab ? activeTab.title : "Document";
    pdfFilename = pdfFilename.replace(/\.(md|markdown|json|xml|txt|todo)$/i, "");

    const oldTitle = document.title;
    document.title = pdfFilename;

    printRoot.className = "print-light";
    printRoot.innerHTML = `
      <div class="print-page-footer"></div>
      <div class="print-content">
        ${html}
      </div>
    `;

    const cleanup = () => {
      printRoot.innerHTML = "";
      printRoot.className = "";
      document.title = oldTitle;
      window.removeEventListener("afterprint", cleanup);
    };

    window.addEventListener("afterprint", cleanup);

    setTimeout(() => {
      window.print();
    }, 120);
  };

  const handleOpenJsonFile = async () => {
    const selectedPath = await invokeTauriSafe<string | null>("open_file_dialog", {
      title: t("menu.open"),
      filterName: t("menu.supportedFilesFilter"),
      filterExt: "json;xml;xsd;dtd;rng;sch;md;markdown;todo;txt;log;text"
    });
    if (selectedPath) {
      openJsonFile(selectedPath);
    }
  };

  const openSettingsDialog = async () => {
    if (isTauriEnv()) {
      await invokeTauriSafe("open_settings_window", { title: t("settings.title") });
    } else {
      setIsSettingsOpen(true);
    }
  };

  const openAboutDialog = async () => {
    if (isTauriEnv()) {
      await invokeTauriSafe("open_about_window", { title: t("app.aboutTitle") });
    } else {
      setIsAboutOpen(true);
    }
  };

  const openUpdateDialog = async () => {
    if (isTauriEnv()) {
      await invokeTauriSafe("open_updater_window", { title: t("updater.title") });
    } else {
      setIsUpdateOpen(true);
    }
  };

  const handleMenuClick = async (menu: string, key: string) => {
    if (menu === "file") {
      if (key === "new") {
        addJsonTab(null, "", mode);
      } else if (key === "new-json") {
        addJsonTab(null, "", "json");
      } else if (key === "new-xml") {
        addJsonTab(null, "", "xml");
      } else if (key === "new-txt") {
        addJsonTab(null, "", "txt");
      } else if (key === "new-markdown") {
        addJsonTab(null, "", "markdown");
      } else if (key === "new-todo") {
        addJsonTab(null, "", "todo");
      } else if (key.startsWith("recent-")) {
        const idx = parseInt(key.split("-")[1], 10);
        const path = recentJsonFiles[idx];
        if (path) {
          openJsonFile(path);
        }
      } else if (key.startsWith("restore-")) {
        const backupId = key.replace("restore-", "");
        restoreDiscardedBackup(backupId);
      } else if (key === "restore-clear-all") {
        clearDiscardedBackups();
        message.success(t("menu.clearRestoreSuccess"));
      } else if (key === "open") {
        handleOpenJsonFile();
      } else if (key === "save" && activeJsonTabId) {
        saveJsonTab(activeJsonTabId);
      } else if (key === "saveAs" && activeJsonTabId) {
        saveJsonTab(activeJsonTabId, null, true);
      } else if (key === "saveAll") {
        const success = await saveAll();
        if (success) {
          message.success(t("menu.saveAllSuccess"));
        }
      } else if (key === "print") {
        handlePrintOrExportPdf(false);
      } else if (key === "export-pdf") {
        handlePrintOrExportPdf(true);
      } else if (key === "exit") {
        await closeCurrentNativeWindow();
      }
    } else if (menu === "encoding") {
      if (key === "utf8" || key === "utf8bom" || key === "ansi") {
        setTxtEncoding(key);
        const encLabel = key === "utf8bom" ? "UTF-8-BOM" : key.toUpperCase();
        message.info(t("menu.encodingChanged", { encoding: encLabel }));
      }
    } else if (menu === "settings") {
      if (key === "settings") {
        openSettingsDialog();
      }
    } else if (menu === "help") {
      if (key === "check-updates") {
        openUpdateDialog();
      } else if (key === "info") {
        openAboutDialog();
      }
    }
  };

  const recentItems = recentJsonFiles.length > 0 
    ? [
        { type: "divider" as const },
        { 
          key: "recent-header", 
          label: <span className="text-[10px] uppercase font-mono tracking-wider font-semibold text-slate-500 disabled">{t("menu.recentlyOpened")}</span>,
          disabled: true 
        },
        ...recentJsonFiles.map((path, idx) => ({
          key: `recent-${idx}`,
          label: <span className="text-xs font-mono max-w-xs truncate block" title={path}>{path}</span>
        }))
      ]
    : [];

  const restoreMenuSubitem = {
    key: "restore-parent",
    popupClassName: "restore-dropdown-submenu",
    label: (
      <span className="text-xs font-mono text-amber-400 flex items-center justify-between gap-3">
        <span>{t("menu.restore")}</span>
        {discardedBackups.length > 0 && (
          <span className="px-1.5 py-0.2 bg-amber-950/80 border border-amber-800/60 text-amber-300 rounded text-[9.5px]">
            {discardedBackups.length}
          </span>
        )}
      </span>
    ),
    disabled: discardedBackups.length === 0,
    children: discardedBackups.length > 0
      ? [
          ...discardedBackups.map((backup) => ({
            key: `restore-${backup.backupId}`,
            label: (
              <div className="flex flex-col text-xs font-mono py-0.5 min-w-[170px]">
                <span className="font-semibold text-amber-300">[{t("menu.restoreCopyPrefix")}] {backup.title}</span>
                <span className="text-[10px] text-slate-400">
                  {new Date(backup.discardedAt).toLocaleDateString()} {new Date(backup.discardedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({backup.type.toUpperCase()})
                </span>
              </div>
            )
          })),
          { type: "divider" as const },
          {
            key: "restore-clear-all",
            label: <span className="text-xs text-rose-400 font-mono">{t("settings.clearRestoreHistory")}</span>
          }
        ]
      : [{ key: "restore-none", label: <span className="text-xs font-mono text-slate-500">{t("menu.noDiscardedFiles")}</span>, disabled: true }]
  };

  const fileMenuItems = [
    {
      key: "new",
      label: <span className="text-xs font-mono">{t("menu.new")}</span>,
      children: [
        enabledFileTypes.txt && { key: "new-txt", label: <span className="text-xs font-mono">{t("menu.newTxt")}</span> },
        enabledFileTypes.markdown && { key: "new-markdown", label: <span className="text-xs font-mono">{t("menu.newMd")}</span> },
        enabledFileTypes.json && { key: "new-json", label: <span className="text-xs font-mono">{t("menu.newJson")}</span> },
        enabledFileTypes.xml && { key: "new-xml", label: <span className="text-xs font-mono">{t("menu.newXml")}</span> },
        enabledFileTypes.todo && { key: "new-todo", label: <span className="text-xs font-mono text-emerald-400">{t("menu.newTodo")}</span> }
      ].filter(Boolean) as any
    },
    { key: "open", label: <span className="text-xs font-mono">{t("menu.open")}</span> },
    { key: "save", label: <span className="text-xs font-mono">{t("menu.save")}</span>, disabled: !activeJsonTabId },
    { key: "saveAs", label: <span className="text-xs font-mono">{t("menu.saveAs")}</span>, disabled: !activeJsonTabId },
    { key: "saveAll", label: <span className="text-xs font-mono">{t("menu.saveAll")}</span> },
    { type: "divider" as const },
    restoreMenuSubitem,
    { type: "divider" as const },
    {
      key: "print",
      label: (
        <div className="flex items-center justify-between text-xs font-mono w-44">
          <span className="flex items-center gap-1.5">
            <Printer size={13} className="text-slate-400" />
            <span>{t("menu.print")}</span>
          </span>
          <span className="text-[10px] text-slate-500 font-sans">Ctrl+P</span>
        </div>
      ),
      disabled: !activeJsonTabId || mode !== "markdown"
    },
    {
      key: "export-pdf",
      label: (
        <div className="flex items-center gap-1.5 text-xs font-mono" style={{ color: "var(--color-primary-accent)" }}>
          <FilePdfOutlined />
          <span>{t("menu.exportPdf")}</span>
        </div>
      ),
      disabled: !activeJsonTabId || mode !== "markdown"
    },
    ...recentItems,
    { type: "divider" as const },
    { key: "exit", label: <span className="text-xs font-mono text-rose-400">{t("menu.close")}</span> }
  ];

  const encodingMenuItems = [
    { key: "utf8", label: <span className="text-xs font-mono">{txtEncoding === "utf8" ? "✓ " : "  "}UTF-8</span> },
    { key: "utf8bom", label: <span className="text-xs font-mono">{txtEncoding === "utf8bom" ? "✓ " : "  "}UTF-8-BOM</span> },
    { key: "ansi", label: <span className="text-xs font-mono">{txtEncoding === "ansi" ? "✓ " : "  "}ANSI</span> }
  ];

  const settingsMenuItems = [
    { key: "settings", label: <span className="text-xs font-mono">{t("menu.settings")}...</span> }
  ];

  const helpMenuItems = [
    {
      key: "check-updates",
      label: (
        <span className="text-xs font-mono flex items-center gap-1.5">
          <RefreshCw size={12} style={{ color: "var(--color-primary-accent)" }} />
          <span>{t("menu.checkUpdates")}</span>
        </span>
      )
    },
    { type: "divider" as const },
    {
      key: "info",
      label: (
        <span className="text-xs font-mono flex items-center gap-1.5">
          <Info size={12} style={{ color: "var(--color-primary-accent)" }} />
          <span>{t("menu.about")}...</span>
        </span>
      )
    }
  ];

  return (
    <header className="flex flex-col bg-[#090d16] border-b border-hero-border shrink-0 select-none">
      {contextHolder}

      {/* 1. Menüleiste (Top Menu Bar) */}
      <div data-tauri-drag-region className="h-6 bg-[#090d16] border-b border-slate-950/70 flex items-center justify-between px-3 select-none">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-3 text-[11px] text-slate-355 font-sans">
            <Dropdown menu={{ items: fileMenuItems, onClick: ({ key }) => handleMenuClick("file", key) }} trigger={["click"]}>
              <span className="cursor-pointer hover:text-white hover:bg-slate-900 px-1.5 py-0.5 rounded transition-colors">{t("menu.file")}</span>
            </Dropdown>
            <Dropdown menu={{ items: encodingMenuItems, onClick: ({ key }) => handleMenuClick("encoding", key) }} trigger={["click"]}>
              <span className="cursor-pointer hover:text-white hover:bg-slate-900 px-1.5 py-0.5 rounded transition-colors">{t("editor.encoding")}</span>
            </Dropdown>
            <Dropdown menu={{ items: settingsMenuItems, onClick: ({ key }) => handleMenuClick("settings", key) }} trigger={["click"]}>
              <span className="cursor-pointer hover:text-white hover:bg-slate-900 px-1.5 py-0.5 rounded transition-colors">{t("menu.settings")}</span>
            </Dropdown>
            <Dropdown menu={{ items: helpMenuItems, onClick: ({ key }) => handleMenuClick("help", key) }} trigger={["click"]}>
              <span className="cursor-pointer hover:text-white hover:bg-slate-900 px-1.5 py-0.5 rounded transition-colors">{t("menu.help")}</span>
            </Dropdown>
          </div>
        </div>

        <div data-tauri-drag-region className="flex-1 h-full cursor-default" />

        <div className="text-[9px] text-slate-600 font-mono tracking-wider select-none">
          v{APP_VERSION}
        </div>
      </div>

      {/* 2. Aktionsleiste (Toolbar) */}
      <div data-tauri-drag-region className="h-9 bg-[#0e1624] flex items-center justify-between px-3">
        <div className="flex items-center space-x-1.5">
          {onlyTxt ? (
            <ClickableTooltip title={t("menu.newTxt")}>
              <Button 
                type="text" 
                size="small" 
                icon={<Plus size={14} className="text-slate-300 hover:text-white" />} 
                onClick={() => addJsonTab(null, "", "txt")}
                className="hover:bg-slate-800 flex items-center justify-center h-6.5 w-6.5 p-0" 
              />
            </ClickableTooltip>
          ) : (
            <Dropdown
              menu={{
                items: [
                  enabledFileTypes.txt && {
                    key: "new-txt",
                    label: (
                      <div className="flex items-center gap-2 text-xs font-mono text-slate-200 py-0.5">
                        <FileText size={13} className="text-emerald-400" />
                        <span>Text</span>
                      </div>
                    )
                  },
                  enabledFileTypes.markdown && {
                    key: "new-markdown",
                    label: (
                      <div className="flex items-center gap-2 text-xs font-mono text-slate-200 py-0.5">
                        <FileText size={13} className="text-purple-400" />
                        <span>Markdown</span>
                      </div>
                    )
                  },
                  enabledFileTypes.json && {
                    key: "new-json",
                    label: (
                      <div className="flex items-center gap-2 text-xs font-mono text-slate-200 py-0.5">
                        <Braces size={13} className="text-amber-400" />
                        <span>JSON</span>
                      </div>
                    )
                  },
                  enabledFileTypes.xml && {
                    key: "new-xml",
                    label: (
                      <div className="flex items-center gap-2 text-xs font-mono text-slate-200 py-0.5">
                        <Code2 size={13} className="text-sky-400" />
                        <span>XML</span>
                      </div>
                    )
                  },
                  enabledFileTypes.todo && {
                    key: "new-todo",
                    label: (
                      <div className="flex items-center gap-2 text-xs font-mono text-slate-200 py-0.5">
                        <CheckSquare size={13} className="text-emerald-400" />
                        <span>ToDo</span>
                      </div>
                    )
                  }
                ].filter(Boolean) as any,
                onClick: ({ key }) => handleMenuClick("file", key)
              }}
              trigger={["click"]}
              onOpenChange={(open) => setNewFileDropdownOpen(open)}
            >
              <ClickableTooltip title={t("tabs.newFile")}>
                <Button 
                  type="text" 
                  size="small" 
                  icon={
                    <Plus 
                      size={14} 
                      className={`transition-transform duration-200 transform ${
                        newFileDropdownOpen ? "rotate-45 text-rose-400" : "rotate-0 text-slate-300 hover:text-white"
                      }`}
                    />
                  } 
                  className="hover:bg-slate-800 flex items-center justify-center h-6.5 w-6.5 p-0" 
                />
              </ClickableTooltip>
            </Dropdown>
          )}
          <ClickableTooltip title={t("menu.open")}>
            <Button 
              type="text" 
              size="small" 
              icon={<FolderOpen size={13} className="text-slate-400 hover:text-white" />} 
              onClick={handleOpenJsonFile} 
              className="hover:bg-slate-800 flex items-center justify-center h-6.5 w-6.5 p-0" 
            />
          </ClickableTooltip>
          <ClickableTooltip title={t("menu.save")}>
            <Button 
              type="text" 
              size="small" 
              disabled={!activeJsonTabId}
              icon={<Save size={13} className="text-slate-400 hover:text-white" />} 
              onClick={() => handleMenuClick("file", "save")} 
              className="hover:bg-slate-800 flex items-center justify-center h-6.5 w-6.5 p-0 disabled:opacity-30 disabled:hover:bg-transparent" 
            />
          </ClickableTooltip>
          <ClickableTooltip title={t("menu.saveAll")}>
            <Button 
              type="text" 
              size="small" 
              icon={<Save size={13} className="text-slate-400 hover:text-white" />} 
              onClick={() => handleMenuClick("file", "saveAll")} 
              className="hover:bg-slate-800 flex items-center justify-center h-6.5 w-6.5 p-0" 
            />
          </ClickableTooltip>

          <div className="h-4 w-[1px] bg-slate-850 mx-1"></div>

          <ClickableTooltip title={t("menu.undo")}>
            <Button
              type="text"
              size="small"
              icon={<Undo2 size={13} className="text-slate-400 hover:text-white" />}
              disabled={!canUndo}
              onClick={() => {
                if (mode === "todo") {
                  useToDoStore.getState().undo();
                } else {
                  undo();
                }
              }}
              className="hover:bg-slate-800 flex items-center justify-center h-6.5 w-6.5 p-0 disabled:opacity-30 disabled:hover:bg-transparent"
            />
          </ClickableTooltip>
          <ClickableTooltip title={t("menu.redo")}>
            <Button
              type="text"
              size="small"
              icon={<Redo2 size={13} className="text-slate-400 hover:text-white" />}
              disabled={!canRedo}
              onClick={() => {
                if (mode === "todo") {
                  useToDoStore.getState().redo();
                } else {
                  redo();
                }
              }}
              className="hover:bg-slate-800 flex items-center justify-center h-6.5 w-6.5 p-0 disabled:opacity-30 disabled:hover:bg-transparent"
            />
          </ClickableTooltip>
          <ClickableTooltip title={t("menu.copy")}>
            <Button
              type="text"
              size="small"
              icon={
                copyAnimationState === "check" ? (
                  <Check size={13} className="text-emerald-400 scale-110 transition-transform" />
                ) : copyAnimationState === "copy" ? (
                  <Copy size={13} className="animate-pulse" style={{ color: "var(--color-primary-accent)" }} />
                ) : (
                  <Copy size={13} className="text-slate-400 hover:text-white" />
                )
              }
              onClick={handleCopy}
              className="hover:bg-slate-800 flex items-center justify-center h-6.5 w-6.5 p-0"
            />
          </ClickableTooltip>

          {mode === "markdown" && (
            <>
              <ClickableTooltip title={`${t("menu.print") || "Drucken"} (Ctrl+P)`}>
                <Button
                  type="text"
                  size="small"
                  icon={<Printer size={13} className="text-slate-400 hover:text-white" />}
                  onClick={() => handlePrintOrExportPdf(false)}
                  className="hover:bg-slate-800 flex items-center justify-center h-6.5 w-6.5 p-0"
                />
              </ClickableTooltip>
              <ClickableTooltip title={t("menu.exportPdf") || "PDF exportieren"}>
                <Button
                  type="text"
                  size="small"
                  icon={<FilePdfOutlined className="text-slate-400 hover:text-white" />}
                  onClick={() => handlePrintOrExportPdf(true)}
                  className="hover:bg-slate-800 flex items-center justify-center h-6.5 w-6.5 p-0"
                />
              </ClickableTooltip>
            </>
          )}

          <Tooltip title={t("menu.settings")}>
            <Button
              type="text"
              size="small"
              icon={<Settings size={13} className="text-slate-400 hover:text-white" />}
              onClick={openSettingsDialog}
              className="hover:bg-slate-800 flex items-center justify-center h-6.5 w-6.5 p-0"
            />
          </Tooltip>
        </div>

        <div className="flex items-center space-x-3">
          {(mode === "json" || mode === "xml") && (
            <Segmented
              options={[
                { label: t("views.column"), value: "column" },
                { label: t("views.tree"), value: "tree" },
                { label: t("views.table"), value: "table" }
              ]}
              value={viewMode}
              onChange={(value) => setViewMode(value as any)}
              className="text-[10px] h-6 flex items-center"
            />
          )}
        </div>
      </div>

      {/* Floating Animated Copy Notification (Icon only, no text, copy -> check -> fade) */}
      {copyAnimationState !== "idle" && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[99999] pointer-events-none flex items-center justify-center p-3 rounded-full bg-[#0f172a]/95 border border-slate-700 shadow-2xl backdrop-blur transition-all duration-200 animate-in fade-in zoom-in">
          {copyAnimationState === "copy" && (
            <Copy size={20} className="animate-pulse" style={{ color: "var(--color-primary-accent)" }} />
          )}
          {copyAnimationState === "check" && (
            <Check size={20} className="text-emerald-400 scale-110 transition-transform" />
          )}
        </div>
      )}

      {/* Browser-only fallback modals when running outside Tauri */}
      {!isTauriEnv() && (
        <>
          <UpdateModal
            open={isUpdateOpen}
            manualTrigger={true}
            onClose={() => setIsUpdateOpen(false)}
          />
          <SettingsModal visible={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
          <AboutModal open={isAboutOpen} onClose={() => setIsAboutOpen(false)} />
        </>
      )}
    </header>
  );
};
