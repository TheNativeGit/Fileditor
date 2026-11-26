import { create } from "zustand";
import { message } from "antd";
import { t } from "../i18n";
import { validateJSON, ValidationError, JsonSchemaDialect, XmlSchemaDialect } from "../utils/schemaValidator";
import { xmlStringToJsObject, jsObjectToXmlString, extractXmlDeclaration } from "../utils/xmlConverter";
import { logger } from "../utils/logger";
import { parseTodoTxtContent } from "../utils/todoTxtParser";
import { normalizeFilePath } from "../utils/todoLinkParser";
import { useToDoStore } from "./useToDoStore";
import { invokeTauriSafe } from "../utils/tauriBridge";


export type JsonXmlViewMode = "column" | "tree" | "table";

const parseViewMode = (val: string | null): JsonXmlViewMode => {
  if (val === "tree" || val === "table" || val === "column") return val;
  return "column";
};

export interface AccentTheme {
  primaryAccent: string;
  editorHeading: string;
  editorLink: string;
  editorInlineCode: string;
  previewInlineCode: string;
  previewLink: string;
  previewHeading: string;
  todoTaskText: string;
  changeGutterUnsaved: string;
  changeGutterSaved: string;
}

export const DEFAULT_ACCENT_THEME: AccentTheme = {
  primaryAccent: "#a855f7",
  editorHeading: "#a78bfa",
  editorLink: "#10b981",
  editorInlineCode: "#3b82f6",
  previewInlineCode: "#fb7185",
  previewLink: "#c084fc",
  previewHeading: "#f1f5f9",
  todoTaskText: "#e2e8f0",
  changeGutterUnsaved: "#f97316",
  changeGutterSaved: "#22c55e"
};

const hexToRgbTuple = (hex: string): string => {
  const clean = (hex || "#a855f7").replace("#", "").trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return `${r}, ${g}, ${b}`;
  }
  if (clean.length >= 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
      return `${r}, ${g}, ${b}`;
    }
  }
  return "168, 85, 247";
};

export const applyAccentThemeToCss = (theme: AccentTheme) => {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--color-primary-accent", theme.primaryAccent);
  root.style.setProperty("--color-primary-accent-rgb", hexToRgbTuple(theme.primaryAccent));
  root.style.setProperty("--color-editor-heading", theme.editorHeading);
  root.style.setProperty("--color-editor-link", theme.editorLink);
  root.style.setProperty("--color-editor-inline-code", theme.editorInlineCode);
  root.style.setProperty("--color-preview-inline-code", theme.previewInlineCode);
  root.style.setProperty("--color-preview-link", theme.previewLink);
  root.style.setProperty("--color-preview-heading", theme.previewHeading);
  root.style.setProperty("--color-todo-task-text", theme.todoTaskText || DEFAULT_ACCENT_THEME.todoTaskText);
  root.style.setProperty("--color-gutter-unsaved", theme.changeGutterUnsaved);
  root.style.setProperty("--color-gutter-saved", theme.changeGutterSaved);

  window.dispatchEvent(new CustomEvent("accent-theme-changed", { detail: theme }));
};

export interface DiscardedBackupTab {
  backupId: string;
  originalTabId: string;
  title: string;
  originalPath: string | null;
  content: string;
  type: "json" | "xml" | "markdown" | "todo" | "txt";
  discardedAt: number;
}

export interface Tab {
  id: string;
  path: string | null;
  title: string;
  content: string;
  lastSavedContent: string;
  lastModifiedTime: number | null;
  pinned?: boolean;
  type?: "json" | "xml" | "markdown" | "todo" | "txt";
  initialContent?: string;
  isNewUntouched?: boolean;
  schemaTabId?: string | null;
  schemaDialect?: string;
}

interface HistoryState {
  jsonString: string;
  schemaString: string;
}

interface FileStore {
  // Global Mode
  mode: "json" | "xml" | "markdown" | "todo" | "txt";
  setMode: (mode: "json" | "xml" | "markdown" | "todo" | "txt") => void;

  // Active States (swapped between JSON, XML and Markdown values based on mode)
  jsonString: string;
  jsonValue: any;
  hasSyntaxError: boolean;
  schemaString: string;
  schemaValue: any;
  isValid: boolean;
  validationErrors: ValidationError[];
  isSchemaEnabled: boolean;

  // Active Tabs System
  jsonTabs: Tab[];
  activeJsonTabId: string | null;
  schemaTabs: Tab[];
  activeSchemaTabId: string | null;
  recentJsonFiles: string[];
  recentSchemaFiles: string[];

  // Active History (per tab)
  history: HistoryState[];
  historyIndex: number;
  tabHistories: Record<string, { history: HistoryState[]; historyIndex: number }>;

  // View settings (independent of mode or swapped)
  viewMode: JsonXmlViewMode;
  defaultJsonViewMode: JsonXmlViewMode;
  defaultXmlViewMode: JsonXmlViewMode;
  setDefaultJsonViewMode: (val: JsonXmlViewMode) => void;
  setDefaultXmlViewMode: (val: JsonXmlViewMode) => void;
  activePath: (string | number)[];
  isRightPaneFullscreen: boolean;
  setRightPaneFullscreen: (fullscreen: boolean) => void;

  // Settings properties
  dateSupport: boolean;
  docusaurusSupport: boolean;
  fullscreenMarkdownWidth: string;
  fullscreenMarkdownZoom: number;
  customHotkeys: Record<string, string>;
  isGraphViewOpen: boolean;
  setGraphViewOpen: (open: boolean) => void;
  setDateSupport: (val: boolean) => void;
  setDocusaurusSupport: (val: boolean) => void;
  setFullscreenMarkdownWidth: (val: string) => void;
  setFullscreenMarkdownZoom: (val: number) => void;
  setCustomHotkey: (action: string, shortcut: string) => void;

  // File Behavior Settings
  markdownAutoNumbering: boolean;
  markdownPreserveNumbering: boolean;
  markdownSyncEditorFromPreview: boolean;
  markdownSyncPreviewFromEditor: boolean;
  todoAutoCompleteChildren: boolean;
  todoAutoCollapseParentOnComplete: boolean;
  todoHideCompleted: boolean;
  setMarkdownAutoNumbering: (val: boolean) => void;
  setMarkdownPreserveNumbering: (val: boolean) => void;
  setMarkdownSyncEditorFromPreview: (val: boolean) => void;
  setMarkdownSyncPreviewFromEditor: (val: boolean) => void;
  setTodoAutoCompleteChildren: (val: boolean) => void;
  setTodoAutoCollapseParentOnComplete: (val: boolean) => void;
  setTodoHideCompleted: (val: boolean) => void;

  // Multi-Schema Dialect & Per-File Schema Binding
  jsonSchemaDialect: JsonSchemaDialect;
  xmlSchemaDialect: XmlSchemaDialect;
  setSchemaDialect: (dialect: string) => void;
  assignSchemaToActiveFile: (schemaTabId: string | null) => void;

  // Text Editor Settings & Enabled File Types
  txtWordWrap: boolean;
  txtLineNumbers: boolean;
  txtShowWhitespace: boolean;
  txtMinimap: boolean;
  txtLineEndings: "crlf" | "lf";
  txtEncoding: "utf8" | "utf8bom" | "ansi" | "utf16le" | "iso88591";
  cursorPos: { line: number; col: number };
  setCursorPos: (pos: { line: number; col: number }) => void;
  enabledFileTypes: { xml: boolean; json: boolean; markdown: boolean; todo: boolean; txt: true };
  setTxtWordWrap: (val: boolean) => void;
  setTxtLineNumbers: (val: boolean) => void;
  setTxtShowWhitespace: (val: boolean) => void;
  setTxtMinimap: (val: boolean) => void;
  setTxtLineEndings: (val: "crlf" | "lf") => void;
  setTxtEncoding: (val: "utf8" | "utf8bom" | "ansi" | "utf16le" | "iso88591") => void;
  setEnabledFileTypes: (types: { xml: boolean; json: boolean; markdown: boolean; todo: boolean; txt: true }) => void;

  tabViewStates: Record<string, { scrollTop?: number; scrollLeft?: number; isFullscreen?: boolean; fullscreenWidth?: string; fullscreenZoom?: number; hideCompleted?: boolean; viewMode?: JsonXmlViewMode }>;
  setTabViewStates: (pathOrId: string, state: { scrollTop?: number; scrollLeft?: number; isFullscreen?: boolean; fullscreenWidth?: string; fullscreenZoom?: number; hideCompleted?: boolean; viewMode?: JsonXmlViewMode }) => void;

  // New settings in v0.9.0+
  autoCheckUpdates: boolean;
  setAutoCheckUpdates: (enabled: boolean) => void;
  graphEnabled: boolean;
  setGraphEnabled: (enabled: boolean) => void;
  backupRetentionDays: number;
  setBackupRetentionDays: (days: number) => void;
  cleanupExpiredBackups: () => void;
  markdownRememberViewState: boolean;
  setMarkdownRememberViewState: (enabled: boolean) => void;
    backupTabsFromInstance: (tabs: Tab[]) => void;
  accentTheme: AccentTheme;
  setAccentTheme: (theme: Partial<AccentTheme>) => void;
  resetAccentTheme: () => void;

  // Actions
  setJsonString: (str: string, debounce?: boolean) => void;
  setSchemaString: (str: string, debounce?: boolean) => void;
  updateJsonValue: (newValue: any) => void;
  undo: () => void;
  redo: () => void;
  setViewMode: (mode: "column" | "tree" | "table") => void;
  setActivePath: (path: (string | number)[]) => void;
  pushToHistory: (jsonStr: string, schemaStr: string) => void;
  initialize: (initialJson: string, initialSchema: string, initialXml: string, initialXmlSchema: string, initialMarkdown: string, isIsolated?: boolean) => Promise<void>;
  setSchemaEnabled: (enabled: boolean) => void;
  saveAll: () => Promise<boolean>;
  runValidation: (content: string, targetMode: "json" | "xml" | "markdown" | "todo" | "txt") => void;

  // Session Backup & Restore
  discardedBackups: DiscardedBackupTab[];
  restoreDiscardedBackup: (backupId: string) => void;
  clearDiscardedBackups: () => void;

  // Tab Actions (dynamically handle storage keys based on mode)
  setActiveJsonTab: (tabId: string | null, targetListId?: string) => void;
  setActiveSchemaTab: (tabId: string | null) => void;
  addJsonTab: (path?: string | null, content?: string, type?: "json" | "xml" | "markdown" | "todo" | "txt" | null) => void;
  addSchemaTab: (path?: string | null, content?: string) => void;
  closeJsonTab: (tabId: string) => void;
  closeSchemaTab: (tabId: string) => void;
  moveJsonTab: (fromIndex: number, toIndex: number) => void;
  moveSchemaTab: (fromIndex: number, toIndex: number) => void;
  saveJsonTab: (tabId?: string | null, path?: string | null, forceDialog?: boolean) => Promise<boolean>;
  saveSchemaTab: (tabId?: string | null, path?: string | null, forceDialog?: boolean) => Promise<boolean>;
  openJsonFile: (path: string, targetListId?: string) => Promise<void>;
  openSchemaFile: (path: string) => Promise<void>;
  addRecentJsonFile: (path: string) => void;
  addRecentSchemaFile: (path: string) => void;
  clearRecentJsonFiles: () => void;
  clearRecentSchemaFiles: () => void;
  closeMultipleJsonTabs: (tabIds: string[]) => void;
  closeMultipleSchemaTabs: (tabIds: string[]) => void;
  togglePinJsonTab: (tabId: string) => void;
  togglePinSchemaTab: (tabId: string) => void;
  updateTabContent: (tabId: string, content: string) => void;
  updateTabTitle: (tabId: string, title: string) => void;
}

let debounceTimer: any = null;
let historyDebounceTimer: any = null;
let validationEpoch = 0;

export const getFileNameFromPath = (path: string) => {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || "Unbenannt";
};

export const extractMarkdownTitle = (content: string): string | null => {
  if (!content) return null;
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("# ")) {
      const rawTitle = trimmed.substring(2).trim();
      const sanitized = rawTitle.replace(/[\\/:*?"<>|]/g, "").trim();
      if (sanitized) return sanitized;
    }
  }
  return null;
};

export const getTabMode = (tab: Tab): "json" | "xml" | "markdown" | "todo" | "txt" => {
  if (tab.type) return tab.type;
  const pathOrTitle = (tab.path || tab.title).toLowerCase();
  if (pathOrTitle.endsWith(".todo") || pathOrTitle.endsWith(".todo.json")) {
    return "todo";
  }
  if (pathOrTitle.endsWith(".md") || pathOrTitle.endsWith(".markdown")) {
    return "markdown";
  }
  if (pathOrTitle.endsWith(".xml")) {
    return "xml";
  }
  if (pathOrTitle.endsWith(".json")) {
    return "json";
  }
  if (pathOrTitle.endsWith(".txt") || pathOrTitle.endsWith(".text") || pathOrTitle.endsWith(".log")) {
    return "txt";
  }
  return "txt";
};

const invokeTauri = async (cmd: string, args: any = {}) => {
  return await invokeTauriSafe(cmd, args);
};

const stripLegacyDefaultSchemaTabs = (tabs: Tab[]): Tab[] =>
  tabs.filter(
    (st) =>
      !(
        !st.path &&
        (st.id === "schema_default" ||
          st.id === "xml_schema_default" ||
          st.title === "Beispiel.schema.json" ||
          st.title === "Beispiel.xsd")
      )
  );

export const getActiveInstanceCount = (): number => {
  const now = Date.now();
  let count = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("fileditor_heartbeat_")) {
        const val = localStorage.getItem(key);
        if (val) {
          const timestamp = parseInt(val, 10);
          if (now - timestamp < 4000) {
            count++;
          }
        }
      }
    }
  } catch {}
  return Math.max(count, 1);
};

export const checkAndCloseIfSecondaryInstance = async () => {
  const { jsonTabs } = useFileStore.getState();
  if (jsonTabs.length === 0) {
    const activeInstances = getActiveInstanceCount();
    logger.info("Window", `jsonTabs is 0. Active instances detected: ${activeInstances}`);
    if (activeInstances > 1) {
      logger.info("Window", "Multiple instances active and this instance has 0 files. Closing current instance window.");
      const myInstanceId = (window as any).__FILEDITOR_INSTANCE_ID__;
      if (myInstanceId) {
        localStorage.removeItem(`fileditor_heartbeat_${myInstanceId}`);
        localStorage.removeItem(`fileditor_instance_rect_${myInstanceId}`);
      }
      await invokeTauri("close_current_window");
    }
  }
};

// XML Schema (XSD / DTD / RelaxNG / Schematron) validation helper invoking Rust backend
const validateXml = async (
  xml: string,
  xsd: string,
  isSchemaEnabled: boolean,
  schemaFormat: XmlSchemaDialect = "auto"
) => {
  if (!xml.trim()) {
    return { isValid: true, errors: [] };
  }
  try {
    const result = await invokeTauri("validate_xml_schema", {
      xml,
      xsd: isSchemaEnabled ? xsd : "",
      schemaFormat
    });

    if (result === null) {
      return {
        isValid: true,
        errors: []
      };
    }

    const errors = result as ValidationError[];
    return {
      isValid: errors.length === 0,
      errors
    };
  } catch (err: any) {
    return {
      isValid: false,
      errors: [{ path: "XML Schema", message: `Fehler beim Validieren: ${err}` }]
    };
  }
};

const getStorageKeys = (mode: "json" | "xml" | "markdown" | "todo" | "txt") => {
  const tabsKey = "fileditor_unified_tabs";
  const activeTabIdKey = "fileditor_active_tab_id";
  if (mode === "json") {
    return {
      tabs: tabsKey,
      activeTabId: activeTabIdKey,
      schemaTabs: "fileditor_saved_schema_tabs",
      activeSchemaTabId: "fileditor_active_schema_tab_id",
      recentFiles: "fileditor_recent_json_files",
      recentSchemaFiles: "fileditor_recent_schema_files"
    };
  } else if (mode === "xml") {
    return {
      tabs: tabsKey,
      activeTabId: activeTabIdKey,
      schemaTabs: "fileditor_saved_xml_schema_tabs",
      activeSchemaTabId: "fileditor_active_xml_schema_tab_id",
      recentFiles: "fileditor_recent_xml_files",
      recentSchemaFiles: "fileditor_recent_xml_schema_files"
    };
  } else if (mode === "todo") {
    return {
      tabs: tabsKey,
      activeTabId: activeTabIdKey,
      schemaTabs: "fileditor_saved_todo_schema_tabs",
      activeSchemaTabId: "fileditor_active_todo_schema_tab_id",
      recentFiles: "fileditor_recent_todo_files",
      recentSchemaFiles: "fileditor_recent_todo_schema_files"
    };
  } else if (mode === "txt") {
    return {
      tabs: tabsKey,
      activeTabId: activeTabIdKey,
      schemaTabs: "fileditor_saved_txt_schema_tabs",
      activeSchemaTabId: "fileditor_active_txt_schema_tab_id",
      recentFiles: "fileditor_recent_txt_files",
      recentSchemaFiles: "fileditor_recent_txt_schema_files"
    };
  } else {
    return {
      tabs: tabsKey,
      activeTabId: activeTabIdKey,
      schemaTabs: "fileditor_saved_markdown_schema_tabs",
      activeSchemaTabId: "fileditor_active_markdown_schema_tab_id",
      recentFiles: "fileditor_recent_markdown_files",
      recentSchemaFiles: "fileditor_recent_markdown_schema_files"
    };
  }
};

const loadEnabledFileTypes = () => {
  try {
    const saved = localStorage.getItem("fileditor_enabled_file_types");
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        xml: parsed.xml ?? true,
        json: parsed.json ?? true,
        markdown: parsed.markdown ?? true,
        todo: parsed.todo ?? true,
        txt: true as const
      };
    }
  } catch (e) {}
  return { xml: true, json: true, markdown: true, todo: true, txt: true as const };
};

export const useFileStore = create<FileStore>((set, get) => ({
  mode: "json",

  accentTheme: (() => {
    try {
      const saved = localStorage.getItem("fileditor_accent_theme");
      const parsed = saved ? JSON.parse(saved) : {};
      const merged = { ...DEFAULT_ACCENT_THEME, ...parsed };
      applyAccentThemeToCss(merged);
      return merged;
    } catch {
      applyAccentThemeToCss(DEFAULT_ACCENT_THEME);
      return DEFAULT_ACCENT_THEME;
    }
  })(),
  setAccentTheme: (partialTheme) => {
    const current = get().accentTheme;
    const updated = { ...current, ...partialTheme };
    try {
      localStorage.setItem("fileditor_accent_theme", JSON.stringify(updated));
    } catch {}
    applyAccentThemeToCss(updated);
    set({ accentTheme: updated });
  },
  resetAccentTheme: () => {
    try {
      localStorage.setItem("fileditor_accent_theme", JSON.stringify(DEFAULT_ACCENT_THEME));
    } catch {}
    applyAccentThemeToCss(DEFAULT_ACCENT_THEME);
    set({ accentTheme: DEFAULT_ACCENT_THEME });
  },
  
  // Active state placeholders
  jsonString: "",
  jsonValue: null,
  hasSyntaxError: false,
  schemaString: "",
  schemaValue: null,
  isValid: true,
  validationErrors: [],
  isSchemaEnabled: false,
  jsonTabs: [],
  activeJsonTabId: null,
  schemaTabs: [],
  activeSchemaTabId: null,
  recentJsonFiles: [],
  recentSchemaFiles: [],
  history: [],
  historyIndex: -1,
  tabHistories: {},

  isGraphViewOpen: false,
  setGraphViewOpen: (open) => set({ isGraphViewOpen: open }),

  jsonSchemaDialect: "auto",
  xmlSchemaDialect: "auto",

  // Text Editor Settings & Enabled File Types
  txtWordWrap: true,
  txtLineNumbers: true,
  txtShowWhitespace: false,
  txtMinimap: true,
  txtLineEndings: "crlf",
  txtEncoding: "utf8",
  cursorPos: { line: 1, col: 1 },
  setCursorPos: (pos) => set({ cursorPos: pos }),
  enabledFileTypes: loadEnabledFileTypes(),

  setTxtWordWrap: (val) => set({ txtWordWrap: val }),
  setTxtLineNumbers: (val) => set({ txtLineNumbers: val }),
  setTxtShowWhitespace: (val) => set({ txtShowWhitespace: val }),
  setTxtMinimap: (val) => set({ txtMinimap: val }),
  setTxtLineEndings: (val) => set({ txtLineEndings: val }),
  setTxtEncoding: (val) => set({ txtEncoding: val }),
  setEnabledFileTypes: (types) => {
    localStorage.setItem("fileditor_enabled_file_types", JSON.stringify(types));
    set({ enabledFileTypes: types });
  },

  tabViewStates: (() => {
    try {
      const saved = localStorage.getItem("fileditor_tab_view_states");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  })(),
  setTabViewStates: (pathOrId, viewState) => {
    if (!pathOrId) return;
    const current = get().tabViewStates[pathOrId] || {};
    const updated = {
      ...get().tabViewStates,
      [pathOrId]: { ...current, ...viewState }
    };
    set({ tabViewStates: updated });
    try {
      localStorage.setItem("fileditor_tab_view_states", JSON.stringify(updated));
    } catch {}
  },
  
  // Settings in v0.9.0+
  autoCheckUpdates: localStorage.getItem("fileditor_auto_check_updates") === "true",
  setAutoCheckUpdates: (enabled) => {
    localStorage.setItem("fileditor_auto_check_updates", String(enabled));
    set({ autoCheckUpdates: enabled });
  },
  graphEnabled: localStorage.getItem("fileditor_graph_enabled") !== "false",
  setGraphEnabled: (enabled) => {
    localStorage.setItem("fileditor_graph_enabled", String(enabled));
    set({ graphEnabled: enabled });
  },

  backupRetentionDays: (() => {
    const v = localStorage.getItem("fileditor_backup_retention_days");
    return v !== null ? parseInt(v, 10) : 7;
  })(),
  setBackupRetentionDays: (days) => {
    localStorage.setItem("fileditor_backup_retention_days", String(days));
    set({ backupRetentionDays: days });
    get().cleanupExpiredBackups();
  },

  cleanupExpiredBackups: () => {
    const { backupRetentionDays } = get();
    try {
      if (backupRetentionDays === 0) {
        localStorage.removeItem("fileditor_persistent_backups");
        set({ discardedBackups: [] });
        return;
      }
      const saved = localStorage.getItem("fileditor_persistent_backups");
      if (!saved) return;
      const backups: DiscardedBackupTab[] = JSON.parse(saved);
      let filtered = backups;
      if (backupRetentionDays > 0) {
        const cutoff = Date.now() - backupRetentionDays * 86400000;
        filtered = backups.filter(b => b.discardedAt >= cutoff);
      }
      filtered = filtered.slice(0, 50);
      localStorage.setItem("fileditor_persistent_backups", JSON.stringify(filtered));
      set({ discardedBackups: filtered });
    } catch (err) {
      console.error("FileStore cleanupExpiredBackups error:", err);
    }
  },

  markdownRememberViewState: localStorage.getItem("fileditor_md_remember_view_state") !== "false",
  setMarkdownRememberViewState: (enabled) => {
    localStorage.setItem("fileditor_md_remember_view_state", String(enabled));
    set({ markdownRememberViewState: enabled });
  },

  backupTabsFromInstance: (tabs) => {
    const { backupRetentionDays, discardedBackups } = get();
    if (backupRetentionDays === 0 || !tabs || tabs.length === 0) return;
    try {
      const validTabs = tabs.filter(t => t.content && t.content.trim().length > 0);
      if (validTabs.length === 0) return;

      const newBackups: DiscardedBackupTab[] = validTabs.map(t => ({
        backupId: `backup_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        originalTabId: t.id,
        title: t.title,
        originalPath: t.path,
        content: t.content,
        type: getTabMode(t),
        discardedAt: Date.now()
      }));

      const merged = [...newBackups, ...discardedBackups];
      const unique = merged.filter((item, idx, self) => idx === self.findIndex(t => t.title === item.title && t.content === item.content));
      const sliced = unique.slice(0, 50);
      localStorage.setItem("fileditor_persistent_backups", JSON.stringify(sliced));
      set({ discardedBackups: sliced });
    } catch (err) {
      console.error("backupTabsFromInstance error:", err);
    }
  },

  // Session Backup & Restore
  discardedBackups: (() => {
    try {
      const saved = localStorage.getItem("fileditor_persistent_backups");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  })(),

  /**
   * Stellt eine verworfene oder ungespeicherte Datei aus dem Arbeitsspeicher-Backup wieder her.
   * Lädt die Datei stets als entkoppelte Kopie (`[Kopie] Dateiname`, `path: null`), um bestehende Dateipfade zu schützen.
   *
   * @param backupId - Eindeutige Kennung des Wiederherstellungs-Snapshots.
   */
  restoreDiscardedBackup: (backupId) => {
    const { discardedBackups, jsonTabs, backupRetentionDays } = get();
    const backup = discardedBackups.find(b => b.backupId === backupId);
    if (!backup) {
      console.warn("FileStore", `Restore failed: backupId="${backupId}" not found`);
      return;
    }

    const tabType = backup.type || "json";
    const prefix = tabType === "todo" ? "todo_" : tabType === "json" ? "json_" : tabType === "xml" ? "xml_" : "md_";
    const newTabId = prefix + Date.now() + Math.random().toString(36).substring(2, 5);
    const copyTitle = backup.title.startsWith("[Kopie]") ? backup.title : `[Kopie] ${backup.title}`;

    const newTab: Tab = {
      id: newTabId,
      path: null, // Detached copy as explicitly requested!
      title: copyTitle,
      content: backup.content,
      lastSavedContent: "", // mark unsaved
      lastModifiedTime: null,
      type: tabType
    };

    const updatedTabs = [...jsonTabs, newTab];
    const updatedBackups = discardedBackups.filter(b => b.backupId !== backupId);

    set({ jsonTabs: updatedTabs, discardedBackups: updatedBackups });
    localStorage.setItem("fileditor_unified_tabs", JSON.stringify(updatedTabs));
    if (backupRetentionDays !== 0) {
      localStorage.setItem("fileditor_persistent_backups", JSON.stringify(updatedBackups));
    }

    console.info("FileStore", `Restored discarded backup as detached copy: title="${copyTitle}", newTabId="${newTabId}"`);
    get().setActiveJsonTab(newTabId);
  },
  clearDiscardedBackups: () => {
    set({ discardedBackups: [] });
    localStorage.removeItem("fileditor_persistent_backups");
    console.info("FileStore", "Cleared discarded backups memory and storage");
  },

  dateSupport: localStorage.getItem("fileditor_settings_date_support") !== "false",
  docusaurusSupport: localStorage.getItem("fileditor_settings_docusaurus_support") !== "false",
  fullscreenMarkdownWidth: localStorage.getItem("fileditor_settings_fs_md_width") || "1200px",
  fullscreenMarkdownZoom: parseInt(localStorage.getItem("fileditor_settings_fs_md_zoom") || "140", 10),
  customHotkeys: (() => {
    try {
      const saved = localStorage.getItem("fileditor_settings_custom_hotkeys");
      if (saved) {
        const parsed = JSON.parse(saved);
        // Ensure v7.1.0 shortcuts are updated if old defaults existed
        if (parsed.saveAs === "Ctrl+Shift+S" && !parsed.saveAll) {
          parsed.saveAll = "Ctrl+Shift+S";
          parsed.saveAs = "Ctrl+Alt+S";
        }
        if (parsed.strikethrough === "Ctrl+Shift+S") {
          parsed.strikethrough = "Ctrl+Shift+X";
        }
        return parsed;
      }
    } catch(e) {}
    return {
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
  })(),

  // File Behavior Settings State & Setters
  markdownAutoNumbering: localStorage.getItem("fileditor_setting_md_autonumber") !== "false",
  markdownPreserveNumbering: localStorage.getItem("fileditor_setting_md_preserve_num") !== "false",
  markdownSyncEditorFromPreview: localStorage.getItem("fileditor_setting_md_sync_editor_from_preview") !== "false",
  markdownSyncPreviewFromEditor: localStorage.getItem("fileditor_setting_md_sync_preview_from_editor") !== "false",
  todoAutoCompleteChildren: localStorage.getItem("fileditor_setting_todo_autocomplete_children") !== "false",
  todoAutoCollapseParentOnComplete: localStorage.getItem("fileditor_setting_todo_autocollapse_parent") === "true",
  todoHideCompleted: localStorage.getItem("fileditor_setting_todo_hide_completed") === "true",
  defaultJsonViewMode: parseViewMode(localStorage.getItem("fileditor_setting_default_json_view")),
  defaultXmlViewMode: parseViewMode(localStorage.getItem("fileditor_setting_default_xml_view")),

  setMarkdownAutoNumbering: (val) => {
    set({ markdownAutoNumbering: val });
    localStorage.setItem("fileditor_setting_md_autonumber", String(val));
  },
  setMarkdownPreserveNumbering: (val) => {
    set({ markdownPreserveNumbering: val });
    localStorage.setItem("fileditor_setting_md_preserve_num", String(val));
    set({ jsonString: get().jsonString }); // trigger re-render of preview
  },
  setMarkdownSyncEditorFromPreview: (val) => {
    set({ markdownSyncEditorFromPreview: val });
    localStorage.setItem("fileditor_setting_md_sync_editor_from_preview", String(val));
  },
  setMarkdownSyncPreviewFromEditor: (val) => {
    set({ markdownSyncPreviewFromEditor: val });
    localStorage.setItem("fileditor_setting_md_sync_preview_from_editor", String(val));
  },
  setTodoAutoCompleteChildren: (val) => {
    set({ todoAutoCompleteChildren: val });
    localStorage.setItem("fileditor_setting_todo_autocomplete_children", String(val));
  },
  setTodoAutoCollapseParentOnComplete: (val) => {
    set({ todoAutoCollapseParentOnComplete: val });
    localStorage.setItem("fileditor_setting_todo_autocollapse_parent", String(val));
  },
  setTodoHideCompleted: (val) => {
    set({ todoHideCompleted: val });
    localStorage.setItem("fileditor_setting_todo_hide_completed", String(val));
  },
  setDefaultJsonViewMode: (val) => {
    set({ defaultJsonViewMode: val });
    localStorage.setItem("fileditor_setting_default_json_view", val);
    const { mode, activeJsonTabId, jsonTabs, tabViewStates } = get();
    if (mode === "json" && activeJsonTabId) {
      const activeTab = jsonTabs.find(t => t.id === activeJsonTabId);
      const tabKey = activeTab?.path || activeTab?.id;
      if (!tabKey || !tabViewStates[tabKey]?.viewMode) {
        set({ viewMode: val });
      }
    }
  },
  setDefaultXmlViewMode: (val) => {
    set({ defaultXmlViewMode: val });
    localStorage.setItem("fileditor_setting_default_xml_view", val);
    const { mode, activeJsonTabId, jsonTabs, tabViewStates } = get();
    if (mode === "xml" && activeJsonTabId) {
      const activeTab = jsonTabs.find(t => t.id === activeJsonTabId);
      const tabKey = activeTab?.path || activeTab?.id;
      if (!tabKey || !tabViewStates[tabKey]?.viewMode) {
        set({ viewMode: val });
      }
    }
  },

  setSchemaDialect: (dialect) => {
    const { mode, activeSchemaTabId, schemaTabs, jsonString } = get();
    const keys = getStorageKeys(mode);
    const updatedSchemaTabs = activeSchemaTabId
      ? schemaTabs.map(t => t.id === activeSchemaTabId ? { ...t, schemaDialect: dialect } : t)
      : schemaTabs;

    if (mode === "json") {
      set({ jsonSchemaDialect: dialect as JsonSchemaDialect, schemaTabs: updatedSchemaTabs });
    } else if (mode === "xml") {
      set({ xmlSchemaDialect: dialect as XmlSchemaDialect, schemaTabs: updatedSchemaTabs });
    }
    if (activeSchemaTabId) {
      localStorage.setItem(keys.schemaTabs, JSON.stringify(updatedSchemaTabs));
    }
    get().runValidation(jsonString, mode);
  },

  assignSchemaToActiveFile: (schemaTabId) => {
    const { activeJsonTabId, jsonTabs } = get();
    if (!activeJsonTabId) return;
    const updatedTabs = jsonTabs.map(t =>
      t.id === activeJsonTabId ? { ...t, schemaTabId } : t
    );
    set({ jsonTabs: updatedTabs });
    localStorage.setItem("fileditor_unified_tabs", JSON.stringify(updatedTabs));
    if (schemaTabId) {
      set({ isSchemaEnabled: true });
      get().setActiveSchemaTab(schemaTabId);
    } else {
      set({ isSchemaEnabled: false });
      get().runValidation(get().jsonString, get().mode);
    }
  },

  setDateSupport: (val) => {
    set({ dateSupport: val });
    localStorage.setItem("fileditor_settings_date_support", String(val));
    // Trigger render update
    set({ jsonString: get().jsonString });
  },

  setDocusaurusSupport: (val) => {
    set({ docusaurusSupport: val });
    localStorage.setItem("fileditor_settings_docusaurus_support", String(val));
    // Trigger render update
    set({ jsonString: get().jsonString });
  },

  setFullscreenMarkdownWidth: (val) => {
    set({ fullscreenMarkdownWidth: val });
    localStorage.setItem("fileditor_settings_fs_md_width", val);
  },

  setFullscreenMarkdownZoom: (val) => {
    set({ fullscreenMarkdownZoom: val });
    localStorage.setItem("fileditor_settings_fs_md_zoom", val.toString());
  },

  setCustomHotkey: (action, shortcut) => {
    const keys = { ...get().customHotkeys, [action]: shortcut };
    set({ customHotkeys: keys });
    localStorage.setItem("fileditor_settings_custom_hotkeys", JSON.stringify(keys));
  },
  
  viewMode: "column",
  activePath: [],
  isRightPaneFullscreen: false,
  setRightPaneFullscreen: (fullscreen) => {
    const { activeJsonTabId, jsonTabs, setTabViewStates } = get();
    const activeTab = jsonTabs.find(t => t.id === activeJsonTabId);
    const tabKey = activeTab?.path || activeTab?.id;
    if (tabKey) {
      setTabViewStates(tabKey, { isFullscreen: fullscreen });
    }
    set({ isRightPaneFullscreen: fullscreen });
  },

  setMode: (newMode) => {
    const { mode } = get();
    if (mode === newMode) return;

    // Load schema tabs for the new mode from local storage
    let newSchemaTabs: Tab[] = [];
    let newActiveSchemaTabId: string | null = null;
    let newSchemaString = "";
    let newSchemaValue = null;

    if (newMode === "json") {
      try {
        const saved = localStorage.getItem("fileditor_saved_schema_tabs");
        if (saved) newSchemaTabs = stripLegacyDefaultSchemaTabs(JSON.parse(saved));
        newActiveSchemaTabId = localStorage.getItem("fileditor_active_schema_tab_id");
      } catch(e) {}
    } else if (newMode === "xml") {
      try {
        const saved = localStorage.getItem("fileditor_saved_xml_schema_tabs");
        if (saved) newSchemaTabs = stripLegacyDefaultSchemaTabs(JSON.parse(saved));
        newActiveSchemaTabId = localStorage.getItem("fileditor_active_xml_schema_tab_id");
      } catch(e) {}
    }

    const activeSchemaTab = newSchemaTabs.find(t => t.id === newActiveSchemaTabId) || newSchemaTabs[0];
    let jsonSchemaDialect = get().jsonSchemaDialect;
    let xmlSchemaDialect = get().xmlSchemaDialect;
    if (activeSchemaTab) {
      newSchemaString = activeSchemaTab.content;
      if (newMode === "json") {
        jsonSchemaDialect = (activeSchemaTab.schemaDialect as JsonSchemaDialect) || "auto";
      } else if (newMode === "xml") {
        xmlSchemaDialect = (activeSchemaTab.schemaDialect as XmlSchemaDialect) || "auto";
      }
      try {
        if (newMode === "json") newSchemaValue = JSON.parse(activeSchemaTab.content);
        else newSchemaValue = activeSchemaTab.content;
      } catch(e) {}
    }

    set({ 
      mode: newMode, 
      schemaTabs: newSchemaTabs, 
      activeSchemaTabId: activeSchemaTab ? activeSchemaTab.id : newActiveSchemaTabId,
      schemaString: newSchemaString,
      schemaValue: newSchemaValue,
      jsonSchemaDialect,
      xmlSchemaDialect,
      isRightPaneFullscreen: false
    });
    localStorage.setItem("fileditor_mode", newMode);
  },

  pushToHistory: (jsonStr: string, schemaStr: string) => {
    const { history, historyIndex, activeJsonTabId, tabHistories } = get();

    if (
      historyIndex >= 0 &&
      history[historyIndex]?.jsonString === jsonStr &&
      history[historyIndex]?.schemaString === schemaStr
    ) {
      return;
    }

    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push({ jsonString: jsonStr, schemaString: schemaStr });

    if (newHistory.length > 100) {
      newHistory.shift();
    }

    const nextIndex = newHistory.length - 1;
    const nextTabHistories = activeJsonTabId
      ? { ...tabHistories, [activeJsonTabId]: { history: newHistory, historyIndex: nextIndex } }
      : tabHistories;

    set({
      history: newHistory,
      historyIndex: nextIndex,
      tabHistories: nextTabHistories
    });
  },

  setJsonString: (str: string, debounce = true) => {
    const { mode, activeJsonTabId, jsonTabs } = get();
    const keys = getStorageKeys(mode);
    let updatedTabs = jsonTabs;

    if (activeJsonTabId) {
      updatedTabs = jsonTabs.map(t => {
        if (t.id === activeJsonTabId) {
          let updatedTitle = t.title;
          if (!t.path && getTabMode(t) === "markdown") {
            const extracted = extractMarkdownTitle(str);
            if (extracted) {
              updatedTitle = extracted;
            }
          }
          return { ...t, content: str, title: updatedTitle };
        }
        return t;
      });
      set({ jsonString: str, jsonTabs: updatedTabs });
      localStorage.setItem(keys.tabs, JSON.stringify(updatedTabs));
    } else {
      set({ jsonString: str });
    }

    if (debounceTimer) clearTimeout(debounceTimer);
    const requestEpoch = ++validationEpoch;
    const requestTabId = activeJsonTabId;
    const requestMode = mode;

    const parseAndValidate = async () => {
      if (requestEpoch !== validationEpoch || get().activeJsonTabId !== requestTabId || get().mode !== requestMode) {
        return;
      }

      const { schemaString, isSchemaEnabled } = get();

      if (requestMode === "json") {
        let parsedJson: any = null;
        let syntaxError: string | null = null;

        if (str.trim()) {
          try {
            parsedJson = JSON.parse(str);
          } catch (e: any) {
            syntaxError = e.message;
          }
        }

        let parsedSchema: any = null;
        let schemaError: string | null = null;

        if (isSchemaEnabled && schemaString.trim()) {
          try {
            parsedSchema = JSON.parse(schemaString);
          } catch (e: any) {
            schemaError = e.message;
          }
        }

        if (syntaxError) {
          set({
            jsonValue: null,
            hasSyntaxError: true,
            validationErrors: [
              { path: "JSON Syntax", message: `Ungültige JSON-Syntax: ${syntaxError}` }
            ],
            isValid: false
          });
        } else if (!str.trim()) {
          set({
            jsonValue: null,
            hasSyntaxError: false,
            schemaValue: parsedSchema,
            validationErrors: [],
            isValid: true
          });
        } else {
          let errors: ValidationError[] = [];
          if (isSchemaEnabled) {
            if (schemaError) {
              errors = [
                { path: "Schema Syntax", message: `Ungültige Schema-Syntax: ${schemaError}` }
              ];
            } else if (parsedSchema) {
              errors = validateJSON(parsedJson, parsedSchema, get().jsonSchemaDialect);
            }
          }

          set({
            jsonValue: parsedJson,
            hasSyntaxError: false,
            schemaValue: parsedSchema,
            validationErrors: errors,
            isValid: errors.length === 0
          });

          if (historyDebounceTimer) clearTimeout(historyDebounceTimer);
          historyDebounceTimer = setTimeout(() => {
            if (get().activeJsonTabId === requestTabId) {
              get().pushToHistory(str, schemaString);
            }
          }, 800);
        }
      } else if (requestMode === "xml") {
        const { value: parsedXml, error: syntaxError } = xmlStringToJsObject(str);

        if (syntaxError) {
          set({
            validationErrors: [
              { path: "XML Syntax", message: `Ungültige XML-Syntax: ${syntaxError}` }
            ],
            isValid: false,
            hasSyntaxError: true,
            jsonValue: null
          });
        } else if (!str.trim()) {
          set({
            jsonValue: null,
            hasSyntaxError: false,
            schemaValue: schemaString,
            validationErrors: [],
            isValid: true
          });
        } else {
          const { isValid, errors } = await validateXml(str, schemaString, isSchemaEnabled, get().xmlSchemaDialect);
          if (requestEpoch !== validationEpoch || get().activeJsonTabId !== requestTabId || get().mode !== requestMode) {
            return;
          }
          set({
            jsonValue: parsedXml,
            hasSyntaxError: false,
            schemaValue: schemaString,
            validationErrors: errors,
            isValid: isValid
          });

          if (historyDebounceTimer) clearTimeout(historyDebounceTimer);
          historyDebounceTimer = setTimeout(() => {
            if (get().activeJsonTabId === requestTabId) {
              get().pushToHistory(str, schemaString);
            }
          }, 800);
        }
      } else {
        // Markdown / TXT / ToDo Mode
        set({
          validationErrors: [],
          isValid: true,
          hasSyntaxError: false,
          jsonValue: str
        });

        if (historyDebounceTimer) clearTimeout(historyDebounceTimer);
        historyDebounceTimer = setTimeout(() => {
          if (get().activeJsonTabId === requestTabId) {
            get().pushToHistory(str, "");
          }
        }, 800);
      }
    };

    if (debounce) {
      debounceTimer = setTimeout(parseAndValidate, 300);
    } else {
      parseAndValidate();
    }
  },

  setSchemaString: (str: string, debounce = true) => {
    const { mode, activeSchemaTabId, schemaTabs, activeJsonTabId } = get();
    const keys = getStorageKeys(mode);
    let updatedTabs = schemaTabs;

    if (activeSchemaTabId) {
      updatedTabs = schemaTabs.map(t => t.id === activeSchemaTabId ? { ...t, content: str } : t);
      set({ schemaString: str, schemaTabs: updatedTabs });
      localStorage.setItem(keys.schemaTabs, JSON.stringify(updatedTabs));
    } else {
      set({ schemaString: str });
    }

    if (debounceTimer) clearTimeout(debounceTimer);
    const requestEpoch = ++validationEpoch;
    const requestTabId = activeJsonTabId;
    const requestMode = mode;

    const parseAndValidate = async () => {
      if (requestEpoch !== validationEpoch || get().activeJsonTabId !== requestTabId || get().mode !== requestMode) {
        return;
      }

      const { jsonValue, jsonString, isSchemaEnabled, hasSyntaxError } = get();

      if (requestMode === "json") {
        let parsedSchema: any = null;
        let schemaError: string | null = null;

        if (str.trim()) {
          try {
            parsedSchema = JSON.parse(str);
          } catch (e: any) {
            schemaError = e.message;
          }
        }

        if (hasSyntaxError) {
          set({ schemaValue: parsedSchema });
          return;
        }

        let errors: ValidationError[] = [];
        if (isSchemaEnabled) {
          if (schemaError) {
            errors = [
              { path: "Schema Syntax", message: `Ungültige Schema-Syntax: ${schemaError}` }
            ];
          } else if (parsedSchema && jsonString.trim()) {
            errors = validateJSON(jsonValue, parsedSchema, get().jsonSchemaDialect);
          }
        }

        set({
          schemaValue: parsedSchema,
          validationErrors: errors,
          isValid: errors.length === 0
        });

        get().pushToHistory(jsonString, str);
      } else if (requestMode === "xml") {
        if (hasSyntaxError) {
          set({ schemaValue: str });
          return;
        }
        const { isValid, errors } = await validateXml(jsonString, str, isSchemaEnabled, get().xmlSchemaDialect);
        if (requestEpoch !== validationEpoch || get().activeJsonTabId !== requestTabId || get().mode !== requestMode) {
          return;
        }
        set({
          schemaValue: str,
          validationErrors: errors,
          isValid: isValid
        });

        get().pushToHistory(jsonString, str);
      }
    };

    if (debounce) {
      debounceTimer = setTimeout(parseAndValidate, 300);
    } else {
      parseAndValidate();
    }
  },

  updateJsonValue: async (newValue: any) => {
    const { mode, activeJsonTabId, jsonTabs } = get();
    const keys = getStorageKeys(mode);

    if (mode === "json") {
      const formattedStr = JSON.stringify(newValue, null, 2);
      const { schemaString, schemaValue, isSchemaEnabled } = get();

      let errors: ValidationError[] = [];
      if (isSchemaEnabled && schemaValue) {
        errors = validateJSON(newValue, schemaValue, get().jsonSchemaDialect);
      }

      if (activeJsonTabId) {
        const updated = jsonTabs.map(t => t.id === activeJsonTabId ? { ...t, content: formattedStr } : t);
        set({
          jsonValue: newValue,
          hasSyntaxError: false,
          jsonString: formattedStr,
          validationErrors: errors,
          isValid: errors.length === 0,
          jsonTabs: updated
        });
        localStorage.setItem(keys.tabs, JSON.stringify(updated));
      } else {
        set({
          jsonValue: newValue,
          hasSyntaxError: false,
          jsonString: formattedStr,
          validationErrors: errors,
          isValid: errors.length === 0
        });
      }

      get().pushToHistory(formattedStr, schemaString);
    } else if (mode === "xml") {
      const xmlDecl = extractXmlDeclaration(get().jsonString);
      const formattedStr = jsObjectToXmlString(newValue, xmlDecl);
      if (formattedStr === null) {
        message.error("Ungültiger XML-Element- oder Attributname. Änderung wurde verworfen.");
        return;
      }

      const requestEpoch = ++validationEpoch;
      const requestTabId = activeJsonTabId;
      const { schemaString, isSchemaEnabled } = get();
      const { isValid, errors } = await validateXml(formattedStr, schemaString, isSchemaEnabled, get().xmlSchemaDialect);
      if (requestEpoch !== validationEpoch || get().activeJsonTabId !== requestTabId || get().mode !== "xml") {
        return;
      }

      const latestTabs = get().jsonTabs;
      if (activeJsonTabId) {
        const updated = latestTabs.map(t => t.id === activeJsonTabId ? { ...t, content: formattedStr } : t);
        set({
          jsonValue: newValue,
          hasSyntaxError: false,
          jsonString: formattedStr,
          validationErrors: errors,
          isValid: isValid,
          jsonTabs: updated
        });
        localStorage.setItem(keys.tabs, JSON.stringify(updated));
      } else {
        set({
          jsonValue: newValue,
          hasSyntaxError: false,
          jsonString: formattedStr,
          validationErrors: errors,
          isValid: isValid
        });
      }

      get().pushToHistory(formattedStr, schemaString);
    }
  },

  undo: async () => {
    const { history, historyIndex, activeJsonTabId, activeSchemaTabId, jsonTabs, schemaTabs, mode, tabHistories } = get();
    const keys = getStorageKeys(mode);

    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      const { jsonString, schemaString } = history[prevIndex];
      const nextTabHistories = activeJsonTabId
        ? { ...tabHistories, [activeJsonTabId]: { history, historyIndex: prevIndex } }
        : tabHistories;

      if (mode === "json") {
        let parsedJson: any = null;
        let jsonSyntaxErr: string | null = null;
        let parsedSchema: any = null;
        let schemaSyntaxErr: string | null = null;
        const { isSchemaEnabled, jsonSchemaDialect } = get();

        if (jsonString.trim()) {
          try { parsedJson = JSON.parse(jsonString); } catch (e: any) { jsonSyntaxErr = e.message; }
        }
        if (isSchemaEnabled && schemaString.trim()) {
          try { parsedSchema = JSON.parse(schemaString); } catch (e: any) { schemaSyntaxErr = e.message; }
        }

        let errors: ValidationError[] = [];
        if (jsonSyntaxErr) {
          errors = [{ path: "JSON Syntax", message: `Ungültige JSON-Syntax: ${jsonSyntaxErr}` }];
        } else if (isSchemaEnabled) {
          if (schemaSyntaxErr) {
            errors = [{ path: "Schema Syntax", message: `Ungültige Schema-Syntax: ${schemaSyntaxErr}` }];
          } else if (parsedSchema && jsonString.trim()) {
            errors = validateJSON(parsedJson, parsedSchema, jsonSchemaDialect);
          }
        }

        const updatedJsonTabs = activeJsonTabId
          ? jsonTabs.map(t => t.id === activeJsonTabId ? { ...t, content: jsonString } : t)
          : jsonTabs;
        const updatedSchemaTabs = activeSchemaTabId
          ? schemaTabs.map(t => t.id === activeSchemaTabId ? { ...t, content: schemaString } : t)
          : schemaTabs;

        set({
          jsonString,
          schemaString,
          jsonValue: jsonSyntaxErr ? null : parsedJson,
          hasSyntaxError: Boolean(jsonSyntaxErr),
          schemaValue: parsedSchema,
          validationErrors: errors,
          isValid: errors.length === 0,
          historyIndex: prevIndex,
          tabHistories: nextTabHistories,
          jsonTabs: updatedJsonTabs,
          schemaTabs: updatedSchemaTabs
        });

        localStorage.setItem(keys.tabs, JSON.stringify(updatedJsonTabs));
        localStorage.setItem(keys.schemaTabs, JSON.stringify(updatedSchemaTabs));
      } else if (mode === "xml") {
        const requestEpoch = ++validationEpoch;
        const requestTabId = activeJsonTabId;
        const { value: parsedXml, error: xmlSyntaxErr } = xmlStringToJsObject(jsonString);
        const { isSchemaEnabled, xmlSchemaDialect } = get();
        const result = xmlSyntaxErr
          ? { isValid: false, errors: [{ path: "XML Syntax", message: `Ungültige XML-Syntax: ${xmlSyntaxErr}` }] }
          : await validateXml(jsonString, schemaString, isSchemaEnabled, xmlSchemaDialect);

        if (requestEpoch !== validationEpoch || get().activeJsonTabId !== requestTabId || get().mode !== "xml") {
          return;
        }

        const updatedJsonTabs = activeJsonTabId
          ? get().jsonTabs.map(t => t.id === activeJsonTabId ? { ...t, content: jsonString } : t)
          : get().jsonTabs;
        const updatedSchemaTabs = activeSchemaTabId
          ? get().schemaTabs.map(t => t.id === activeSchemaTabId ? { ...t, content: schemaString } : t)
          : get().schemaTabs;

        set({
          jsonString,
          schemaString,
          jsonValue: xmlSyntaxErr ? null : parsedXml,
          hasSyntaxError: Boolean(xmlSyntaxErr),
          schemaValue: schemaString,
          validationErrors: result.errors,
          isValid: result.isValid,
          historyIndex: prevIndex,
          tabHistories: nextTabHistories,
          jsonTabs: updatedJsonTabs,
          schemaTabs: updatedSchemaTabs
        });

        localStorage.setItem(keys.tabs, JSON.stringify(updatedJsonTabs));
        localStorage.setItem(keys.schemaTabs, JSON.stringify(updatedSchemaTabs));
      } else {
        // Markdown / TXT Mode
        const updatedJsonTabs = activeJsonTabId
          ? jsonTabs.map(t => t.id === activeJsonTabId ? { ...t, content: jsonString } : t)
          : jsonTabs;

        set({
          jsonString,
          jsonValue: jsonString,
          hasSyntaxError: false,
          validationErrors: [],
          isValid: true,
          historyIndex: prevIndex,
          tabHistories: nextTabHistories,
          jsonTabs: updatedJsonTabs
        });

        localStorage.setItem(keys.tabs, JSON.stringify(updatedJsonTabs));
      }
    }
  },

  redo: async () => {
    const { history, historyIndex, activeJsonTabId, activeSchemaTabId, jsonTabs, schemaTabs, mode, tabHistories } = get();
    const keys = getStorageKeys(mode);

    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      const { jsonString, schemaString } = history[nextIndex];
      const nextTabHistories = activeJsonTabId
        ? { ...tabHistories, [activeJsonTabId]: { history, historyIndex: nextIndex } }
        : tabHistories;

      if (mode === "json") {
        let parsedJson: any = null;
        let jsonSyntaxErr: string | null = null;
        let parsedSchema: any = null;
        let schemaSyntaxErr: string | null = null;
        const { isSchemaEnabled, jsonSchemaDialect } = get();

        if (jsonString.trim()) {
          try { parsedJson = JSON.parse(jsonString); } catch (e: any) { jsonSyntaxErr = e.message; }
        }
        if (isSchemaEnabled && schemaString.trim()) {
          try { parsedSchema = JSON.parse(schemaString); } catch (e: any) { schemaSyntaxErr = e.message; }
        }

        let errors: ValidationError[] = [];
        if (jsonSyntaxErr) {
          errors = [{ path: "JSON Syntax", message: `Ungültige JSON-Syntax: ${jsonSyntaxErr}` }];
        } else if (isSchemaEnabled) {
          if (schemaSyntaxErr) {
            errors = [{ path: "Schema Syntax", message: `Ungültige Schema-Syntax: ${schemaSyntaxErr}` }];
          } else if (parsedSchema && jsonString.trim()) {
            errors = validateJSON(parsedJson, parsedSchema, jsonSchemaDialect);
          }
        }

        const updatedJsonTabs = activeJsonTabId
          ? jsonTabs.map(t => t.id === activeJsonTabId ? { ...t, content: jsonString } : t)
          : jsonTabs;
        const updatedSchemaTabs = activeSchemaTabId
          ? schemaTabs.map(t => t.id === activeSchemaTabId ? { ...t, content: schemaString } : t)
          : schemaTabs;

        set({
          jsonString,
          schemaString,
          jsonValue: jsonSyntaxErr ? null : parsedJson,
          hasSyntaxError: Boolean(jsonSyntaxErr),
          schemaValue: parsedSchema,
          validationErrors: errors,
          isValid: errors.length === 0,
          historyIndex: nextIndex,
          tabHistories: nextTabHistories,
          jsonTabs: updatedJsonTabs,
          schemaTabs: updatedSchemaTabs
        });

        localStorage.setItem(keys.tabs, JSON.stringify(updatedJsonTabs));
        localStorage.setItem(keys.schemaTabs, JSON.stringify(updatedSchemaTabs));
      } else if (mode === "xml") {
        const requestEpoch = ++validationEpoch;
        const requestTabId = activeJsonTabId;
        const { value: parsedXml, error: xmlSyntaxErr } = xmlStringToJsObject(jsonString);
        const { isSchemaEnabled, xmlSchemaDialect } = get();
        const result = xmlSyntaxErr
          ? { isValid: false, errors: [{ path: "XML Syntax", message: `Ungültige XML-Syntax: ${xmlSyntaxErr}` }] }
          : await validateXml(jsonString, schemaString, isSchemaEnabled, xmlSchemaDialect);

        if (requestEpoch !== validationEpoch || get().activeJsonTabId !== requestTabId || get().mode !== "xml") {
          return;
        }

        const updatedJsonTabs = activeJsonTabId
          ? get().jsonTabs.map(t => t.id === activeJsonTabId ? { ...t, content: jsonString } : t)
          : get().jsonTabs;
        const updatedSchemaTabs = activeSchemaTabId
          ? get().schemaTabs.map(t => t.id === activeSchemaTabId ? { ...t, content: schemaString } : t)
          : get().schemaTabs;

        set({
          jsonString,
          schemaString,
          jsonValue: xmlSyntaxErr ? null : parsedXml,
          hasSyntaxError: Boolean(xmlSyntaxErr),
          schemaValue: schemaString,
          validationErrors: result.errors,
          isValid: result.isValid,
          historyIndex: nextIndex,
          tabHistories: nextTabHistories,
          jsonTabs: updatedJsonTabs,
          schemaTabs: updatedSchemaTabs
        });

        localStorage.setItem(keys.tabs, JSON.stringify(updatedJsonTabs));
        localStorage.setItem(keys.schemaTabs, JSON.stringify(updatedSchemaTabs));
      } else {
        // Markdown / TXT Mode
        const updatedJsonTabs = activeJsonTabId
          ? jsonTabs.map(t => t.id === activeJsonTabId ? { ...t, content: jsonString } : t)
          : jsonTabs;

        set({
          jsonString,
          jsonValue: jsonString,
          hasSyntaxError: false,
          validationErrors: [],
          isValid: true,
          historyIndex: nextIndex,
          tabHistories: nextTabHistories,
          jsonTabs: updatedJsonTabs
        });

        localStorage.setItem(keys.tabs, JSON.stringify(updatedJsonTabs));
      }
    }
  },

  setViewMode: (newViewMode) => {
    const { mode, activeJsonTabId, jsonTabs, setTabViewStates } = get();
    if ((mode === "json" || mode === "xml") && activeJsonTabId) {
      const activeTab = jsonTabs.find(t => t.id === activeJsonTabId);
      const tabKey = activeTab?.path || activeTab?.id;
      if (tabKey) {
        setTabViewStates(tabKey, { viewMode: newViewMode });
      }
    }
    set({ viewMode: newViewMode });
  },

  setActivePath: (path) => set({ activePath: path }),

  setSchemaEnabled: (enabled) => {
    set({ isSchemaEnabled: enabled });
    const { jsonString } = get();
    get().setJsonString(jsonString, false);
  },

  runValidation: async (content, targetMode) => {
    const requestEpoch = ++validationEpoch;
    const requestTabId = get().activeJsonTabId;

    if (targetMode === "json") {
      let parsedJson: any = null;
      let jsonSyntaxErr: string | null = null;
      let parsedSchema: any = null;
      let schemaSyntaxErr: string | null = null;
      const { schemaString, isSchemaEnabled, jsonSchemaDialect } = get();

      if (content.trim()) {
        try {
          parsedJson = JSON.parse(content);
        } catch (e: any) {
          jsonSyntaxErr = e.message;
        }
      }
      if (isSchemaEnabled && schemaString.trim()) {
        try {
          parsedSchema = JSON.parse(schemaString);
        } catch (e: any) {
          schemaSyntaxErr = e.message;
        }
      }

      if (jsonSyntaxErr) {
        set({
          jsonValue: null,
          hasSyntaxError: true,
          schemaValue: parsedSchema,
          validationErrors: [{ path: "JSON Syntax", message: `Ungültige JSON-Syntax: ${jsonSyntaxErr}` }],
          isValid: false
        });
        return;
      }

      let errors: ValidationError[] = [];
      if (isSchemaEnabled && content.trim()) {
        if (schemaSyntaxErr) {
          errors = [{ path: "Schema Syntax", message: `Ungültige Schema-Syntax: ${schemaSyntaxErr}` }];
        } else if (parsedSchema) {
          errors = validateJSON(parsedJson, parsedSchema, jsonSchemaDialect);
        }
      }

      set({
        jsonValue: content.trim() ? parsedJson : null,
        hasSyntaxError: false,
        schemaValue: parsedSchema,
        validationErrors: errors,
        isValid: errors.length === 0
      });
    } else if (targetMode === "xml") {
      const { schemaString, isSchemaEnabled, xmlSchemaDialect } = get();
      const { value: parsedXml, error: xmlSyntaxErr } = xmlStringToJsObject(content);

      if (xmlSyntaxErr) {
        set({
          jsonValue: null,
          hasSyntaxError: true,
          schemaValue: schemaString,
          validationErrors: [{ path: "XML Syntax", message: `Ungültige XML-Syntax: ${xmlSyntaxErr}` }],
          isValid: false
        });
        return;
      }

      if (!content.trim()) {
        set({
          jsonValue: null,
          hasSyntaxError: false,
          schemaValue: schemaString,
          validationErrors: [],
          isValid: true
        });
        return;
      }

      const { isValid, errors } = await validateXml(content, schemaString, isSchemaEnabled, xmlSchemaDialect);
      if (requestEpoch !== validationEpoch || get().activeJsonTabId !== requestTabId || get().mode !== "xml") {
        return;
      }
      set({
        jsonValue: parsedXml,
        hasSyntaxError: false,
        schemaValue: schemaString,
        validationErrors: errors,
        isValid
      });
    } else {
      // Markdown / TXT / ToDo
      set({
        jsonValue: content,
        hasSyntaxError: false,
        validationErrors: [],
        isValid: true
      });
    }
  },

  saveAll: async () => {
    const { jsonTabs, saveJsonTab } = get();
    let allSaved = true;
    for (const tab of jsonTabs) {
      if (tab.content !== tab.lastSavedContent) {
        const success = await saveJsonTab(tab.id);
        if (!success) allSaved = false;
      }
    }
    return allSaved;
  },

  // Tab System Aktionen
  setActiveJsonTab: (tabId, targetListId) => {
    if (debounceTimer) clearTimeout(debounceTimer);
    if (historyDebounceTimer) clearTimeout(historyDebounceTimer);
    validationEpoch++;

    const { jsonTabs, activeJsonTabId, isRightPaneFullscreen, tabViewStates, setTabViewStates, history, historyIndex, tabHistories } = get();

    // Save fullscreen state & history of the tab we are leaving
    let nextTabHistories = { ...tabHistories };
    if (activeJsonTabId && activeJsonTabId !== tabId) {
      const prevTab = jsonTabs.find(t => t.id === activeJsonTabId);
      const prevKey = prevTab?.path || prevTab?.id;
      if (prevKey) {
        setTabViewStates(prevKey, { isFullscreen: isRightPaneFullscreen });
      }
      if (history.length > 0) {
        nextTabHistories[activeJsonTabId] = { history, historyIndex };
      }
    }

    set({ activeJsonTabId: tabId });
    if (tabId) {
      localStorage.setItem("fileditor_active_tab_id", tabId);
    }
    const tab = jsonTabs.find(t => t.id === tabId);
    if (tab) {
      const targetMode = getTabMode(tab);
      const newKey = tab.path || tab.id;

      // Restore target tab's fullscreen state and viewMode
      const targetSavedState = tabViewStates[newKey];
      const targetFullscreen = targetSavedState?.isFullscreen === true;
      const targetViewMode: JsonXmlViewMode =
        targetMode === "json" || targetMode === "xml"
          ? targetSavedState?.viewMode || (targetMode === "json" ? get().defaultJsonViewMode : get().defaultXmlViewMode)
          : get().viewMode;

      // Save current tab content into store
      let updatedTabs = jsonTabs;
      if (activeJsonTabId && activeJsonTabId !== tabId) {
        updatedTabs = jsonTabs.map(t => t.id === activeJsonTabId ? { ...t, content: get().jsonString } : t);
      }

      // Reload mode-specific schema tabs if switching between json and xml, or restore per-file assigned schemaTabId
      let nextSchemaTabs = get().schemaTabs;
      let nextActiveSchemaTabId = get().activeSchemaTabId;
      let nextSchemaString = get().schemaString;
      let nextSchemaValue = get().schemaValue;
      let nextJsonDialect = get().jsonSchemaDialect;
      let nextXmlDialect = get().xmlSchemaDialect;

      if (targetMode === "json" || targetMode === "xml") {
        if (get().mode !== targetMode) {
          const storageKey = targetMode === "json" ? "fileditor_saved_schema_tabs" : "fileditor_saved_xml_schema_tabs";
          const activeKey = targetMode === "json" ? "fileditor_active_schema_tab_id" : "fileditor_active_xml_schema_tab_id";
          try {
            const saved = localStorage.getItem(storageKey);
            nextSchemaTabs = saved ? stripLegacyDefaultSchemaTabs(JSON.parse(saved)) : [];
            nextActiveSchemaTabId = localStorage.getItem(activeKey);
          } catch {
            nextSchemaTabs = [];
          }
        }

        // If this file tab was bound to a specific schema tab, prefer it
        if (tab.schemaTabId && nextSchemaTabs.some(st => st.id === tab.schemaTabId)) {
          nextActiveSchemaTabId = tab.schemaTabId;
        }

        const resolvedSchemaTab =
          nextSchemaTabs.find(st => st.id === nextActiveSchemaTabId) || nextSchemaTabs[0] || null;
        if (resolvedSchemaTab) {
          nextActiveSchemaTabId = resolvedSchemaTab.id;
          nextSchemaString = resolvedSchemaTab.content;
          if (targetMode === "json") {
            nextJsonDialect = (resolvedSchemaTab.schemaDialect as JsonSchemaDialect) || "auto";
            try {
              nextSchemaValue = JSON.parse(resolvedSchemaTab.content);
            } catch {
              nextSchemaValue = null;
            }
          } else {
            nextXmlDialect = (resolvedSchemaTab.schemaDialect as XmlSchemaDialect) || "auto";
            nextSchemaValue = resolvedSchemaTab.content;
          }
        } else {
          nextActiveSchemaTabId = null;
          nextSchemaString = "";
          nextSchemaValue = null;
        }
      }

      // Restore or initialize per-tab history
      const existingHistory = nextTabHistories[tab.id];
      const restoredHistory = existingHistory && existingHistory.history.length > 0
        ? existingHistory.history
        : [{ jsonString: tab.content, schemaString: targetMode === "json" || targetMode === "xml" ? nextSchemaString : "" }];
      const restoredHistoryIndex = existingHistory && existingHistory.history.length > 0
        ? Math.min(existingHistory.historyIndex, restoredHistory.length - 1)
        : 0;
      nextTabHistories[tab.id] = { history: restoredHistory, historyIndex: restoredHistoryIndex };

      // Switch mode, content, schema context, history, and restore target tab's fullscreen state
      set({
        mode: targetMode,
        jsonString: tab.content,
        jsonTabs: updatedTabs,
        schemaTabs: nextSchemaTabs,
        activeSchemaTabId: nextActiveSchemaTabId,
        schemaString: nextSchemaString,
        schemaValue: nextSchemaValue,
        jsonSchemaDialect: nextJsonDialect,
        xmlSchemaDialect: nextXmlDialect,
        isRightPaneFullscreen: targetFullscreen,
        viewMode: targetViewMode,
        activePath: [],
        history: restoredHistory,
        historyIndex: restoredHistoryIndex,
        tabHistories: nextTabHistories
      });
      localStorage.setItem("fileditor_unified_tabs", JSON.stringify(updatedTabs));
      get().runValidation(tab.content, targetMode);

      if (targetMode === "todo" && targetListId) {
        useToDoStore.getState().setActiveListId(targetListId);
        logger.info("FileStore", `Switched active ToDo list to targetListId="${targetListId}"`);
      }
    } else {
      set({
        jsonString: "",
        jsonValue: null,
        hasSyntaxError: false,
        validationErrors: [],
        isValid: true,
        isRightPaneFullscreen: false,
        activePath: [],
        history: [],
        historyIndex: -1,
        tabHistories: nextTabHistories
      });
    }
  },

  setActiveSchemaTab: (tabId) => {
    const { mode, schemaTabs, activeJsonTabId, jsonTabs } = get();
    const keys = getStorageKeys(mode);
    set({ activeSchemaTabId: tabId });
    if (tabId) {
      localStorage.setItem(keys.activeSchemaTabId, tabId);
    }
    // Bind selected schema tab to the currently active JSON/XML file tab so each file remembers its schema
    if (activeJsonTabId && (mode === "json" || mode === "xml")) {
      const updatedFileTabs = jsonTabs.map(ft =>
        ft.id === activeJsonTabId ? { ...ft, schemaTabId: tabId } : ft
      );
      set({ jsonTabs: updatedFileTabs });
      localStorage.setItem("fileditor_unified_tabs", JSON.stringify(updatedFileTabs));
    }
    const tab = schemaTabs.find(t => t.id === tabId);
    if (tab) {
      if (mode === "json") {
        set({ jsonSchemaDialect: (tab.schemaDialect as JsonSchemaDialect) || "auto" });
      } else if (mode === "xml") {
        set({ xmlSchemaDialect: (tab.schemaDialect as XmlSchemaDialect) || "auto" });
      }
      get().setSchemaString(tab.content, false);
    } else {
      set({ schemaString: "", schemaValue: null });
    }
  },

  addJsonTab: (path = null, content = "", type = null) => {
    const { mode, jsonTabs } = get();
    
    // Determine target mode / type for this tab
    let tabType = type || mode;
    if (path) {
      const ext = path.split(".").pop()?.toLowerCase();
      if (ext === "todo" || ext === "todo.json") tabType = "todo";
      else if (ext === "md" || ext === "markdown") tabType = "markdown";
      else if (ext === "xml") tabType = "xml";
      else if (ext === "txt" || ext === "log" || ext === "text") tabType = "txt";
      else if (ext === "json") tabType = "json";
    }

    const prefix = tabType === "json" ? "json_" : tabType === "xml" ? "xml_" : tabType === "todo" ? "todo_" : tabType === "txt" ? "txt_" : "md_";
    const id = prefix + Date.now() + Math.random().toString(36).substr(2, 5);
    
    let title = "";
    if (path) {
      title = getFileNameFromPath(path);
    } else {
      if (tabType === "todo") {
        const defaultTitlePrefix = t("todo.title");
        let nextNum = 1;
        while (jsonTabs.some(t => 
          t.title.toLowerCase() === `${defaultTitlePrefix.toLowerCase()} ${nextNum}.todo` ||
          t.title.toLowerCase() === `meine aufgaben ${nextNum}.todo` ||
          t.title.toLowerCase() === `my tasks ${nextNum}.todo`
        )) {
          nextNum++;
        }
        title = `${defaultTitlePrefix} ${nextNum}.todo`;
        if (!content) {
          content = JSON.stringify({
            fileTitle: `${defaultTitlePrefix} ${nextNum}`,
            activeListId: "list_1",
            lists: [
              {
                id: "list_1",
                title: t("todo.defaultList"),
                tasks: [
                  {
                    id: "task_1",
                    text: t("todo.welcomeTask"),
                    completed: false,
                    indent: 0,
                    indicators: [],
                    formatting: { headingLevel: 1 },
                    tags: []
                  }
                ]
              }
            ],
            hashtagColors: {}
          }, null, 2);
        }
      } else {
        let nextNum = 1;
        const newPrefix = t("tabs.untitled");
        const extension = tabType === "json" ? "json" : tabType === "xml" ? "xml" : tabType === "txt" ? "txt" : "md";
        while (jsonTabs.some(t => 
          t.title === `${newPrefix} ${nextNum}.${extension}` || 
          t.title === `neu ${nextNum}.${extension}` || 
          t.title === `neu ${nextNum}`
        )) {
          nextNum++;
        }
        if (tabType === "markdown" && content) {
          const extracted = extractMarkdownTitle(content);
          title = extracted || `${newPrefix} ${nextNum}.${extension}`;
        } else {
          title = `${newPrefix} ${nextNum}.${extension}`;
        }
      }
    }

    const newTab: Tab = {
      id,
      path,
      title,
      content,
      lastSavedContent: path ? content : "__NEW_UNSAVED__",
      lastModifiedTime: null,
      type: tabType,
      initialContent: content,
      isNewUntouched: path === null
    };

    const updated = [...jsonTabs, newTab];
    set({ jsonTabs: updated });
    localStorage.setItem("fileditor_unified_tabs", JSON.stringify(updated));
    get().setActiveJsonTab(id);
  },

  addSchemaTab: (path = null, content = "") => {
    const { mode, schemaTabs } = get();
    const keys = getStorageKeys(mode);
    const prefix = mode === "json" ? "schema_" : "xmlschema_";
    const id = prefix + Date.now() + Math.random().toString(36).substr(2, 5);
    
    let title = "";
    if (path) {
      title = getFileNameFromPath(path);
    } else {
      const untitledPrefix = t("tabs.untitled");
      let nextNum = 1;
      while (schemaTabs.some(st => st.title === `${untitledPrefix} ${nextNum}` || st.title === `neu ${nextNum}`)) {
        nextNum++;
      }
      title = `${untitledPrefix} ${nextNum}`;
    }

    const newTab: Tab = {
      id,
      path,
      title,
      content,
      lastSavedContent: content,
      lastModifiedTime: null
    };

    const updated = [...schemaTabs, newTab];
    set({ schemaTabs: updated });
    localStorage.setItem(keys.schemaTabs, JSON.stringify(updated));
    get().setActiveSchemaTab(id);
  },

  closeJsonTab: (tabId) => {
    const { jsonTabs, activeJsonTabId, mode, discardedBackups } = get();
    const keys = getStorageKeys(mode);
    const tabToClose = jsonTabs.find(t => t.id === tabId);

    if (tabToClose && tabToClose.content.trim().length > 0) {
      const isUntouchedNew = !tabToClose.path && tabToClose.content === (tabToClose.initialContent ?? "");
      const isUnsavedOrModified = !isUntouchedNew && (!tabToClose.path || tabToClose.content !== tabToClose.lastSavedContent);
      if (isUnsavedOrModified) {
        const newBackup: DiscardedBackupTab = {
          backupId: `backup_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          originalTabId: tabToClose.id,
          title: tabToClose.title,
          originalPath: tabToClose.path,
          content: tabToClose.content,
          type: getTabMode(tabToClose),
          discardedAt: Date.now()
        };
        const updatedBackups = [newBackup, ...discardedBackups].slice(0, 50);
        set({ discardedBackups: updatedBackups });
        if (get().backupRetentionDays !== 0) {
          localStorage.setItem("fileditor_persistent_backups", JSON.stringify(updatedBackups));
        }
        logger.info("FileStore", `Backed up discarded tab in session memory: title="${tabToClose.title}", backupId="${newBackup.backupId}"`);
      }
    }

    const idx = jsonTabs.findIndex(t => t.id === tabId);
    const updated = jsonTabs.filter(t => t.id !== tabId);
    const nextHistories = { ...get().tabHistories };
    delete nextHistories[tabId];
    set({ jsonTabs: updated, tabHistories: nextHistories });
    localStorage.setItem(keys.tabs, JSON.stringify(updated));

    if (activeJsonTabId === tabId) {
      if (updated.length > 0) {
        const nextActiveIdx = Math.max(0, idx - 1);
        get().setActiveJsonTab(updated[nextActiveIdx].id);
      } else {
        get().setActiveJsonTab(null);
      }
    }

    if (updated.length === 0) {
      checkAndCloseIfSecondaryInstance();
    }
  },

  closeSchemaTab: (tabId) => {
    const { schemaTabs, activeSchemaTabId, mode } = get();
    const keys = getStorageKeys(mode);
    const idx = schemaTabs.findIndex(t => t.id === tabId);
    const updated = schemaTabs.filter(t => t.id !== tabId);
    set({ schemaTabs: updated });
    localStorage.setItem(keys.schemaTabs, JSON.stringify(updated));

    if (activeSchemaTabId === tabId) {
      if (updated.length > 0) {
        const nextActiveIdx = Math.max(0, idx - 1);
        get().setActiveSchemaTab(updated[nextActiveIdx].id);
      } else {
        get().setActiveSchemaTab(null);
      }
    }
  },

  moveJsonTab: (fromIndex, toIndex) => {
    const { jsonTabs, mode } = get();
    if (fromIndex === toIndex || !jsonTabs[fromIndex]) return;
    const numPinned = jsonTabs.filter(t => t.pinned).length;
    const isPinned = !!jsonTabs[fromIndex].pinned;
    let clampedToIndex = toIndex;
    if (isPinned) {
      clampedToIndex = Math.min(Math.max(0, toIndex), numPinned - 1);
    } else {
      clampedToIndex = Math.min(Math.max(numPinned, toIndex), jsonTabs.length - 1);
    }
    if (fromIndex === clampedToIndex) return;

    const keys = getStorageKeys(mode);
    const updated = [...jsonTabs];
    const [removed] = updated.splice(fromIndex, 1);
    updated.splice(clampedToIndex, 0, removed);
    set({ jsonTabs: updated });
    localStorage.setItem(keys.tabs, JSON.stringify(updated));
  },

  moveSchemaTab: (fromIndex, toIndex) => {
    const { schemaTabs, mode } = get();
    if (fromIndex === toIndex || !schemaTabs[fromIndex]) return;
    const numPinned = schemaTabs.filter(t => t.pinned).length;
    const isPinned = !!schemaTabs[fromIndex].pinned;
    let clampedToIndex = toIndex;
    if (isPinned) {
      clampedToIndex = Math.min(Math.max(0, toIndex), numPinned - 1);
    } else {
      clampedToIndex = Math.min(Math.max(numPinned, toIndex), schemaTabs.length - 1);
    }
    if (fromIndex === clampedToIndex) return;

    const keys = getStorageKeys(mode);
    const updated = [...schemaTabs];
    const [removed] = updated.splice(fromIndex, 1);
    updated.splice(clampedToIndex, 0, removed);
    set({ schemaTabs: updated });
    localStorage.setItem(keys.schemaTabs, JSON.stringify(updated));
  },

  closeMultipleJsonTabs: (tabIds) => {
    const { jsonTabs, activeJsonTabId, mode, discardedBackups } = get();
    const keys = getStorageKeys(mode);

    const dirtyTabs = jsonTabs.filter(t => tabIds.includes(t.id) && (!t.path || t.content !== t.lastSavedContent) && t.content.trim().length > 0);
    if (dirtyTabs.length > 0) {
      const newBackups: DiscardedBackupTab[] = dirtyTabs.map(t => ({
        backupId: `backup_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        originalTabId: t.id,
        title: t.title,
        originalPath: t.path,
        content: t.content,
        type: getTabMode(t),
        discardedAt: Date.now()
      }));
      const updatedBackups = [...newBackups, ...discardedBackups].slice(0, 50);
      set({ discardedBackups: updatedBackups });
      if (get().backupRetentionDays !== 0) {
        localStorage.setItem("fileditor_persistent_backups", JSON.stringify(updatedBackups));
      }
    }

    const updated = jsonTabs.filter(t => !tabIds.includes(t.id));
    const nextHistories = { ...get().tabHistories };
    tabIds.forEach(id => delete nextHistories[id]);
    set({ jsonTabs: updated, tabHistories: nextHistories });
    localStorage.setItem(keys.tabs, JSON.stringify(updated));

    if (activeJsonTabId && tabIds.includes(activeJsonTabId)) {
      if (updated.length > 0) {
        get().setActiveJsonTab(updated[0].id);
      } else {
        get().setActiveJsonTab(null);
      }
    }

    if (updated.length === 0) {
      checkAndCloseIfSecondaryInstance();
    }
  },

  closeMultipleSchemaTabs: (tabIds) => {
    const { schemaTabs, activeSchemaTabId, mode } = get();
    const keys = getStorageKeys(mode);
    const updated = schemaTabs.filter(t => !tabIds.includes(t.id));
    set({ schemaTabs: updated });
    localStorage.setItem(keys.schemaTabs, JSON.stringify(updated));

    if (activeSchemaTabId && tabIds.includes(activeSchemaTabId)) {
      if (updated.length > 0) {
        get().setActiveSchemaTab(updated[0].id);
      } else {
        get().setActiveSchemaTab(null);
      }
    }
  },

  togglePinJsonTab: (tabId) => {
    const { jsonTabs, mode } = get();
    const keys = getStorageKeys(mode);
    const tabIdx = jsonTabs.findIndex(t => t.id === tabId);
    if (tabIdx === -1) return;

    const updated = jsonTabs.map((t, idx) => idx === tabIdx ? { ...t, pinned: !t.pinned } : t);

    // Group pinned tabs at the left
    const pinned = updated.filter(t => t.pinned);
    const unpinned = updated.filter(t => !t.pinned);
    const finalTabs = [...pinned, ...unpinned];

    set({ jsonTabs: finalTabs });
    localStorage.setItem(keys.tabs, JSON.stringify(finalTabs));
  },

  togglePinSchemaTab: (tabId) => {
    const { schemaTabs, mode } = get();
    const keys = getStorageKeys(mode);
    const tabIdx = schemaTabs.findIndex(t => t.id === tabId);
    if (tabIdx === -1) return;

    const updated = schemaTabs.map((t, idx) => idx === tabIdx ? { ...t, pinned: !t.pinned } : t);

    // Group pinned tabs at the left
    const pinned = updated.filter(t => t.pinned);
    const unpinned = updated.filter(t => !t.pinned);
    const finalTabs = [...pinned, ...unpinned];

    set({ schemaTabs: finalTabs });
    localStorage.setItem(keys.schemaTabs, JSON.stringify(finalTabs));
  },

  updateTabContent: (tabId, content) => {
    const { jsonTabs, activeJsonTabId } = get();
    const updated = jsonTabs.map(t => t.id === tabId ? { ...t, content } : t);
    set({
      jsonTabs: updated,
      jsonString: tabId === activeJsonTabId ? content : get().jsonString
    });
    localStorage.setItem("fileditor_unified_tabs", JSON.stringify(updated));
  },

  updateTabTitle: (tabId, title) => {
    const { jsonTabs } = get();
    const updated = jsonTabs.map(t => t.id === tabId ? { ...t, title } : t);
    set({ jsonTabs: updated });
    localStorage.setItem("fileditor_unified_tabs", JSON.stringify(updated));
  },

  saveJsonTab: async (id = null, path = null, forceDialog = false) => {
    const targetId = id || get().activeJsonTabId;
    if (!targetId) return false;

    const { jsonTabs } = get();
    const tab = jsonTabs.find(t => t.id === targetId);
    if (!tab) return false;

    let targetPath: string | null = forceDialog ? null : (path || tab.path);
    const tabMode = getTabMode(tab);

    if (!targetPath) {
      let defaultName = "";
      if (tabMode === "markdown") {
        const extracted = extractMarkdownTitle(tab.content);
        let baseName = extracted || tab.title.replace(/\.(md|markdown)$/i, "");
        baseName = baseName.replace(/[\\/:*?"<>|]/g, "").trim();
        if (!baseName) baseName = "neu 1";
        defaultName = baseName.endsWith(".md") ? baseName : `${baseName}.md`;
      } else if (tabMode === "todo") {
        let baseName = tab.title.replace(/\.(todo|todo\.json)$/i, "").replace(/[\\/:*?"<>|]/g, "").trim();
        if (!baseName) baseName = "Meine Aufgaben 1";
        defaultName = baseName.endsWith(".todo") ? baseName : `${baseName}.todo`;
      } else if (tabMode === "json") {
        let baseName = tab.title.replace(/\.json$/i, "").replace(/[\\/:*?"<>|]/g, "").trim();
        if (!baseName) baseName = "neu 1";
        defaultName = `${baseName}.json`;
      } else if (tabMode === "txt") {
        let baseName = tab.title.replace(/\.(txt|log|text)$/i, "").replace(/[\\/:*?"<>|]/g, "").trim();
        if (!baseName) baseName = "neu 1";
        defaultName = `${baseName}.txt`;
      } else {
        let baseName = tab.title.replace(/\.xml$/i, "").replace(/[\\/:*?"<>|]/g, "").trim();
        if (!baseName) baseName = "neu 1";
        defaultName = `${baseName}.xml`;
      }

      const selectedPath = await invokeTauri("save_file_dialog", {
        title: tabMode === "todo" ? "ToDo-Datei speichern" : tabMode === "json" ? "JSON speichern" : tabMode === "xml" ? "XML speichern" : tabMode === "txt" ? "Text-Datei speichern" : "Markdown speichern",
        defaultName: defaultName,
        filterName: tabMode === "todo" ? "ToDo-Dateien (*.todo)" : tabMode === "json" ? "JSON-Dateien" : tabMode === "xml" ? "XML-Dateien" : tabMode === "txt" ? "Text-Dateien (*.txt)" : "Markdown-Dateien",
        filterExt: tabMode === "todo" ? "todo" : tabMode === "json" ? "json" : tabMode === "xml" ? "xml" : tabMode === "txt" ? "txt" : "md"
      }) as string | null;
      if (!selectedPath) return false;
      targetPath = selectedPath;
    }

    const savedPath: string = targetPath;

    try {
      await invokeTauri("write_file", { path: savedPath, content: tab.content });
      const modTime = await invokeTauri("get_file_modified_time", { path: savedPath }) as number;

      const fileName = getFileNameFromPath(savedPath);
      const ext = savedPath.split(".").pop()?.toLowerCase();
      let newType = tab.type || tabMode;
      if (ext === "todo" || ext === "todo.json") newType = "todo";
      else if (ext === "md" || ext === "markdown") newType = "markdown";
      else if (ext === "xml") newType = "xml";
      else if (ext === "txt" || ext === "log" || ext === "text") newType = "txt";
      else if (ext === "json") newType = "json";

      const updated = get().jsonTabs.map(t => t.id === targetId ? {
        ...t,
        path: savedPath,
        title: fileName,
        lastSavedContent: t.content,
        lastModifiedTime: modTime || Date.now(),
        type: newType
      } : t);

      const oldTabKey = tab.path || tab.id;
      if (oldTabKey !== savedPath && get().tabViewStates[oldTabKey]) {
        get().setTabViewStates(savedPath, get().tabViewStates[oldTabKey]);
      }

      set({ jsonTabs: updated });
      localStorage.setItem("fileditor_unified_tabs", JSON.stringify(updated));

      get().addRecentJsonFile(savedPath);

      if (get().activeJsonTabId === targetId) {
        get().setActiveJsonTab(targetId);
      }

      return true;
    } catch (err) {
      console.error("Fehler beim Speichern der Datei:", err);
      return false;
    }
  },

  saveSchemaTab: async (id = null, path = null, forceDialog = false) => {
    const targetId = id || get().activeSchemaTabId;
    if (!targetId) return false;

    const { schemaTabs, mode } = get();
    const keys = getStorageKeys(mode);
    const tab = schemaTabs.find(t => t.id === targetId);
    if (!tab) return false;

    let targetPath: string | null = forceDialog ? null : (path || tab.path);

    if (!targetPath) {
      const hasValidExt =
        mode === "json"
          ? /\.(schema\.json|jtd\.json|json)$/i.test(tab.title)
          : /\.(xsd|dtd|rng|sch|xml)$/i.test(tab.title);
      const selectedPath = await invokeTauri("save_file_dialog", {
        title: mode === "json" ? "JSON Schema speichern" : "XML Schema speichern",
        defaultName: hasValidExt
          ? tab.title
          : `${tab.title}.${mode === "json" ? "schema.json" : "xsd"}`,
        filterName: mode === "json" ? "JSON-Schema (*.json)" : "XML-Schema (*.xsd, *.dtd, *.rng, *.sch)",
        filterExt: mode === "json" ? "json" : "xsd;dtd;rng;sch;xml"
      }) as string | null;
      if (!selectedPath) return false;
      targetPath = selectedPath;
    }

    const savedPath: string = targetPath;

    try {
      await invokeTauri("write_file", { path: savedPath, content: tab.content });
      const modTime = await invokeTauri("get_file_modified_time", { path: savedPath }) as number;

      const fileName = getFileNameFromPath(savedPath);
      const updated = get().schemaTabs.map(t => t.id === targetId ? {
        ...t,
        path: savedPath,
        title: fileName,
        lastSavedContent: t.content,
        lastModifiedTime: modTime || Date.now()
      } : t);

      set({ schemaTabs: updated });
      localStorage.setItem(keys.schemaTabs, JSON.stringify(updated));

      get().addRecentSchemaFile(savedPath);
      return true;
    } catch (err) {
      console.error("Fehler beim Speichern des Schemas:", err);
      return false;
    }
  },

  openJsonFile: async (path) => {
    if (!path) {
      logger.warn("useFileStore", "openJsonFile called with empty path");
      return;
    }
    const { jsonTabs, activeJsonTabId } = get();
    let cleanPath = normalizeFilePath(path);

    // If path is relative (no drive letter) and active tab has a path, combine with active tab directory
    const activeTab = jsonTabs.find(t => t.id === activeJsonTabId);
    if (activeTab?.path && !cleanPath.includes(":/") && !cleanPath.startsWith("/")) {
      const activeNorm = normalizeFilePath(activeTab.path);
      const parentDir = activeNorm.split("/").slice(0, -1).join("/");
      if (parentDir) {
        cleanPath = `${parentDir}/${cleanPath}`;
        logger.info("useFileStore", `Resolved relative open path to: "${cleanPath}"`);
      }
    }

    const cleanLower = normalizeFilePath(cleanPath).toLowerCase();
    logger.info("useFileStore", `openJsonFile requested: rawPath="${path}", cleanPath="${cleanPath}"`);

    // 1. Try finding existing open tab by path
    const existing = jsonTabs.find(t => t.path && normalizeFilePath(t.path).toLowerCase() === cleanLower);

    if (existing) {
      logger.info("useFileStore", `Found existing open tab for path: tabId="${existing.id}", title="${existing.title}"`);
      get().setActiveJsonTab(existing.id);
      return;
    }

    try {
      logger.info("useFileStore", `Attempting invokeTauri("read_file") for path="${cleanPath}"`);
      const content = await invokeTauri("read_file", { path: cleanPath }) as string;
      const modTime = await invokeTauri("get_file_modified_time", { path: cleanPath }) as number;
      
      const ext = cleanPath.split(".").pop()?.toLowerCase();
      let tabType: "json" | "xml" | "markdown" | "todo" | "txt" = "txt";
      if (ext === "todo" || ext === "todo.json") tabType = "todo";
      else if (ext === "md" || ext === "markdown") tabType = "markdown";
      else if (ext === "xml") tabType = "xml";
      else if (ext === "json") tabType = "json";
      else tabType = "txt";

      let finalContent = content;
      if (tabType === "todo") {
        try {
          const parsed = JSON.parse(content);
          if (!parsed.lists) {
            throw new Error("Not structured todo JSON");
          }
        } catch (e) {
          // Plain text todo.txt format! Parse into structured .todo JSON tab
          const fileTitle = getFileNameFromPath(cleanPath).replace(/\.(todo|txt)$/i, "");
          const lists = parseTodoTxtContent(content, fileTitle);
          finalContent = JSON.stringify({
            lists,
            activeListId: lists[0]?.id || "list_1",
            hashtagColors: {}
          }, null, 2);
        }
      }

      const prefix = tabType === "todo" ? "todo_" : tabType === "json" ? "json_" : tabType === "xml" ? "xml_" : tabType === "txt" ? "txt_" : "md_";
      const id = prefix + Date.now() + Math.random().toString(36).substr(2, 5);
      const title = getFileNameFromPath(cleanPath);

      const newTab: Tab = {
        id,
        path: cleanPath,
        title,
        content: finalContent,
        lastSavedContent: finalContent,
        lastModifiedTime: modTime,
        type: tabType
      };

      const updated = [...jsonTabs, newTab];

      set({ jsonTabs: updated });
      localStorage.setItem("fileditor_unified_tabs", JSON.stringify(updated));

      logger.info("useFileStore", `Successfully opened file as new tab: id="${id}", title="${title}"`);
      get().setActiveJsonTab(id);
      get().addRecentJsonFile(cleanPath);
    } catch (err: any) {
      logger.error("useFileStore", `Failed to open file at path="${cleanPath}": ${err?.message || err}`);
      console.error("Fehler beim Öffnen der Datei:", err);
      message.error(`Datei konnte nicht geöffnet werden: "${cleanPath}". Die Datei existiert möglicherweise nicht.`);
    }
  },

  openSchemaFile: async (path) => {
    const { schemaTabs, mode } = get();
    const keys = getStorageKeys(mode);
    const existing = schemaTabs.find(t => t.path === path);
    if (existing) {
      get().setActiveSchemaTab(existing.id);
      return;
    }

    try {
      const content = await invokeTauri("read_file", { path }) as string;
      const modTime = await invokeTauri("get_file_modified_time", { path }) as number;
      const prefix = mode === "json" ? "schema_" : "xmlschema_";
      const id = prefix + Date.now() + Math.random().toString(36).substr(2, 5);
      const title = getFileNameFromPath(path);

      const newTab: Tab = {
        id,
        path,
        title,
        content,
        lastSavedContent: content,
        lastModifiedTime: modTime
      };

      const updated = [...schemaTabs, newTab];
      set({ schemaTabs: updated });
      localStorage.setItem(keys.schemaTabs, JSON.stringify(updated));

      get().setActiveSchemaTab(id);
      get().addRecentSchemaFile(path);
    } catch (err) {
      console.error("Fehler beim Öffnen des Schemas:", err);
    }
  },

  addRecentJsonFile: (path) => {
    const { mode, recentJsonFiles } = get();
    const keys = getStorageKeys(mode);
    let recent = [...recentJsonFiles];
    recent = recent.filter(p => p !== path);
    recent.unshift(path);
    if (recent.length > 5) recent.pop();
    set({ recentJsonFiles: recent });
    localStorage.setItem(keys.recentFiles, JSON.stringify(recent));
  },

  addRecentSchemaFile: (path) => {
    const { mode, recentSchemaFiles } = get();
    const keys = getStorageKeys(mode);
    let recent = [...recentSchemaFiles];
    recent = recent.filter(p => p !== path);
    recent.unshift(path);
    if (recent.length > 5) recent.pop();
    set({ recentSchemaFiles: recent });
    localStorage.setItem(keys.recentSchemaFiles, JSON.stringify(recent));
  },

  clearRecentJsonFiles: () => {
    const { mode } = get();
    const keys = getStorageKeys(mode);
    set({ recentJsonFiles: [] });
    localStorage.removeItem(keys.recentFiles);
  },

  clearRecentSchemaFiles: () => {
    const { mode } = get();
    const keys = getStorageKeys(mode);
    set({ recentSchemaFiles: [] });
    localStorage.removeItem(keys.recentSchemaFiles);
  },

  initialize: async (initialJson, initialSchema, initialXml, initialXmlSchema, initialMarkdown, isIsolated = false) => {
    logger.info("FileStore", `Initializing FileStore tabs & mode states (isIsolated: ${isIsolated})...`);
    let loadedUnifiedTabs: Tab[] = [];
    let loadedActiveTabId: string | null = null;

    if (!isIsolated) {
      try {
        const savedUnifiedTabs = localStorage.getItem("fileditor_unified_tabs");
        const savedActiveTabId = localStorage.getItem("fileditor_active_tab_id");
        if (savedUnifiedTabs) {
          const parsed = JSON.parse(savedUnifiedTabs);
          if (Array.isArray(parsed)) {
            loadedUnifiedTabs = parsed;
          }
          loadedActiveTabId = savedActiveTabId;
        }
        logger.info("FileStore", `Loaded ${loadedUnifiedTabs.length} tabs from localStorage.`);
      } catch (e: any) {
        logger.error("FileStore", "Error loading saved tabs from localStorage", e?.message || String(e));
      }
    }

    const loadTab = async (tab: Tab): Promise<Tab | null> => {
      if (!tab.path) return tab;
      try {
        const exists = await invokeTauri("file_exists", { path: tab.path });
        if (exists === false) return null;
        if (exists === true) {
          const content = await invokeTauri("read_file", { path: tab.path }) as string;
          const modTime = await invokeTauri("get_file_modified_time", { path: tab.path }) as number;
          return {
            ...tab,
            content: typeof content === "string" ? content : tab.content,
            lastSavedContent: typeof content === "string" ? content : tab.lastSavedContent,
            lastModifiedTime: modTime || tab.lastModifiedTime || Date.now()
          };
        }
        return tab;
      } catch (e) {
        return tab;
      }
    };

    const tabPromises = loadedUnifiedTabs.map(loadTab);
    let finalTabs = (await Promise.all(tabPromises)).filter((t): t is Tab => t !== null);

    if (finalTabs.length === 0) {
      if (isIsolated) {
        set({ jsonTabs: [], activeJsonTabId: null });
        return;
      }
      finalTabs = [
        {
          id: "json_default",
          path: null,
          title: "Beispiel.json",
          content: initialJson,
          lastSavedContent: initialJson,
          lastModifiedTime: null,
          type: "json"
        },
        {
          id: "xml_default",
          path: null,
          title: "Beispiel.xml",
          content: initialXml,
          lastSavedContent: initialXml,
          lastModifiedTime: null,
          type: "xml"
        },
        {
          id: "markdown_default",
          path: null,
          title: "Beispiel.md",
          content: initialMarkdown,
          lastSavedContent: initialMarkdown,
          lastModifiedTime: null,
          type: "markdown"
        }
      ];
      loadedActiveTabId = "markdown_default";
    }

    const activeTab = finalTabs.find(t => t.id === loadedActiveTabId) || finalTabs[0];
    const activeMode = getTabMode(activeTab);

    // Load persisted JSON & XML schemas (filtering out any legacy default example schemas)
    let jsonSchemaTabs: Tab[] = [];
    let jsonActiveSchemaId: string | null = null;
    try {
      const saved = localStorage.getItem("fileditor_saved_schema_tabs");
      if (saved) jsonSchemaTabs = stripLegacyDefaultSchemaTabs(JSON.parse(saved));
      localStorage.setItem("fileditor_saved_schema_tabs", JSON.stringify(jsonSchemaTabs));
      jsonActiveSchemaId = localStorage.getItem("fileditor_active_schema_tab_id");
      if (jsonActiveSchemaId && !jsonSchemaTabs.some(st => st.id === jsonActiveSchemaId)) {
        jsonActiveSchemaId = jsonSchemaTabs[0]?.id || null;
        if (jsonActiveSchemaId) localStorage.setItem("fileditor_active_schema_tab_id", jsonActiveSchemaId);
        else localStorage.removeItem("fileditor_active_schema_tab_id");
      }
    } catch {}

    let xmlSchemaTabs: Tab[] = [];
    let xmlActiveSchemaId: string | null = null;
    try {
      const saved = localStorage.getItem("fileditor_saved_xml_schema_tabs");
      if (saved) xmlSchemaTabs = stripLegacyDefaultSchemaTabs(JSON.parse(saved));
      localStorage.setItem("fileditor_saved_xml_schema_tabs", JSON.stringify(xmlSchemaTabs));
      xmlActiveSchemaId = localStorage.getItem("fileditor_active_xml_schema_tab_id");
      if (xmlActiveSchemaId && !xmlSchemaTabs.some(st => st.id === xmlActiveSchemaId)) {
        xmlActiveSchemaId = xmlSchemaTabs[0]?.id || null;
        if (xmlActiveSchemaId) localStorage.setItem("fileditor_active_xml_schema_tab_id", xmlActiveSchemaId);
        else localStorage.removeItem("fileditor_active_xml_schema_tab_id");
      }
    } catch {}
    void initialSchema;
    void initialXmlSchema;

    // Load active schemas based on starting mode
    let schemaTabs: Tab[] = activeMode === "json" ? jsonSchemaTabs : activeMode === "xml" ? xmlSchemaTabs : [];
    let activeSchemaTabId: string | null = activeMode === "json" ? jsonActiveSchemaId : activeMode === "xml" ? xmlActiveSchemaId : null;
    let schemaString = "";
    let schemaValue: any = null;
    let jsonSchemaDialect = get().jsonSchemaDialect;
    let xmlSchemaDialect = get().xmlSchemaDialect;

    if ((activeMode === "json" || activeMode === "xml") && activeTab.schemaTabId && schemaTabs.some(st => st.id === activeTab.schemaTabId)) {
      activeSchemaTabId = activeTab.schemaTabId;
    }

    const activeSchema = schemaTabs.find(t => t.id === activeSchemaTabId) || schemaTabs[0];
    if (activeSchema) {
      schemaString = activeSchema.content;
      if (activeMode === "json") {
        jsonSchemaDialect = (activeSchema.schemaDialect as JsonSchemaDialect) || "auto";
        try {
          schemaValue = JSON.parse(activeSchema.content);
        } catch {}
      } else if (activeMode === "xml") {
        xmlSchemaDialect = (activeSchema.schemaDialect as XmlSchemaDialect) || "auto";
        schemaValue = activeSchema.content;
      }
    }

    const initHistory = [{ jsonString: activeTab.content, schemaString }];
    const activeTabKey = activeTab.path || activeTab.id;
    const initialViewMode: JsonXmlViewMode =
      activeMode === "json" || activeMode === "xml"
        ? get().tabViewStates[activeTabKey]?.viewMode ||
          (activeMode === "json" ? get().defaultJsonViewMode : get().defaultXmlViewMode)
        : get().viewMode;
    set({
      mode: activeMode,
      viewMode: initialViewMode,
      jsonString: activeTab.content,
      jsonTabs: finalTabs,
      activeJsonTabId: activeTab.id,
      schemaTabs,
      activeSchemaTabId: activeSchema ? activeSchema.id : null,
      schemaString,
      schemaValue,
      jsonSchemaDialect,
      xmlSchemaDialect,
      history: initHistory,
      historyIndex: 0,
      tabHistories: {
        [activeTab.id]: { history: initHistory, historyIndex: 0 }
      }
    });

    localStorage.setItem("fileditor_active_tab_id", activeTab.id);
    localStorage.setItem("fileditor_unified_tabs", JSON.stringify(finalTabs));
    if (activeSchema) {
      const schemaKey = activeMode === "json" ? "fileditor_active_schema_tab_id" : "fileditor_active_xml_schema_tab_id";
      const schemaListKey = activeMode === "json" ? "fileditor_saved_schema_tabs" : "fileditor_saved_xml_schema_tabs";
      localStorage.setItem(schemaKey, activeSchema.id);
      localStorage.setItem(schemaListKey, JSON.stringify(schemaTabs));
    }

    get().runValidation(activeTab.content, activeMode);
  }
}));

// Version 3.1
