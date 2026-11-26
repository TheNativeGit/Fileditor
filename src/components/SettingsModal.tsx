import React, { useState, useEffect, useRef, useCallback } from "react";
import { Modal, Switch, Button, List, Tooltip, Select, Slider, message, ConfigProvider, theme } from "antd";
import { Settings, Keyboard, RotateCcw, Edit2, Info, Globe, Puzzle, Palette, Save, Upload } from "lucide-react";
import { useFileStore, AccentTheme, getTabMode, JsonXmlViewMode } from "../store/useFileStore";
import { useToDoStore } from "../store/useToDoStore";
import { useTranslation, useI18nStore, AVAILABLE_LANGUAGES } from "../i18n";
import { emitTauri, invokeTauriSafe, isTauriEnv, listenTauri } from "../utils/tauriBridge";

export interface SavedSettingsPayload {
  autoCheckUpdates?: boolean;
  graphEnabled: boolean;
  backupRetentionDays: number;
  markdownRememberViewState: boolean;
  markdownSyncEditorFromPreview: boolean;
  markdownSyncPreviewFromEditor: boolean;
  todoCascadingIndent: boolean;
  dateSupport: boolean;
  docusaurusSupport: boolean;
  fullscreenMarkdownWidth: string;
  fullscreenMarkdownZoom: number;
  enabledFileTypes: { xml: boolean; json: boolean; markdown: boolean; todo: boolean; txt: true };
  customHotkeys: Record<string, string>;
  markdownAutoNumbering: boolean;
  markdownPreserveNumbering: boolean;
  todoAutoCompleteChildren: boolean;
  todoAutoCollapseParentOnComplete: boolean;
  todoHideCompleted: boolean;
  defaultJsonViewMode: JsonXmlViewMode;
  defaultXmlViewMode: JsonXmlViewMode;
}

const defaultKeys: Record<string, string> = {
  bold: "Ctrl+Shift+B",
  italic: "Ctrl+Shift+K",
  strikethrough: "Ctrl+Shift+X",
  underline: "Ctrl+Shift+U",
  code: "Ctrl+Shift+C",
  blockquote: "Ctrl+Shift+Q",
  checklist: "Ctrl+Shift+L",
  save: "Ctrl+S",
  saveAll: "Ctrl+Shift+S",
  saveAs: "Ctrl+Alt+S",
  newFile: "Ctrl+N",
  openFile: "Ctrl+O"
};

const actionLabels: Record<string, string> = {
  newFile: "Neue Datei erstellen",
  openFile: "Datei öffnen",
  save: "Datei speichern",
  saveAll: "Alle Dateien speichern",
  saveAs: "Datei speichern unter...",
  bold: "Text Fett formatieren (Markdown)",
  italic: "Text Kursiv formatieren (Markdown)",
  strikethrough: "Text Durchstreichen (Markdown)",
  underline: "Text Unterstreichen (Markdown)",
  code: "Text als Code formatieren (Markdown)",
  blockquote: "Blockzitat einfügen (Markdown)",
  checklist: "Checkliste einfügen (Markdown)"
};

const getActionLabel = (action: string, t: (key: string, params?: Record<string, string | number>) => string): string => {
  const localized = t(`settings.hotkeyActions.${action}`);
  return localized && !localized.startsWith("settings.hotkeyActions.") ? localized : (actionLabels[action] || action);
};

interface SettingsContentProps {
  isOpen: boolean;
  onClose: () => void;
  isNativeWindow?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  externalConfirmCloseTick?: number;
}

export const SettingsContent: React.FC<SettingsContentProps> = ({
  isOpen,
  onClose,
  isNativeWindow = false,
  onDirtyChange,
  externalConfirmCloseTick = 0
}) => {
  const {
    autoCheckUpdates,
    setAutoCheckUpdates,
    graphEnabled,
    setGraphEnabled,
    backupRetentionDays,
    setBackupRetentionDays,
    markdownRememberViewState,
    setMarkdownRememberViewState,
    markdownSyncEditorFromPreview,
    setMarkdownSyncEditorFromPreview,
    markdownSyncPreviewFromEditor,
    setMarkdownSyncPreviewFromEditor,
    dateSupport,
    setDateSupport,
    docusaurusSupport,
    setDocusaurusSupport,
    fullscreenMarkdownWidth,
    setFullscreenMarkdownWidth,
    fullscreenMarkdownZoom,
    setFullscreenMarkdownZoom,
    customHotkeys,
    setCustomHotkey,
    enabledFileTypes,
    setEnabledFileTypes,
    markdownAutoNumbering,
    setMarkdownAutoNumbering,
    markdownPreserveNumbering,
    setMarkdownPreserveNumbering,
    todoAutoCompleteChildren,
    setTodoAutoCompleteChildren,
    todoAutoCollapseParentOnComplete,
    setTodoAutoCollapseParentOnComplete,
    todoHideCompleted,
    setTodoHideCompleted,
    defaultJsonViewMode,
    setDefaultJsonViewMode,
    defaultXmlViewMode,
    setDefaultXmlViewMode,
    accentTheme,
    setAccentTheme,
    resetAccentTheme
  } = useFileStore();

  const { todoCascadingIndent, setTodoCascadingIndent } = useToDoStore();
  const { currentLanguage, setLanguage, t } = useTranslation();
  const rgbFileInputRef = useRef<HTMLInputElement>(null);

  const [recordingAction, setRecordingAction] = useState<string | null>(null);
  const [activeTabKey, setActiveTabKey] = useState<"general" | "plugins" | "hotkeys" | "colors" | "language">("general");
  const [showConfirmClose, setShowConfirmClose] = useState(false);

  // Draft Settings (only saved when clicking Save)
  const [draftAutoCheckUpdates, setDraftAutoCheckUpdates] = useState(autoCheckUpdates);
  const [draftGraphEnabled, setDraftGraphEnabled] = useState(graphEnabled);
  const [draftBackupRetentionDays, setDraftBackupRetentionDays] = useState(backupRetentionDays);
  const [draftMarkdownRememberViewState, setDraftMarkdownRememberViewState] = useState(markdownRememberViewState);
  const [draftSyncEditorFromPreview, setDraftSyncEditorFromPreview] = useState(markdownSyncEditorFromPreview);
  const [draftSyncPreviewFromEditor, setDraftSyncPreviewFromEditor] = useState(markdownSyncPreviewFromEditor);
  const [draftTodoCascadingIndent, setDraftTodoCascadingIndent] = useState(todoCascadingIndent);
  const [draftDateSupport, setDraftDateSupport] = useState(dateSupport);
  const [draftDocusaurusSupport, setDraftDocusaurusSupport] = useState(docusaurusSupport);
  const [draftWidth, setDraftWidth] = useState(fullscreenMarkdownWidth);
  const [draftZoom, setDraftZoom] = useState(fullscreenMarkdownZoom);
  const [draftEnabledFileTypes, setDraftEnabledFileTypes] = useState(enabledFileTypes);
  const [draftHotkeys, setDraftHotkeys] = useState(customHotkeys);
  const [draftMarkdownAutoNum, setDraftMarkdownAutoNum] = useState(markdownAutoNumbering);
  const [draftMarkdownPreserveNum, setDraftMarkdownPreserveNum] = useState(markdownPreserveNumbering);
  const [draftTodoAutoCompleteChildren, setDraftTodoAutoCompleteChildren] = useState(todoAutoCompleteChildren);
  const [draftTodoAutoCollapseParent, setDraftTodoAutoCollapseParent] = useState(todoAutoCollapseParentOnComplete);
  const [draftTodoHideCompleted, setDraftTodoHideCompleted] = useState(todoHideCompleted);
  const [draftDefaultJsonViewMode, setDraftDefaultJsonViewMode] = useState<JsonXmlViewMode>(defaultJsonViewMode);
  const [draftDefaultXmlViewMode, setDraftDefaultXmlViewMode] = useState<JsonXmlViewMode>(defaultXmlViewMode);
  const [activeFileConfigModal, setActiveFileConfigModal] = useState<"txt" | "xml" | "json" | "markdown" | "todo" | null>(null);

  // Sync draft states when opened
  useEffect(() => {
    if (isOpen) {
      setDraftAutoCheckUpdates(autoCheckUpdates);
      setDraftGraphEnabled(graphEnabled);
      setDraftBackupRetentionDays(backupRetentionDays);
      setDraftMarkdownRememberViewState(markdownRememberViewState);
      setDraftSyncEditorFromPreview(markdownSyncEditorFromPreview);
      setDraftSyncPreviewFromEditor(markdownSyncPreviewFromEditor);
      setDraftTodoCascadingIndent(todoCascadingIndent);
      setDraftDateSupport(dateSupport);
      setDraftDocusaurusSupport(docusaurusSupport);
      setDraftWidth(fullscreenMarkdownWidth);
      setDraftZoom(fullscreenMarkdownZoom);
      setDraftEnabledFileTypes(enabledFileTypes);
      setDraftHotkeys(customHotkeys);
      setDraftMarkdownAutoNum(markdownAutoNumbering);
      setDraftMarkdownPreserveNum(markdownPreserveNumbering);
      setDraftTodoAutoCompleteChildren(todoAutoCompleteChildren);
      setDraftTodoAutoCollapseParent(todoAutoCollapseParentOnComplete);
      setDraftTodoHideCompleted(todoHideCompleted);
      setDraftDefaultJsonViewMode(defaultJsonViewMode);
      setDraftDefaultXmlViewMode(defaultXmlViewMode);
      setShowConfirmClose(false);
    }
  }, [
    isOpen,
    autoCheckUpdates,
    graphEnabled,
    backupRetentionDays,
    markdownRememberViewState,
    markdownSyncEditorFromPreview,
    markdownSyncPreviewFromEditor,
    todoCascadingIndent,
    dateSupport,
    docusaurusSupport,
    fullscreenMarkdownWidth,
    fullscreenMarkdownZoom,
    enabledFileTypes,
    customHotkeys,
    markdownAutoNumbering,
    markdownPreserveNumbering,
    todoAutoCompleteChildren,
    todoAutoCollapseParentOnComplete,
    todoHideCompleted,
    defaultJsonViewMode,
    defaultXmlViewMode
  ]);

  const hasUnsavedChanges =
    draftAutoCheckUpdates !== autoCheckUpdates ||
    draftGraphEnabled !== graphEnabled ||
    draftBackupRetentionDays !== backupRetentionDays ||
    draftMarkdownRememberViewState !== markdownRememberViewState ||
    draftSyncEditorFromPreview !== markdownSyncEditorFromPreview ||
    draftSyncPreviewFromEditor !== markdownSyncPreviewFromEditor ||
    draftTodoCascadingIndent !== todoCascadingIndent ||
    draftDateSupport !== dateSupport ||
    draftDocusaurusSupport !== docusaurusSupport ||
    draftWidth !== fullscreenMarkdownWidth ||
    draftZoom !== fullscreenMarkdownZoom ||
    draftMarkdownAutoNum !== markdownAutoNumbering ||
    draftMarkdownPreserveNum !== markdownPreserveNumbering ||
    draftTodoAutoCompleteChildren !== todoAutoCompleteChildren ||
    draftTodoAutoCollapseParent !== todoAutoCollapseParentOnComplete ||
    draftTodoHideCompleted !== todoHideCompleted ||
    draftDefaultJsonViewMode !== defaultJsonViewMode ||
    draftDefaultXmlViewMode !== defaultXmlViewMode ||
    JSON.stringify(draftEnabledFileTypes) !== JSON.stringify(enabledFileTypes) ||
    JSON.stringify(draftHotkeys) !== JSON.stringify(customHotkeys);

  useEffect(() => {
    onDirtyChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onDirtyChange]);

  useEffect(() => {
    if (externalConfirmCloseTick > 0) {
      setShowConfirmClose(true);
    }
  }, [externalConfirmCloseTick]);

  // Hotkey recording listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!recordingAction) return;

      e.preventDefault();
      e.stopPropagation();

      const parts: string[] = [];
      if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
      if (e.shiftKey) parts.push("Shift");
      if (e.altKey) parts.push("Alt");

      let keyName = e.key.toUpperCase();
      if (["CONTROL", "SHIFT", "ALT", "META"].includes(keyName)) {
        return;
      }

      if (keyName === " ") keyName = "Space";
      parts.push(keyName);

      const shortcut = parts.join("+");
      setDraftHotkeys((prev) => ({ ...prev, [recordingAction]: shortcut }));
      setRecordingAction(null);
      message.success(
        t("settings.shortcutSetSuccess", {
          action: getActionLabel(recordingAction, t),
          shortcut
        })
      );
    };

    if (recordingAction) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [recordingAction, t]);

  const applyAccentUpdate = (partial: Partial<AccentTheme>) => {
    setAccentTheme(partial);
    const updated = useFileStore.getState().accentTheme;
    emitTauri("fileditor-accent-theme-changed", updated);
  };

  const handleSaveColorTheme = async () => {
    try {
      const jsonContent = JSON.stringify(accentTheme, null, 2);
      if (isTauriEnv()) {
        const selectedPath = await invokeTauriSafe<string | null>("save_file_dialog", {
          title: t("settings.saveColorTheme"),
          defaultName: "fileditor-theme.rgb",
          filterName: "RGB Theme (*.rgb)",
          filterExt: "rgb"
        });
        if (selectedPath) {
          await invokeTauriSafe("write_file", { path: selectedPath, content: jsonContent });
          message.success(t("settings.colorThemeSaved"));
        }
      } else {
        const blob = new Blob([jsonContent], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "fileditor-theme.rgb";
        a.click();
        URL.revokeObjectURL(url);
        message.success(t("settings.colorThemeSaved"));
      }
    } catch (err) {
      console.error("Save color theme error:", err);
      message.error(t("common.error"));
    }
  };

  const handleLoadColorTheme = async () => {
    try {
      if (isTauriEnv()) {
        const selectedPath = await invokeTauriSafe<string | null>("open_file_dialog", {
          title: t("settings.loadColorTheme"),
          filterName: "RGB Theme (*.rgb, *.json)",
          filterExt: "rgb"
        });
        if (selectedPath) {
          const content = await invokeTauriSafe<string>("read_file", { path: selectedPath });
          if (typeof content === "string") {
            const parsed = JSON.parse(content);
            applyAccentUpdate(parsed);
            message.success(t("settings.colorThemeLoaded"));
          }
        }
      } else {
        rgbFileInputRef.current?.click();
      }
    } catch (err) {
      console.error("Load color theme error:", err);
      message.error(t("settings.colorThemeInvalid"));
    }
  };

  const handleRgbFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target?.result as string);
        applyAccentUpdate(parsed);
        message.success(t("settings.colorThemeLoaded"));
      } catch {
        message.error(t("settings.colorThemeInvalid"));
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleResetHotkeys = () => {
    setDraftHotkeys(defaultKeys);
    message.success(t("settings.hotkeysResetSuccess"));
  };

  const handleSaveSettings = async () => {
    setAutoCheckUpdates(draftAutoCheckUpdates);
    setGraphEnabled(draftGraphEnabled);
    setBackupRetentionDays(draftBackupRetentionDays);
    setMarkdownRememberViewState(draftMarkdownRememberViewState);
    setMarkdownSyncEditorFromPreview(draftSyncEditorFromPreview);
    setMarkdownSyncPreviewFromEditor(draftSyncPreviewFromEditor);
    setTodoCascadingIndent(draftTodoCascadingIndent);
    setDateSupport(draftDateSupport);
    setDocusaurusSupport(draftDocusaurusSupport);
    setFullscreenMarkdownWidth(draftWidth);
    setFullscreenMarkdownZoom(draftZoom);
    setEnabledFileTypes(draftEnabledFileTypes);
    setMarkdownAutoNumbering(draftMarkdownAutoNum);
    setMarkdownPreserveNumbering(draftMarkdownPreserveNum);
    setTodoAutoCompleteChildren(draftTodoAutoCompleteChildren);
    setTodoAutoCollapseParentOnComplete(draftTodoAutoCollapseParent);
    setTodoHideCompleted(draftTodoHideCompleted);
    setDefaultJsonViewMode(draftDefaultJsonViewMode);
    setDefaultXmlViewMode(draftDefaultXmlViewMode);

    Object.entries(draftHotkeys).forEach(([act, shortcut]) => {
      setCustomHotkey(act, shortcut);
    });

    const payload: SavedSettingsPayload = {
      autoCheckUpdates: draftAutoCheckUpdates,
      graphEnabled: draftGraphEnabled,
      backupRetentionDays: draftBackupRetentionDays,
      markdownRememberViewState: draftMarkdownRememberViewState,
      markdownSyncEditorFromPreview: draftSyncEditorFromPreview,
      markdownSyncPreviewFromEditor: draftSyncPreviewFromEditor,
      todoCascadingIndent: draftTodoCascadingIndent,
      dateSupport: draftDateSupport,
      docusaurusSupport: draftDocusaurusSupport,
      fullscreenMarkdownWidth: draftWidth,
      fullscreenMarkdownZoom: draftZoom,
      enabledFileTypes: draftEnabledFileTypes,
      customHotkeys: draftHotkeys,
      markdownAutoNumbering: draftMarkdownAutoNum,
      markdownPreserveNumbering: draftMarkdownPreserveNum,
      todoAutoCompleteChildren: draftTodoAutoCompleteChildren,
      todoAutoCollapseParentOnComplete: draftTodoAutoCollapseParent,
      todoHideCompleted: draftTodoHideCompleted,
      defaultJsonViewMode: draftDefaultJsonViewMode,
      defaultXmlViewMode: draftDefaultXmlViewMode
    };

    if (isNativeWindow) {
      await invokeTauriSafe("set_settings_dirty", { dirty: false });
      await emitTauri("fileditor-settings-saved", payload);
    } else {
      // Same-window mode (browser fallback): close tabs for disabled types directly
      const { jsonTabs, closeJsonTab } = useFileStore.getState();
      const tabsToClose = jsonTabs.filter((tab) => {
        const tabMode = getTabMode(tab);
        if (tabMode === "xml" && !draftEnabledFileTypes.xml) return true;
        if (tabMode === "json" && !draftEnabledFileTypes.json) return true;
        if (tabMode === "markdown" && !draftEnabledFileTypes.markdown) return true;
        if (tabMode === "todo" && !draftEnabledFileTypes.todo) return true;
        return false;
      });
      tabsToClose.forEach((tab) => closeJsonTab(tab.id));
      message.success(t("settings.savedSuccess"));
    }

    onClose();
  };

  const handleCancelClose = () => {
    if (hasUnsavedChanges) {
      setShowConfirmClose(true);
    } else {
      onClose();
    }
  };

  const navItems: { key: "general" | "plugins" | "hotkeys" | "colors" | "language"; icon: React.ElementType; label: string }[] = [
    { key: "general", icon: Settings, label: t("settings.tabGeneral") },
    { key: "plugins", icon: Puzzle, label: t("settings.tabExtras") },
    { key: "hotkeys", icon: Keyboard, label: t("settings.tabShortcuts") },
    { key: "colors", icon: Palette, label: t("settings.tabColors") },
    { key: "language", icon: Globe, label: t("settings.tabLanguage") }
  ];

  return (
    <div className="h-full w-full flex flex-col bg-[#090d16] text-slate-200 overflow-hidden">
      {/* Main Body: Fixed Left Sidebar + Scrollable Right Content */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Fixed Left Navigation Sidebar (never flips to top tabs) */}
        <aside className="w-48 sm:w-52 shrink-0 bg-[#0b101b] border-r border-slate-800/80 p-2.5 flex flex-col gap-1 overflow-y-auto select-none">
          {navItems.map((item) => {
            const IconComp = item.icon;
            const isActive = activeTabKey === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveTabKey(item.key)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-semibold transition-colors text-left cursor-pointer border ${
                  isActive
                    ? ""
                    : "text-slate-300 hover:text-white hover:bg-slate-800/60 border-transparent"
                }`}
                style={
                  isActive
                    ? {
                        backgroundColor: "rgba(var(--color-primary-accent-rgb), 0.14)",
                        color: "var(--color-primary-accent)",
                        borderColor: "rgba(var(--color-primary-accent-rgb), 0.4)"
                      }
                    : undefined
                }
              >
                <IconComp size={15} className="shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </aside>

        {/* Right Scrollable Settings Content Pane */}
        <main className="flex-1 min-w-0 h-full overflow-y-auto p-5 scrollbar-thin">
          {activeTabKey === "general" && (
            <div className="space-y-4 text-slate-300">
              {/* Automatic Update Reminder */}
              <div className="flex items-center justify-between gap-4 p-3.5 bg-slate-900/60 border border-slate-800/80 rounded-lg">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-xs font-semibold text-white flex items-center gap-1">
                    {t("settings.autoCheckUpdatesTitle")}
                  </span>
                  <span className="text-[10px] text-slate-400">{t("settings.autoCheckUpdatesDesc")}</span>
                </div>
                <Switch checked={draftAutoCheckUpdates} onChange={setDraftAutoCheckUpdates} className="bg-slate-700 shrink-0" />
              </div>

              {/* Graph Toggle */}
              <div className="flex items-center justify-between gap-4 p-3.5 bg-slate-900/60 border border-slate-800/80 rounded-lg">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-xs font-semibold text-white flex items-center gap-1">
                    {t("settings.graphEnabledTitle") || "Graph-Ansicht aktivieren"}
                    <Tooltip title={t("settings.graphEnabledTooltip") || "Aktiviert die interaktive Dokumenten- und Wissensgraphen-Ansicht. Bei Deaktivierung wird das Modul für schnellere Ladezeiten nicht geladen."}>
                      <Info size={11} className="text-slate-500 cursor-pointer hover:text-slate-300 shrink-0" />
                    </Tooltip>
                  </span>
                  <span className="text-[10px] text-slate-400">{t("settings.graphEnabledDesc") || "Dokumenten- und Wissensgraphen im Programm bereitstellen (deaktivieren für maximale Startgeschwindigkeit)."}</span>
                </div>
                <Switch checked={draftGraphEnabled} onChange={setDraftGraphEnabled} className="bg-slate-700 shrink-0" />
              </div>

              {/* Backup Retention */}
              <div className="flex items-center justify-between gap-4 p-3.5 bg-slate-900/60 border border-slate-800/80 rounded-lg">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-xs font-semibold text-white flex items-center gap-1">
                    {t("settings.backupRetentionTitle") || "Wiederherstellungs-Aufbewahrung"}
                    <Tooltip title={t("settings.backupRetentionTooltip") || "Legt fest, wie viele Tage geschlossene oder ungespeicherte Dateien für 'Datei > Wiederherstellen' im Hintergrund vorgehalten werden. Veraltete Dateien werden stumm bereinigt."}>
                      <Info size={11} className="text-slate-500 cursor-pointer hover:text-slate-300 shrink-0" />
                    </Tooltip>
                  </span>
                  <span className="text-[10px] text-slate-400">{t("settings.backupRetentionDesc") || "Aufbewahrungszeitraum für geschlossene Dateien aus allen Instanzen."}</span>
                </div>
                <Select
                  size="small"
                  value={draftBackupRetentionDays}
                  onChange={setDraftBackupRetentionDays}
                  className="w-44 font-mono text-xs shrink-0"
                  options={[
                    { value: 0, label: t("settings.retentionDisabled") || "Deaktiviert (Nie)" },
                    { value: 1, label: t("settings.retention1Day") || "1 Tag" },
                    { value: 3, label: t("settings.retention3Days") || "3 Tage" },
                    { value: 7, label: t("settings.retention7Days") || "7 Tage" },
                    { value: 14, label: t("settings.retention14Days") || "14 Tage" },
                    { value: 30, label: t("settings.retention30Days") || "30 Tage" },
                    { value: -1, label: t("settings.retentionUnlimited") || "Unbegrenzt" }
                  ]}
                />
              </div>

              {/* Date & Discord Support */}
              <div className="flex items-center justify-between gap-4 p-3.5 bg-slate-900/60 border border-slate-800/80 rounded-lg">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-xs font-semibold text-white flex items-center gap-1">
                    {t("settings.dateSupportTitle")}
                    <Tooltip title={t("settings.dateSupportTooltip")}>
                      <Info size={11} className="text-slate-500 cursor-pointer hover:text-slate-300 shrink-0" />
                    </Tooltip>
                  </span>
                  <span className="text-[10px] text-slate-400">{t("settings.dateSupportDesc")}</span>
                </div>
                <Switch checked={draftDateSupport} onChange={setDraftDateSupport} className="bg-slate-700 shrink-0" />
              </div>

              {/* Markierung synchronisieren: Editor reagiert auf Live */}
              <div className="flex items-center justify-between gap-4 p-3.5 bg-slate-900/60 border border-slate-800/80 rounded-lg">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-xs font-semibold text-white flex items-center gap-1">
                    {t("settings.markdownSyncEditorFromPreviewTitle") || "Editor reagiert auf Live"}
                    <Tooltip title={t("settings.markdownSyncEditorFromPreviewDesc") || "Springt im Editor an die entsprechende Zeile und markiert sie, wenn in der Live-Vorschau geklickt oder markiert wird."}>
                      <Info size={11} className="text-slate-500 cursor-pointer hover:text-slate-300 shrink-0" />
                    </Tooltip>
                  </span>
                  <span className="text-[10px] text-slate-400">{t("settings.markdownSyncEditorFromPreviewDesc") || "Springt im Editor an die entsprechende Zeile und markiert sie, wenn in der Live-Vorschau geklickt oder markiert wird."}</span>
                </div>
                <Switch checked={draftSyncEditorFromPreview} onChange={setDraftSyncEditorFromPreview} className="bg-slate-700 shrink-0" />
              </div>

              {/* Markierung synchronisieren: Live reagiert auf Editor */}
              <div className="flex items-center justify-between gap-4 p-3.5 bg-slate-900/60 border border-slate-800/80 rounded-lg">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-xs font-semibold text-white flex items-center gap-1">
                    {t("settings.markdownSyncPreviewFromEditorTitle") || "Live reagiert auf Editor"}
                    <Tooltip title={t("settings.markdownSyncPreviewFromEditorDesc") || "Springt in der Live-Vorschau an die entsprechende Stelle und hebt die Zeile hervor, wenn im Editor eine Zeile markiert oder angeklickt wird."}>
                      <Info size={11} className="text-slate-500 cursor-pointer hover:text-slate-300 shrink-0" />
                    </Tooltip>
                  </span>
                  <span className="text-[10px] text-slate-400">{t("settings.markdownSyncPreviewFromEditorDesc") || "Springt in der Live-Vorschau an die entsprechende Stelle und hebt die Zeile hervor, wenn im Editor eine Zeile markiert oder angeklickt wird."}</span>
                </div>
                <Switch checked={draftSyncPreviewFromEditor} onChange={setDraftSyncPreviewFromEditor} className="bg-slate-700 shrink-0" />
              </div>

              {/* Markdown Fullscreen Width */}
              <div className="flex items-center justify-between gap-4 p-3.5 bg-slate-900/60 border border-slate-800/80 rounded-lg">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-xs font-semibold text-white flex items-center gap-1">
                    {t("settings.markdownWidthTitle")}
                  </span>
                  <span className="text-[10px] text-slate-400">{t("settings.markdownWidthDesc")}</span>
                </div>
                <Tooltip title={draftWidth} placement="top">
                  <div className="w-36 shrink-0">
                    <Select
                      size="small"
                      value={draftWidth}
                      onChange={setDraftWidth}
                      className="w-full font-mono text-xs"
                      optionRender={(option) => (
                        <Tooltip title={(option.data as any).px} placement="right">
                          <div className="w-full py-0.5 font-mono text-xs">
                            {option.label}
                          </div>
                        </Tooltip>
                      )}
                      options={[
                        { value: "650px", label: t("markdown.narrowPure") || "Schmal", px: "650px" },
                        { value: "850px", label: t("markdown.standardPure") || "Standard", px: "850px" },
                        { value: "1200px", label: t("markdown.widePure") || "Breit", px: "1200px" },
                        { value: "100%", label: t("markdown.maxPure") || "Maximal", px: "100%" }
                      ]}
                    />
                  </div>
                </Tooltip>
              </div>

              {/* Markdown Fullscreen Zoom (50% - 200% in 10% steps) */}
              <div className="flex flex-col gap-2 p-3.5 bg-slate-900/60 border border-slate-800/80 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-semibold text-white flex items-center gap-1">
                      {t("settings.markdownZoomTitle")}
                    </span>
                    <span className="text-[10px] text-slate-400">{t("settings.markdownZoomDesc")}</span>
                  </div>
                  <span
                    className="px-2.5 py-0.5 rounded font-mono font-bold text-xs border shrink-0"
                    style={{
                      backgroundColor: "rgba(var(--color-primary-accent-rgb), 0.15)",
                      borderColor: "rgba(var(--color-primary-accent-rgb), 0.4)",
                      color: "var(--color-primary-accent)"
                    }}
                  >
                    {draftZoom}%
                  </span>
                </div>
                <div className="px-2 pt-1">
                  <Slider
                    min={50}
                    max={200}
                    step={10}
                    value={draftZoom}
                    onChange={setDraftZoom}
                    marks={{
                      50: "50%",
                      100: "100%",
                      150: "150%",
                      200: "200%"
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {activeTabKey === "plugins" && (
            <div className="space-y-6 text-slate-300">
              {/* SEKTION 1: DATEIARTEN */}
              <div className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-primary-accent)" }}>{t("settings.fileTypesTitle")}</div>
                <div className="text-[11px] text-slate-400">
                  {t("settings.fileTypesDesc")}
                </div>

                <div className="grid gap-2.5 grid-cols-1 md:grid-cols-2">
                  <div className="flex items-center justify-between p-3 bg-slate-900/60 border border-slate-800/80 rounded-lg">
                    <div className="flex flex-col gap-0.5 min-w-0 pr-2">
                      <span className="text-xs font-semibold text-white">{t("settings.txtTitle")}</span>
                      <span className="text-[10px] text-slate-400">{t("settings.txtDesc")}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Tooltip title={t("settings.configTextTitle")}>
                        <Button
                          type="text"
                          size="small"
                          icon={<Settings size={14} className="text-slate-400 hover:text-white transition-colors" />}
                          onClick={() => setActiveFileConfigModal("txt")}
                          className="hover:bg-slate-800 flex items-center justify-center h-6 w-6 p-0"
                        />
                      </Tooltip>
                      <div className="w-[44px] h-[22px]" />
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-slate-900/60 border border-slate-800/80 rounded-lg">
                    <div className="flex flex-col gap-0.5 min-w-0 pr-2">
                      <span className="text-xs font-semibold text-white">{t("settings.xmlTitle")}</span>
                      <span className="text-[10px] text-slate-400">{t("settings.xmlDesc")}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Tooltip title={t("settings.configXmlTitle")}>
                        <Button
                          type="text"
                          size="small"
                          icon={<Settings size={14} className="text-slate-400 hover:text-white transition-colors" />}
                          onClick={() => setActiveFileConfigModal("xml")}
                          className="hover:bg-slate-800 flex items-center justify-center h-6 w-6 p-0"
                        />
                      </Tooltip>
                      <Switch checked={draftEnabledFileTypes.xml} onChange={(val) => setDraftEnabledFileTypes({ ...draftEnabledFileTypes, xml: val })} className="bg-slate-700" />
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-slate-900/60 border border-slate-800/80 rounded-lg">
                    <div className="flex flex-col gap-0.5 min-w-0 pr-2">
                      <span className="text-xs font-semibold text-white">{t("settings.jsonTitle")}</span>
                      <span className="text-[10px] text-slate-400">{t("settings.jsonDesc")}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Tooltip title={t("settings.configJsonTitle")}>
                        <Button
                          type="text"
                          size="small"
                          icon={<Settings size={14} className="text-slate-400 hover:text-white transition-colors" />}
                          onClick={() => setActiveFileConfigModal("json")}
                          className="hover:bg-slate-800 flex items-center justify-center h-6 w-6 p-0"
                        />
                      </Tooltip>
                      <Switch checked={draftEnabledFileTypes.json} onChange={(val) => setDraftEnabledFileTypes({ ...draftEnabledFileTypes, json: val })} className="bg-slate-700" />
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-slate-900/60 border border-slate-800/80 rounded-lg">
                    <div className="flex flex-col gap-0.5 min-w-0 pr-2">
                      <span className="text-xs font-semibold text-white">{t("settings.mdTitle")}</span>
                      <span className="text-[10px] text-slate-400">{t("settings.mdDesc")}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Tooltip title={t("settings.configMarkdownTitle")}>
                        <Button
                          type="text"
                          size="small"
                          icon={<Settings size={14} className="text-slate-400 hover:text-white transition-colors" />}
                          onClick={() => setActiveFileConfigModal("markdown")}
                          className="hover:bg-slate-800 flex items-center justify-center h-6 w-6 p-0"
                        />
                      </Tooltip>
                      <Switch checked={draftEnabledFileTypes.markdown} onChange={(val) => setDraftEnabledFileTypes({ ...draftEnabledFileTypes, markdown: val })} className="bg-slate-700" />
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-slate-900/60 border border-slate-800/80 rounded-lg">
                    <div className="flex flex-col gap-0.5 min-w-0 pr-2">
                      <span className="text-xs font-semibold text-white">{t("settings.todoTitle")}</span>
                      <span className="text-[10px] text-slate-400">{t("settings.todoDesc")}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Tooltip title={t("settings.configTodoTitle")}>
                        <Button
                          type="text"
                          size="small"
                          icon={<Settings size={14} className="text-slate-400 hover:text-white transition-colors" />}
                          onClick={() => setActiveFileConfigModal("todo")}
                          className="hover:bg-slate-800 flex items-center justify-center h-6 w-6 p-0"
                        />
                      </Tooltip>
                      <Switch checked={draftEnabledFileTypes.todo} onChange={(val) => setDraftEnabledFileTypes({ ...draftEnabledFileTypes, todo: val })} className="bg-slate-700" />
                    </div>
                  </div>
                </div>
              </div>

              {/* SEKTION 2: DOCUSAURUS SYNTAX */}
              <div className="space-y-3 pt-3 border-t border-slate-800">
                <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-primary-accent)" }}>{t("settings.docusaurusTitle")}</div>
                <div
                  className="flex items-center justify-between p-3.5 bg-slate-900/60 border rounded-lg"
                  style={{ borderColor: "rgba(var(--color-primary-accent-rgb), 0.25)" }}
                >
                  <div className="flex flex-col gap-0.5 max-w-[80%]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-white flex items-center gap-1">
                        {t("settings.docusaurusTitle")}
                        <Tooltip title={t("settings.docusaurusTooltip")}>
                          <Info size={11} className="text-slate-500 cursor-pointer hover:text-slate-300" />
                        </Tooltip>
                      </span>
                      <span
                        className="text-[9px] px-1.5 py-0.5 rounded border font-mono"
                        style={{
                          backgroundColor: "rgba(var(--color-primary-accent-rgb), 0.14)",
                          borderColor: "rgba(var(--color-primary-accent-rgb), 0.35)",
                          color: "var(--color-primary-accent)"
                        }}
                      >
                        {t("settings.integratedAdapter")}
                      </span>
                    </div>
                  </div>
                  <Switch checked={draftDocusaurusSupport} onChange={setDraftDocusaurusSupport} className="bg-slate-700 shrink-0" />
                </div>
              </div>
            </div>
          )}

          {activeTabKey === "hotkeys" && (
            <div className="text-slate-300 flex flex-col">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <span className="text-[11px] text-slate-400">{t("settings.shortcutsDesc")}</span>
                <Button
                  size="small"
                  type="text"
                  icon={<RotateCcw size={11} />}
                  onClick={handleResetHotkeys}
                  className="text-slate-400 hover:text-white text-[10px] flex items-center gap-1 border border-slate-800 hover:border-slate-700"
                >
                  {t("settings.shortcutsReset")}
                </Button>
              </div>

              <div className="pt-2">
                {recordingAction ? (
                  <div
                    className="flex flex-col items-center justify-center p-8 space-y-4 bg-slate-900 border rounded-lg my-6"
                    style={{ borderColor: "rgba(var(--color-primary-accent-rgb), 0.35)" }}
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center animate-pulse"
                      style={{
                        backgroundColor: "rgba(var(--color-primary-accent-rgb), 0.12)",
                        color: "var(--color-primary-accent)"
                      }}
                    >
                      <Keyboard size={20} />
                    </div>
                    <span className="text-xs font-semibold text-white">{t("settings.newShortcutFor")}</span>
                    <span className="text-sm font-mono font-bold" style={{ color: "var(--color-primary-accent)" }}>"{getActionLabel(recordingAction, t)}"</span>
                    <span className="text-[10px] text-slate-500 text-center max-w-sm">{t("settings.shortcutHint")}</span>
                    <Button size="small" danger onClick={() => setRecordingAction(null)} className="mt-2 text-xs">
                      {t("common.cancel")}
                    </Button>
                  </div>
                ) : (
                  <List
                    size="small"
                    dataSource={Object.keys(draftHotkeys)}
                    renderItem={(action) => (
                      <List.Item
                        key={action}
                        actions={[
                          <Tooltip title={t("settings.reassign")}>
                            <Button
                              size="small"
                              type="text"
                              icon={<Edit2 size={11} style={{ color: "var(--color-primary-accent)" }} />}
                              onClick={() => setRecordingAction(action)}
                              className="hover:bg-slate-800"
                            />
                          </Tooltip>
                        ]}
                      >
                        <div className="flex items-center justify-between w-full pr-4">
                          <span className="text-xs text-slate-300">{getActionLabel(action, t)}</span>
                          <span
                            className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-slate-800 border border-slate-700"
                            style={{ color: "var(--color-primary-accent)" }}
                          >
                            {draftHotkeys[action] || defaultKeys[action]}
                          </span>
                        </div>
                      </List.Item>
                    )}
                  />
                )}
              </div>
            </div>
          )}

          {activeTabKey === "colors" && (
            <div className="space-y-4 text-slate-300">
              <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-lg flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h4 className="text-xs font-semibold text-white">{t("settings.colorsTitle")}</h4>
                  <p className="text-[11px] text-slate-400">{t("settings.colorsDesc")}</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="small"
                    icon={<RotateCcw size={12} />}
                    onClick={() => {
                      resetAccentTheme();
                      emitTauri("fileditor-accent-theme-changed", useFileStore.getState().accentTheme);
                      message.success(t("settings.colorThemeReset"));
                    }}
                    className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
                  >
                    {t("settings.reset")}
                  </Button>
                  <Button
                    size="small"
                    type="primary"
                    icon={<Save size={12} />}
                    onClick={handleSaveColorTheme}
                    className="text-xs"
                  >
                    {t("settings.saveColorTheme")}
                  </Button>
                  <Button
                    size="small"
                    icon={<Upload size={12} />}
                    onClick={handleLoadColorTheme}
                    className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
                  >
                    {t("settings.loadColorTheme")}
                  </Button>
                  <input
                    type="file"
                    ref={rgbFileInputRef}
                    accept=".rgb,.json"
                    onChange={handleRgbFileChange}
                    className="hidden"
                  />
                </div>
              </div>

              <div className="grid gap-2.5 grid-cols-1 md:grid-cols-2">
                {[
                  { key: "primaryAccent", labelKey: "settings.colorPrimary" },
                  { key: "todoTaskText", labelKey: "settings.colorTodoTaskText" },
                  { key: "editorHeading", labelKey: "settings.colorEditorHeading" },
                  { key: "editorLink", labelKey: "settings.colorEditorLink" },
                  { key: "editorInlineCode", labelKey: "settings.colorEditorInlineCode" },
                  { key: "previewInlineCode", labelKey: "settings.colorPreviewInlineCode" },
                  { key: "previewLink", labelKey: "settings.colorPreviewLink" },
                  { key: "previewHeading", labelKey: "settings.colorPreviewHeading" },
                  { key: "changeGutterUnsaved", labelKey: "settings.colorGutterUnsaved" },
                  { key: "changeGutterSaved", labelKey: "settings.colorGutterSaved" }
                ].map((item) => {
                  const colorVal = (accentTheme as any)[item.key] || "#ffffff";
                  return (
                    <div
                      key={item.key}
                      className="p-2.5 bg-slate-900/60 border border-slate-800/80 rounded-lg flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className="w-6 h-6 rounded border border-slate-700 shadow-inner shrink-0 cursor-pointer relative overflow-hidden"
                          style={{ backgroundColor: colorVal }}
                        >
                          <input
                            type="color"
                            value={colorVal}
                            onChange={(e) => applyAccentUpdate({ [item.key]: e.target.value })}
                            className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                          />
                        </div>
                        <span className="text-xs font-semibold text-slate-200 truncate">{t(item.labelKey)}</span>
                      </div>
                      <input
                        type="text"
                        value={colorVal}
                        onChange={(e) => applyAccentUpdate({ [item.key]: e.target.value })}
                        className="bg-[#090d16] text-[11px] font-mono border border-slate-700 rounded px-2 py-0.5 w-20 text-center shrink-0 focus:outline-none"
                        style={{ color: "var(--color-primary-accent)" }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTabKey === "language" && (
            <div className="space-y-4 text-slate-300">
              <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-lg space-y-3">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-white">{t("settings.languageTitle")}</span>
                  <span className="text-[11px] text-slate-400">{t("settings.languageDesc")}</span>
                </div>

                <div className="pt-2 max-w-sm">
                  <Select
                    showSearch
                    value={currentLanguage}
                    onChange={(lang) => {
                      setLanguage(lang);
                      emitTauri("fileditor-language-changed", lang);
                      message.success(t("common.success"));
                    }}
                    placeholder={t("settings.languageSelectPlaceholder")}
                    filterOption={(input, option) => {
                      const label = String(option?.label ?? "");
                      return label.toLowerCase().includes(input.toLowerCase());
                    }}
                    className="w-full bg-[#090d16] text-xs"
                    options={AVAILABLE_LANGUAGES.map((l) => ({
                      value: l.code,
                      label: l.nativeName
                    }))}
                  />
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Footer with Cancel & Save Actions */}
      <footer className="px-5 py-3 bg-[#0b101b] border-t border-slate-800/80 flex items-center justify-end gap-2.5 shrink-0">
        <Button
          onClick={handleCancelClose}
          className="bg-transparent border-slate-700 text-slate-300 hover:text-white text-xs h-8 px-4 rounded-lg"
        >
          {t("settings.cancel") || "Abbrechen"}
        </Button>
        <Button
          type="primary"
          onClick={handleSaveSettings}
          className="border-none font-semibold text-xs h-8 px-5 rounded-lg"
        >
          {t("settings.save")}
        </Button>
      </footer>

      {/* FILE-SPECIFIC SETTINGS MODAL */}
      {activeFileConfigModal && (
        <Modal
          open={true}
          onCancel={() => setActiveFileConfigModal(null)}
          footer={[
            <Button key="ok" type="primary" onClick={() => setActiveFileConfigModal(null)}>
              {t("settings.done")}
            </Button>
          ]}
          title={
            <span className="text-white text-sm font-semibold flex items-center gap-2">
              <Settings size={15} style={{ color: "var(--color-primary-accent)" }} />
              {activeFileConfigModal === "txt" && t("settings.configTextTitle")}
              {activeFileConfigModal === "xml" && t("settings.configXmlTitle")}
              {activeFileConfigModal === "json" && t("settings.configJsonTitle")}
              {activeFileConfigModal === "markdown" && t("settings.configMarkdownTitle")}
              {activeFileConfigModal === "todo" && t("settings.configTodoTitle")}
            </span>
          }
          className="info-modal"
          styles={{
            body: { maxHeight: "65vh", overflowY: "auto" }
          }}
          centered
        >
          <div className="py-3 space-y-4 text-slate-300 font-sans">
            {activeFileConfigModal === "txt" && (
              <div className="p-3.5 bg-slate-900/70 border border-slate-800 rounded-lg text-xs text-slate-400 leading-relaxed">
                {t("settings.configTxtDesc")}
              </div>
            )}
            {activeFileConfigModal === "xml" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 p-3.5 bg-slate-900/60 border border-slate-800 rounded-lg">
                  <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                    {t("settings.defaultViewTitle")}
                    <Tooltip title={t("settings.defaultViewXmlDesc")} mouseEnterDelay={0.1} mouseLeaveDelay={0.2}>
                      <Info size={12} className="text-slate-500 cursor-pointer hover:text-slate-300 shrink-0" />
                    </Tooltip>
                  </span>
                  <Select
                    size="small"
                    value={draftDefaultXmlViewMode}
                    onChange={(val) => setDraftDefaultXmlViewMode(val as JsonXmlViewMode)}
                    className="w-36 font-mono text-xs shrink-0"
                    options={[
                      { value: "column", label: t("views.column") },
                      { value: "tree", label: t("views.tree") },
                      { value: "table", label: t("views.table") }
                    ]}
                  />
                </div>
                <div className="p-3.5 bg-slate-900/70 border border-slate-800 rounded-lg text-xs text-slate-300 leading-relaxed space-y-1.5">
                  <div className="font-semibold text-white">{t("settings.configXmlSchemasTitle")}</div>
                  <p className="text-slate-400">{t("settings.configXmlSchemasDesc")}</p>
                </div>
              </div>
            )}
            {activeFileConfigModal === "json" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 p-3.5 bg-slate-900/60 border border-slate-800 rounded-lg">
                  <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                    {t("settings.defaultViewTitle")}
                    <Tooltip title={t("settings.defaultViewJsonDesc")} mouseEnterDelay={0.1} mouseLeaveDelay={0.2}>
                      <Info size={12} className="text-slate-500 cursor-pointer hover:text-slate-300 shrink-0" />
                    </Tooltip>
                  </span>
                  <Select
                    size="small"
                    value={draftDefaultJsonViewMode}
                    onChange={(val) => setDraftDefaultJsonViewMode(val as JsonXmlViewMode)}
                    className="w-36 font-mono text-xs shrink-0"
                    options={[
                      { value: "column", label: t("views.column") },
                      { value: "tree", label: t("views.tree") },
                      { value: "table", label: t("views.table") }
                    ]}
                  />
                </div>
                <div className="p-3.5 bg-slate-900/70 border border-slate-800 rounded-lg text-xs text-slate-300 leading-relaxed space-y-1.5">
                  <div className="font-semibold text-white">{t("settings.configJsonSchemasTitle")}</div>
                  <p className="text-slate-400">{t("settings.configJsonSchemasDesc")}</p>
                </div>
              </div>
            )}
            {activeFileConfigModal === "markdown" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 p-3.5 bg-slate-900/60 border border-slate-800 rounded-lg">
                  <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                    {t("settings.markdownSyncEditorFromPreviewTitle") || "Editor reagiert auf Live"}
                    <Tooltip title={t("settings.markdownSyncEditorFromPreviewDesc") || "Springt im Editor an die entsprechende Zeile und markiert sie, wenn in der Live-Vorschau geklickt oder markiert wird."} mouseEnterDelay={0.1} mouseLeaveDelay={0.2}>
                      <Info size={12} className="text-slate-500 cursor-pointer hover:text-slate-300 shrink-0" />
                    </Tooltip>
                  </span>
                  <Switch
                    checked={draftSyncEditorFromPreview}
                    onChange={setDraftSyncEditorFromPreview}
                    className="bg-slate-700 shrink-0"
                  />
                </div>
                <div className="flex items-center justify-between gap-3 p-3.5 bg-slate-900/60 border border-slate-800 rounded-lg">
                  <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                    {t("settings.markdownSyncPreviewFromEditorTitle") || "Live reagiert auf Editor"}
                    <Tooltip title={t("settings.markdownSyncPreviewFromEditorDesc") || "Springt in der Live-Vorschau an die entsprechende Stelle und hebt die Zeile hervor, wenn im Editor eine Zeile markiert oder angeklickt wird."} mouseEnterDelay={0.1} mouseLeaveDelay={0.2}>
                      <Info size={12} className="text-slate-500 cursor-pointer hover:text-slate-300 shrink-0" />
                    </Tooltip>
                  </span>
                  <Switch
                    checked={draftSyncPreviewFromEditor}
                    onChange={setDraftSyncPreviewFromEditor}
                    className="bg-slate-700 shrink-0"
                  />
                </div>
                <div className="flex items-center justify-between gap-3 p-3.5 bg-slate-900/60 border border-slate-800 rounded-lg">
                  <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                    {t("settings.markdownAutoNum")}
                    <Tooltip title={t("settings.autoNumDesc")} mouseEnterDelay={0.1} mouseLeaveDelay={0.2}>
                      <Info size={12} className="text-slate-500 cursor-pointer hover:text-slate-300 shrink-0" />
                    </Tooltip>
                  </span>
                  <Switch
                    checked={draftMarkdownAutoNum}
                    onChange={setDraftMarkdownAutoNum}
                    className="bg-slate-700 shrink-0"
                  />
                </div>
                <div className="flex items-center justify-between gap-3 p-3.5 bg-slate-900/60 border border-slate-800 rounded-lg">
                  <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                    {t("settings.markdownPreserveNum")}
                    <Tooltip title={t("settings.preserveNumDesc")} mouseEnterDelay={0.1} mouseLeaveDelay={0.2}>
                      <Info size={12} className="text-slate-500 cursor-pointer hover:text-slate-300 shrink-0" />
                    </Tooltip>
                  </span>
                  <Switch
                    checked={draftMarkdownPreserveNum}
                    onChange={setDraftMarkdownPreserveNum}
                    className="bg-slate-700 shrink-0"
                  />
                </div>
                <div className="flex items-center justify-between gap-3 p-3.5 bg-slate-900/60 border border-slate-800 rounded-lg">
                  <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                    {t("settings.markdownRememberViewState") || "Vollbild & Scrollposition je Datei merken"}
                    <Tooltip title={t("settings.markdownRememberViewStateDesc") || "Merkt sich Vollbildmodus und die genaue Scrollposition individuell für jedes Markdown-Dokument."} mouseEnterDelay={0.1} mouseLeaveDelay={0.2}>
                      <Info size={12} className="text-slate-500 cursor-pointer hover:text-slate-300 shrink-0" />
                    </Tooltip>
                  </span>
                  <Switch
                    checked={draftMarkdownRememberViewState}
                    onChange={setDraftMarkdownRememberViewState}
                    className="bg-slate-700 shrink-0"
                  />
                </div>
              </div>
            )}
            {activeFileConfigModal === "todo" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 p-3.5 bg-slate-900/60 border border-slate-800 rounded-lg">
                  <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                    {t("settings.todoHideCompletedTitle")}
                    <Tooltip title={t("settings.todoHideCompletedDesc")} mouseEnterDelay={0.1} mouseLeaveDelay={0.2}>
                      <Info size={12} className="text-slate-500 cursor-pointer hover:text-slate-300 shrink-0" />
                    </Tooltip>
                  </span>
                  <Switch
                    checked={draftTodoHideCompleted}
                    onChange={setDraftTodoHideCompleted}
                    className="bg-slate-700 shrink-0"
                  />
                </div>
                <div className="flex items-center justify-between gap-3 p-3.5 bg-slate-900/60 border border-slate-800 rounded-lg">
                  <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                    {t("settings.todoCascadingIndent") || "Kaskadierende Einrückung (Kindelemente folgen)"}
                    <Tooltip title={t("settings.todoCascadingIndentDesc") || "Beim Ein- oder Ausrücken (Tab / Shift+Tab) werden alle untergeordneten Zeilen automatisch relativ mitverschoben."} mouseEnterDelay={0.1} mouseLeaveDelay={0.2}>
                      <Info size={12} className="text-slate-500 cursor-pointer hover:text-slate-300 shrink-0" />
                    </Tooltip>
                  </span>
                  <Switch
                    checked={draftTodoCascadingIndent}
                    onChange={setDraftTodoCascadingIndent}
                    className="bg-slate-700 shrink-0"
                  />
                </div>
                <div className="flex items-center justify-between gap-3 p-3.5 bg-slate-900/60 border border-slate-800 rounded-lg">
                  <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                    {t("settings.todoAutoChild")}
                    <Tooltip title={t("settings.autoCompleteChildrenDesc")} mouseEnterDelay={0.1} mouseLeaveDelay={0.2}>
                      <Info size={12} className="text-slate-500 cursor-pointer hover:text-slate-300 shrink-0" />
                    </Tooltip>
                  </span>
                  <Switch
                    checked={draftTodoAutoCompleteChildren}
                    onChange={setDraftTodoAutoCompleteChildren}
                    className="bg-slate-700 shrink-0"
                  />
                </div>
                <div className="flex items-center justify-between gap-3 p-3.5 bg-slate-900/60 border border-slate-800 rounded-lg">
                  <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                    {t("settings.todoAutoCollapse")}
                    <Tooltip title={t("settings.autoCollapseParentDesc")} mouseEnterDelay={0.1} mouseLeaveDelay={0.2}>
                      <Info size={12} className="text-slate-500 cursor-pointer hover:text-slate-300 shrink-0" />
                    </Tooltip>
                  </span>
                  <Switch
                    checked={draftTodoAutoCollapseParent}
                    onChange={setDraftTodoAutoCollapseParent}
                    className="bg-slate-700 shrink-0"
                  />
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* CONFIRM CLOSE DIALOG FOR UNSAVED SETTINGS */}
      {showConfirmClose && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 select-none">
          <div className="bg-[#0f172a] border border-slate-800 rounded-xl shadow-2xl p-6 max-w-sm w-full space-y-4">
            <h3 className="text-sm font-bold text-white">{t("settings.unsavedTitle") || "Ungespeicherte Änderungen"}</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              {t("settings.unsavedDesc") || "Du hast ungespeicherte Änderungen. Sollen diese verworfen werden?"}
            </p>
            <div className="flex flex-col space-y-2 pt-2">
              <Button
                size="small"
                danger
                autoFocus
                onClick={async () => {
                  setShowConfirmClose(false);
                  if (isNativeWindow) {
                    await invokeTauriSafe("set_settings_dirty", { dirty: false });
                  }
                  onClose();
                }}
                className="text-xs py-1.5 h-8 font-semibold"
              >
                {t("settings.discardAndClose") || "Ja (Verwerfen)"}
              </Button>
              <Button
                size="small"
                onClick={() => setShowConfirmClose(false)}
                className="bg-transparent border-slate-800 text-slate-300 hover:text-white text-xs py-1.5 h-8"
              >
                {t("settings.backToSettings") || "Zurück"}
              </Button>
              <Button
                type="primary"
                size="small"
                onClick={() => {
                  setShowConfirmClose(false);
                  handleSaveSettings();
                }}
                className="border-none font-semibold text-xs py-1.5 h-8"
              >
                {t("settings.save") || "Speichern"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Standalone entry component rendered inside the native OS "settings" Tauri WebviewWindow.
 */
export const SettingsWindowApp: React.FC = () => {
  const accentTheme = useFileStore((s) => s.accentTheme);
  const { t } = useTranslation();
  const [confirmTick, setConfirmTick] = useState(0);

  const handleClose = () => {
    invokeTauriSafe("close_current_window");
  };

  const lastSentDirtyRef = useRef<boolean | null>(null);

  useEffect(() => {
    const title = t("settings.title");
    document.title = title;
    invokeTauriSafe("set_window_title", { title });
  }, [t]);

  useEffect(() => {
    let disposed = false;
    let unlistenConfirm: (() => void) | null = null;
    let unlistenTheme: (() => void) | null = null;
    let unlistenLang: (() => void) | null = null;

    const setupListeners = async () => {
      const u1 = await listenTauri("settings-confirm-close", () => {
        setConfirmTick((c) => c + 1);
      });
      if (u1) {
        if (disposed) u1();
        else unlistenConfirm = u1;
      }

      const u2 = await listenTauri<any>("fileditor-accent-theme-changed", (payload) => {
        if (payload) {
          useFileStore.getState().setAccentTheme(payload);
        }
      });
      if (u2) {
        if (disposed) u2();
        else unlistenTheme = u2;
      }

      const u3 = await listenTauri<string>("fileditor-language-changed", (payload) => {
        if (typeof payload === "string") {
          useI18nStore.getState().setLanguage(payload);
        }
      });
      if (u3) {
        if (disposed) u3();
        else unlistenLang = u3;
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

    window.addEventListener("storage", handleStorage);
    return () => {
      disposed = true;
      if (unlistenConfirm) unlistenConfirm();
      if (unlistenTheme) unlistenTheme();
      if (unlistenLang) unlistenLang();
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const handleDirtyChange = useCallback((dirty: boolean) => {
    if (lastSentDirtyRef.current !== dirty) {
      lastSentDirtyRef.current = dirty;
      invokeTauriSafe("set_settings_dirty", { dirty });
    }
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
      <div className="h-screen w-screen overflow-hidden bg-[#090d16]">
        <SettingsContent
          isOpen={true}
          onClose={handleClose}
          isNativeWindow={true}
          onDirtyChange={handleDirtyChange}
          externalConfirmCloseTick={confirmTick}
        />
      </div>
    </ConfigProvider>
  );
};

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * Browser-only fallback modal for environments without Tauri native windows.
 */
export const SettingsModal: React.FC<SettingsModalProps> = ({ visible, onClose }) => {
  const { t } = useTranslation();
  const [confirmTick, setConfirmTick] = useState(0);
  const isDirtyRef = useRef(false);

  return (
    <Modal
      title={
        <div className="flex items-center gap-2 text-white font-semibold">
          <Settings size={16} style={{ color: "var(--color-primary-accent)" }} />
          <span>{t("settings.title")}</span>
        </div>
      }
      open={visible}
      onCancel={() => {
        if (isDirtyRef.current) {
          setConfirmTick((c) => c + 1);
        } else {
          onClose();
        }
      }}
      footer={null}
      width={860}
      style={{ maxWidth: "96vw" }}
      centered
      styles={{
        content: {
          padding: 0,
          background: "#090d16",
          border: "1px solid #1e293b",
          borderRadius: "14px",
          height: 640,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden"
        },
        header: {
          background: "#090d16",
          padding: "14px 20px",
          borderBottom: "1px solid rgba(51, 65, 85, 0.4)",
          marginBottom: 0
        },
        body: {
          padding: 0,
          background: "#090d16",
          flex: "1 1 0%",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden"
        }
      }}
    >
      <SettingsContent
        isOpen={visible}
        onClose={onClose}
        isNativeWindow={false}
        onDirtyChange={(dirty) => {
          isDirtyRef.current = dirty;
        }}
        externalConfirmCloseTick={confirmTick}
      />
    </Modal>
  );
};
