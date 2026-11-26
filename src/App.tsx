import React, { useEffect, useRef, useState } from "react";
import { ConfigProvider, theme, message } from "antd";
import { Upload } from "lucide-react";
import { useFileStore, getTabMode, Tab, checkAndCloseIfSecondaryInstance } from "./store/useFileStore";
import { useToDoStore } from "./store/useToDoStore";
import { useI18nStore, useTranslation } from "./i18n";
import type { SavedSettingsPayload } from "./components/SettingsModal";
import { TopControlBar } from "./components/TopControlBar";
import { LeftPane } from "./components/LeftPane";
import { RightPane } from "./components/RightPane";
import { GlobalTabBar } from "./components/GlobalTabBar";
import { BottomStatusBar } from "./components/BottomStatusBar";
import { ToDoEditor } from "./components/ToDoEditor";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { UpdateModal } from "./components/UpdateModal";
import { useExternalFileWatch } from "./hooks/useExternalFileWatch";
import { logger } from "./utils/logger";
import { invokeTauriSafe, listenNativeFileDrop, listenTauri } from "./utils/tauriBridge";
import { APP_VERSION } from "./version";
import rawChangelog from "../CHANGELOG.md?raw";

const GraphViewModal = React.lazy(() => import("./components/GraphViewModal").then(m => ({ default: m.GraphViewModal })));

const extractLatestChangelogSections = (changelogRaw: string, maxSections = 3): string => {
  const matches = [...changelogRaw.matchAll(/(?=^##\s+\[)/gm)];
  if (matches.length === 0) return changelogRaw.trim();
  const firstIdx = matches[0].index ?? 0;
  const endIdx =
    matches.length > maxSections
      ? (matches[maxSections].index ?? changelogRaw.length)
      : changelogRaw.length;
  return changelogRaw.slice(firstIdx, endIdx).trim();
};

const buildFirstRunWelcomeMarkdown = (): string => {
  const latestChanges = extractLatestChangelogSections(rawChangelog, 3);
  return `# Thanks for Downloading Fileditor!

Welcome to **Fileditor v${APP_VERSION}** — your fast, 100% offline desktop workspace for **JSON**, **XML**, **Markdown**, **ToDo**, and **Plain Text**.

:::tip
**Quick Start:** Drag and drop any supported file directly onto this window to open it, or click **File -> New** in the top menu. You can switch the UI language (**English**, **Deutsch**, **Español**) anytime under **Extras -> Settings**.
:::

---

## Latest Changes

${latestChanges}
`;
};

const App: React.FC = () => {
  const {
    initialize,
    mode,
    undo,
    redo,
    jsonTabs,
    activeJsonTabId,
    activeSchemaTabId,
    saveJsonTab,
    saveSchemaTab,
    saveAll,
    isRightPaneFullscreen,
    setRightPaneFullscreen,
    graphEnabled,
    isGraphViewOpen,
    accentTheme
  } = useFileStore();

  const { t } = useTranslation();
  const { todoPluginEnabled } = useToDoStore();

  const [splitWidth, setSplitWidth] = React.useState<number>(50); // In Prozent
  const [isDesktop, setIsDesktop] = React.useState<boolean>(window.innerWidth >= 768);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [isIsolatedInstance, setIsIsolatedInstance] = useState<boolean>(false);
  const [startupUpdateOpen, setStartupUpdateOpen] = useState<boolean>(false);
  const [showTabSwitcher, setShowTabSwitcher] = useState<boolean>(false);
  const [switcherIndex, setSwitcherIndex] = useState<number>(0);
  const [isDraggingFileOver, setIsDraggingFileOver] = useState<boolean>(false);

  // Watch for external modifications on the active tab (Notepad++ behavior, only after initialization)
  useExternalFileWatch(isInitializing);

  const activeTab = jsonTabs.find(t => t.id === activeJsonTabId);
  const isTodoTab = activeTab?.type === "todo" || activeTab?.id === "todo_plugin_tab" || (activeTab ? getTabMode(activeTab) === "todo" : false);

  // Sync persistent ToDo tab when ToDo Plugin is active
  useEffect(() => {
    if (todoPluginEnabled) {
      const currentTabs = useFileStore.getState().jsonTabs;
      const hasTodoTab = currentTabs.some(t => t.id === "todo_plugin_tab" || t.type === "todo");
      if (!hasTodoTab) {
        const todoTab: Tab = {
          id: "todo_plugin_tab",
          path: null,
          title: "ToDo-Liste",
          content: "",
          lastSavedContent: "",
          lastModifiedTime: null,
          pinned: true,
          type: "todo"
        };
        useFileStore.setState({ jsonTabs: [todoTab, ...currentTabs] });
      }
    } else {
      const currentTabs = useFileStore.getState().jsonTabs;
      const updated = currentTabs.filter(t => t.id !== "todo_plugin_tab");
      if (updated.length < currentTabs.length) {
        useFileStore.setState({ jsonTabs: updated });
      }
    }
  }, [todoPluginEnabled]);

  // Resolve editor mode from a file extension so CLI launches and drag & drop stay consistent
  const detectModeForPath = (filePath: string): "todo" | "markdown" | "xml" | "json" | "txt" => {
    const ext = filePath.split(".").pop()?.toLowerCase();
    if (ext === "todo" || ext === "todo.json") return "todo";
    if (ext === "md" || ext === "markdown") return "markdown";
    if (ext === "xml" || ext === "xsd" || ext === "dtd" || ext === "rng" || ext === "sch") return "xml";
    if (ext === "json") return "json";
    return "txt";
  };

  // Helper to open file by path with validation & error handling
  const openFileByPath = async (filePath: string) => {
    if (!filePath || !filePath.trim()) return;
    const cleanPath = filePath.trim();
    logger.info("App", `openFileByPath invoked for: "${cleanPath}"`);

    const targetMode = detectModeForPath(cleanPath);
    const { setMode, openJsonFile } = useFileStore.getState();

    try {
      setMode(targetMode);
      await openJsonFile(cleanPath);
      logger.info("App", `openFileByPath successfully finished for: "${cleanPath}"`);
    } catch (err: any) {
      logger.error("App", `openFileByPath encountered error for "${cleanPath}": ${err?.message || err}`);
      message.error(
        useI18nStore.getState().t("app.openFileError", {
          path: cleanPath,
          error: err?.message || String(err)
        })
      );
    }
  };

  const openFileByPathRef = useRef(openFileByPath);
  openFileByPathRef.current = openFileByPath;

  // App-wide native OS Drag & Drop listener for all supported file types
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    const isInsideSchemaDropZone = (pos?: { x: number; y: number }): boolean => {
      if (!pos) return false;
      const schemaEl = document.getElementById("fileditor-schema-drop-zone");
      if (!schemaEl) return false;
      const rect = schemaEl.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const dpr = window.devicePixelRatio || 1;
      const logicalX = pos.x / dpr;
      const logicalY = pos.y / dpr;
      return (
        logicalX >= rect.left &&
        logicalX <= rect.right &&
        logicalY >= rect.top &&
        logicalY <= rect.bottom
      );
    };

    const setupDrop = async () => {
      const u = await listenNativeFileDrop(async (payload) => {
        if (payload.type === "enter" || payload.type === "over") {
          setIsDraggingFileOver(!isInsideSchemaDropZone(payload.position));
        } else if (payload.type === "leave") {
          setIsDraggingFileOver(false);
        } else if (payload.type === "drop") {
          const hitSchema = isInsideSchemaDropZone(payload.position);
          setIsDraggingFileOver(false);
          if (!hitSchema && payload.paths && payload.paths.length > 0) {
            for (const droppedPath of payload.paths) {
              await openFileByPathRef.current(droppedPath);
            }
          }
        }
      });
      if (u) {
        if (disposed) u();
        else unlisten = u;
      }
    };

    setupDrop();
    return () => {
      disposed = true;
      if (unlisten) unlisten();
    };
  }, []);

  // Initialize store with initial data and check for files passed at startup
  useEffect(() => {
    const initApp = async () => {
      logger.info("App", `Initializing Fileditor frontend v${APP_VERSION}...`);
      useFileStore.getState().cleanupExpiredBackups();
      let isIsolated = false;
      let launchPath: string | null = null;
      try {
        const isolatedRes = await invokeTauriSafe<boolean>("is_isolated_instance");
        isIsolated = Boolean(isolatedRes);
        setIsIsolatedInstance(isIsolated);
        launchPath = await invokeTauriSafe<string | null>("get_launch_file");
      } catch (err: any) {
        logger.error("App", "Error querying launch arguments from backend", err?.message || String(err));
      }

      await initialize(
        "",
        "",
        "",
        "",
        buildFirstRunWelcomeMarkdown(),
        isIsolated
      );

      try {
        if (launchPath) {
          logger.info("App", `Launch argument file detected: ${launchPath}`);
          await openFileByPath(launchPath);
        } else {
          logger.info("App", "No launch argument file reported by get_launch_file.");
        }
      } catch (err: any) {
        logger.error("App", "Error checking launch file argument", err?.message || String(err));
      } finally {
        logger.info("App", "Application initialization complete.");
        setIsInitializing(false);
        invokeTauriSafe("focus_current_window");
      }
    };

    initApp();
  }, []);

  // Optional background startup update check when enabled by user
  useEffect(() => {
    if (isInitializing || isIsolatedInstance) return;
    if (!useFileStore.getState().autoCheckUpdates) return;

    const timer = setTimeout(() => {
      setStartupUpdateOpen(true);
    }, 1500);

    return () => clearTimeout(timer);
  }, [isInitializing, isIsolatedInstance]);

  // Set unique instance ID and maintain active instance heartbeat for multi-instance detection
  useEffect(() => {
    if (!(window as any).__FILEDITOR_INSTANCE_ID__) {
      (window as any).__FILEDITOR_INSTANCE_ID__ = `inst_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    }
    const updateHeartbeat = () => {
      const myInstanceId = (window as any).__FILEDITOR_INSTANCE_ID__;
      if (myInstanceId) {
        localStorage.setItem(`fileditor_heartbeat_${myInstanceId}`, Date.now().toString());
      }
    };
    updateHeartbeat();
    const interval = setInterval(updateHeartbeat, 1000);
    const cleanup = () => {
      const myInstanceId = (window as any).__FILEDITOR_INSTANCE_ID__;
      if (myInstanceId) {
        localStorage.removeItem(`fileditor_heartbeat_${myInstanceId}`);
      }
    };
    window.addEventListener("beforeunload", cleanup);
    return () => {
      clearInterval(interval);
      window.removeEventListener("beforeunload", cleanup);
      cleanup();
    };
  }, []);

  // Global copy listener for Windows Clipboard History (Win + V)
  useEffect(() => {
    const handleGlobalCopy = () => {
      setTimeout(async () => {
        try {
          const text = await navigator.clipboard.readText();
          if (text) {
            invokeTauriSafe("native_write_clipboard", { text });
          }
        } catch {}
      }, 40);
    };
    document.addEventListener("copy", handleGlobalCopy);
    return () => document.removeEventListener("copy", handleGlobalCopy);
  }, []);

  // Persist open tabs of the last closed instance & backup them into persistent restore storage
  useEffect(() => {
    const handleBeforeUnload = () => {
      const { jsonTabs, backupTabsFromInstance } = useFileStore.getState();
      if (jsonTabs && jsonTabs.length > 0) {
        localStorage.setItem("fileditor_unified_tabs", JSON.stringify(jsonTabs));
        backupTabsFromInstance(jsonTabs);
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // Real-time cross-instance settings sync and tab transfers
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (!e.key) return;
      if (e.key === "fileditor_enabled_file_types" && e.newValue) {
        try {
          useFileStore.getState().setEnabledFileTypes(JSON.parse(e.newValue));
        } catch (err) {}
      }
      if (e.key === "fileditor_settings_custom_hotkeys" && e.newValue) {
        try {
          useFileStore.setState({ customHotkeys: JSON.parse(e.newValue) });
        } catch (err) {}
      }
      if (e.key === "fileditor_language" && e.newValue) {
        if (useI18nStore.getState().currentLanguage !== e.newValue) {
          useI18nStore.getState().setLanguage(e.newValue);
        }
      }
      if (e.key === "fileditor_accent_theme" && e.newValue) {
        try {
          useFileStore.getState().setAccentTheme(JSON.parse(e.newValue));
        } catch (err) {}
      }
      if (e.key === "fileditor_todo_plugin_enabled" && e.newValue) {
        try {
          useToDoStore.getState().setTodoPluginEnabled(JSON.parse(e.newValue));
        } catch (err) {}
      }
      if (e.key === "fileditor_auto_check_updates" && e.newValue) {
        try {
          useFileStore.setState({ autoCheckUpdates: JSON.parse(e.newValue) });
        } catch {}
      }
      if (e.key === "fileditor_tab_transfer_incoming" && e.newValue) {
        try {
          const { targetInstanceId, tab, isSchema } = JSON.parse(e.newValue);
          const myInstanceId = (window as any).__FILEDITOR_INSTANCE_ID__;
          if (targetInstanceId === myInstanceId && tab) {
            invokeTauriSafe("focus_current_window");
            if (isSchema) {
              useFileStore.getState().addSchemaTab(tab.path, tab.content);
            } else {
              useFileStore.getState().addJsonTab(tab.path, tab.content, tab.type || getTabMode(tab));
            }
          }
        } catch {}
      }
      if (e.key === "fileditor_tab_transfer" && e.newValue) {
        try {
          const { sourceInstanceId, tabId } = JSON.parse(e.newValue);
          const myInstanceId = (window as any).__FILEDITOR_INSTANCE_ID__;
          if (sourceInstanceId === myInstanceId && tabId) {
            const { jsonTabs, closeJsonTab } = useFileStore.getState();
            const tabToRemove = jsonTabs.find(t => t.id === tabId);
            if (tabToRemove) {
              closeJsonTab(tabId);
              checkAndCloseIfSecondaryInstance();
            }
          }
        } catch {}
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  // Live-sync settings, theme, and language emitted from native Settings / About windows
  useEffect(() => {
    let unlistenSaved: (() => void) | null = null;
    let unlistenTheme: (() => void) | null = null;
    let unlistenLang: (() => void) | null = null;

    const setup = async () => {
      unlistenSaved = await listenTauri<SavedSettingsPayload>("fileditor-settings-saved", (p) => {
        if (!p) return;

        const fs = useFileStore.getState();
        if (typeof p.autoCheckUpdates === "boolean") {
          fs.setAutoCheckUpdates(p.autoCheckUpdates);
        }
        fs.setGraphEnabled(p.graphEnabled);
        fs.setBackupRetentionDays(p.backupRetentionDays);
        fs.setMarkdownRememberViewState(p.markdownRememberViewState);
        fs.setMarkdownSyncEditorFromPreview(p.markdownSyncEditorFromPreview);
        fs.setMarkdownSyncPreviewFromEditor(p.markdownSyncPreviewFromEditor);
        fs.setDateSupport(p.dateSupport);
        fs.setDocusaurusSupport(p.docusaurusSupport);
        fs.setFullscreenMarkdownWidth(p.fullscreenMarkdownWidth);
        fs.setFullscreenMarkdownZoom(p.fullscreenMarkdownZoom);
        fs.setEnabledFileTypes(p.enabledFileTypes);
        fs.setMarkdownAutoNumbering(p.markdownAutoNumbering);
        fs.setMarkdownPreserveNumbering(p.markdownPreserveNumbering);
        fs.setTodoAutoCompleteChildren(p.todoAutoCompleteChildren);
        fs.setTodoAutoCollapseParentOnComplete(p.todoAutoCollapseParentOnComplete);
        fs.setTodoHideCompleted(p.todoHideCompleted);
        if (p.defaultJsonViewMode) fs.setDefaultJsonViewMode(p.defaultJsonViewMode);
        if (p.defaultXmlViewMode) fs.setDefaultXmlViewMode(p.defaultXmlViewMode);
        Object.entries(p.customHotkeys || {}).forEach(([act, shortcut]) => {
          fs.setCustomHotkey(act, shortcut);
        });

        useToDoStore.getState().setTodoCascadingIndent(p.todoCascadingIndent);

        // Close open tabs whose file types were disabled
        const latestState = useFileStore.getState();
        const tabsToClose = latestState.jsonTabs.filter((tab) => {
          const tabMode = getTabMode(tab);
          if (tabMode === "xml" && !p.enabledFileTypes.xml) return true;
          if (tabMode === "json" && !p.enabledFileTypes.json) return true;
          if (tabMode === "markdown" && !p.enabledFileTypes.markdown) return true;
          if (tabMode === "todo" && !p.enabledFileTypes.todo) return true;
          return false;
        });
        if (tabsToClose.length > 0) {
          tabsToClose.forEach((tab) => latestState.closeJsonTab(tab.id));
        }

        message.success(useI18nStore.getState().t("settings.savedSuccess"));
      });

      unlistenTheme = await listenTauri<any>("fileditor-accent-theme-changed", (payload) => {
        if (payload) {
          const current = useFileStore.getState().accentTheme;
          if (JSON.stringify(current) !== JSON.stringify(payload)) {
            useFileStore.getState().setAccentTheme(payload);
          }
        }
      });

      unlistenLang = await listenTauri<string>("fileditor-language-changed", (payload) => {
        if (typeof payload === "string") {
          const i18n = useI18nStore.getState();
          if (i18n.currentLanguage !== payload) {
            i18n.setLanguage(payload);
          }
        }
      });
    };

    setup();
    return () => {
      if (unlistenSaved) unlistenSaved();
      if (unlistenTheme) unlistenTheme();
      if (unlistenLang) unlistenLang();
    };
  }, []);

  // Publish window/tabbar position for cross-instance drop detection
  useEffect(() => {
    let rafId: number | null = null;
    const updateRect = () => {
      const myInstanceId = (window as any).__FILEDITOR_INSTANCE_ID__;
      if (!myInstanceId) return;
      localStorage.setItem(`fileditor_instance_rect_${myInstanceId}`, JSON.stringify({
        id: myInstanceId,
        left: window.screenX,
        right: window.screenX + window.outerWidth,
        top: window.screenY,
        bottom: window.screenY + 90,
        timestamp: Date.now()
      }));
    };

    const throttledUpdateRect = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        updateRect();
        rafId = null;
      });
    };

    updateRect();
    const interval = setInterval(updateRect, 1000);
    window.addEventListener("resize", throttledUpdateRect, { passive: true });
    window.addEventListener("focus", updateRect);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      clearInterval(interval);
      window.removeEventListener("resize", throttledUpdateRect);
      window.removeEventListener("focus", updateRect);
      const myInstanceId = (window as any).__FILEDITOR_INSTANCE_ID__;
      if (myInstanceId) {
        localStorage.removeItem(`fileditor_instance_rect_${myInstanceId}`);
      }
    };
  }, []);

  // Listen for files passed from secondary instances (e.g. "Open with..." while app is running)
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    const setupListener = async () => {
      unlisten = await listenTauri<string>("single-instance-file", async (path) => {
        logger.info("App", `single-instance-file event received payload: "${path}"`);
        if (path) {
          await openFileByPath(path);
        }
      });
    };
    setupListener();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // Keyboard navigation Tab Switcher (Ctrl + Tab)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const { jsonTabs, activeJsonTabId } = useFileStore.getState();
      if (jsonTabs.length <= 1) return;

      if (e.ctrlKey && e.key === "Tab") {
        e.preventDefault();
        setShowTabSwitcher(true);
        setSwitcherIndex(prevIndex => {
          let nextIndex = 0;
          if (showTabSwitcher) {
            nextIndex = (prevIndex + 1) % jsonTabs.length;
          } else {
            const activeIdx = jsonTabs.findIndex(t => t.id === activeJsonTabId);
            nextIndex = (activeIdx + 1) % jsonTabs.length;
          }
          return nextIndex;
        });
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Control") {
        setShowTabSwitcher(prevShow => {
          if (prevShow) {
            const { jsonTabs, setActiveJsonTab } = useFileStore.getState();
            setSwitcherIndex(currIndex => {
              if (jsonTabs[currIndex]) {
                setActiveJsonTab(jsonTabs[currIndex].id);
              }
              return currIndex;
            });
          }
          return false;
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [showTabSwitcher]);



  // Monitor window resize with debounced check to avoid excessive layout re-renders
  useEffect(() => {
    let rafId: number | null = null;
    const handleResize = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        const isNowDesktop = window.innerWidth >= 768;
        setIsDesktop((prev) => (prev !== isNowDesktop ? isNowDesktop : prev));
        rafId = null;
      });
    };
    window.addEventListener("resize", handleResize, { passive: true });
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // Reset fullscreen mode when switching active tabs unless tab remembers view state
  useEffect(() => {
    const { jsonTabs, markdownRememberViewState, tabViewStates } = useFileStore.getState();
    const currentTab = jsonTabs.find(t => t.id === activeJsonTabId);
    const isMarkdown = currentTab ? getTabMode(currentTab) === "markdown" : false;

    if (isMarkdown && markdownRememberViewState) {
      const tabKey = currentTab?.path || currentTab?.id || "";
      const saved = tabViewStates[tabKey];
      if (saved && typeof saved.isFullscreen === "boolean") {
        setRightPaneFullscreen(saved.isFullscreen);
        return;
      }
    }
    setRightPaneFullscreen(false);
  }, [activeJsonTabId, setRightPaneFullscreen]);

  // Register global keyboard shortcuts (F11, Escape, Ctrl+Z, Ctrl+Y, Ctrl+S, Ctrl+Shift+S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrl = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (e.key === "F11") {
        const currentMode = useFileStore.getState().mode;
        if (currentMode === "markdown") {
          e.preventDefault();
          const { isRightPaneFullscreen, setRightPaneFullscreen } = useFileStore.getState();
          setRightPaneFullscreen(!isRightPaneFullscreen);
          return;
        }
      } else if (e.key === "Escape") {
        const { isRightPaneFullscreen, setRightPaneFullscreen } = useFileStore.getState();
        if (isRightPaneFullscreen) {
          e.preventDefault();
          setRightPaneFullscreen(false);
          return;
        }
      } else if (isCtrl && !e.shiftKey && key === "z") {
        e.preventDefault();
        if (mode === "todo") {
          useToDoStore.getState().undo();
        } else {
          undo();
        }
      } else if (isCtrl && key === "y") {
        e.preventDefault();
        if (mode === "todo") {
          useToDoStore.getState().redo();
        } else {
          redo();
        }
      } else if (isCtrl && e.shiftKey && key === "s") {
        e.preventDefault();
        saveAll();
      } else if (isCtrl && e.altKey && key === "s") {
        e.preventDefault();
        if ((window as any).__FILEDITOR_SCHEMA_FOCUSED__) {
          saveSchemaTab(null, null, true);
        } else {
          saveJsonTab(null, null, true);
        }
      } else if (isCtrl && key === "s") {
        e.preventDefault();
        if ((window as any).__FILEDITOR_SCHEMA_FOCUSED__) {
          saveSchemaTab();
        } else {
          saveJsonTab();
        }
      } else if (isCtrl && key === "p") {
        e.preventDefault();
        const printBtn = document.querySelector('button[title*="Ctrl+P"]') as HTMLButtonElement;
        if (printBtn) {
          printBtn.click();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo, mode, activeJsonTabId, activeSchemaTabId, saveJsonTab, saveSchemaTab, saveAll, setRightPaneFullscreen]);

  // Starts split pane resizing via drag and drop
  const handleSplitterMouseDown = (mouseDownEvent: React.MouseEvent) => {
    mouseDownEvent.preventDefault();
    const startX = mouseDownEvent.clientX;
    const startWidth = splitWidth;

    const handleMouseMove = (mouseMoveEvent: MouseEvent) => {
      const deltaX = mouseMoveEvent.clientX - startX;
      const deltaPercent = (deltaX / window.innerWidth) * 100;
      let newWidth = startWidth + deltaPercent;

      // Grenzbereiche festlegen (z. B. 20% bis 80%)
      if (newWidth < 20) newWidth = 20;
      if (newWidth > 80) newWidth = 80;

      setSplitWidth(newWidth);
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  if (isInitializing) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-[#090d16] text-white select-none">
        <div className="flex flex-col items-center space-y-4">
          <img src="/Logo.png" alt="Logo" className="h-16 w-auto animate-bounce select-none pointer-events-none" />
          <div className="flex items-center space-x-2">
            <div
              className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: "var(--color-primary-accent)", borderTopColor: "transparent" }}
            ></div>
            <span className="text-sm font-semibold tracking-wider font-mono text-slate-400">{t("app.loading")}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: accentTheme.primaryAccent,
          fontFamily: "Plus Jakarta Sans, sans-serif",
          borderRadius: 6
        },
        components: {
          Segmented: {
            itemSelectedBg: "#1f293d",
            itemSelectedColor: "#ffffff",
            trackBg: "#141c2c"
          }
        }
      }}
    >
      <div
        className="flex flex-col h-screen w-screen bg-hero-bg overflow-hidden text-slate-200 relative"
        onDragOver={(e) => {
          if (e.dataTransfer?.types?.includes("Files")) {
            const targetEl = e.target as HTMLElement | null;
            if (targetEl?.closest("#fileditor-schema-drop-zone")) {
              setIsDraggingFileOver(false);
              return;
            }
            e.preventDefault();
            setIsDraggingFileOver(true);
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsDraggingFileOver(false);
          }
        }}
        onDrop={async (e) => {
          const targetEl = e.target as HTMLElement | null;
          if (targetEl?.closest("#fileditor-schema-drop-zone")) {
            setIsDraggingFileOver(false);
            return;
          }
          const files = e.dataTransfer?.files;
          if (files && files.length > 0) {
            e.preventDefault();
            setIsDraggingFileOver(false);
            for (const item of Array.from(files)) {
              const file = item as File & { path?: string };
              if (file.path) {
                await openFileByPathRef.current(file.path);
              } else {
                try {
                  const text = await file.text();
                  const { setMode, addJsonTab } = useFileStore.getState();
                  setMode(detectModeForPath(file.name));
                  addJsonTab(null, text);
                } catch {}
              }
            }
          }
        }}
      >
        {isDraggingFileOver && (
          <div
            className="fixed inset-0 z-[9998] flex flex-col items-center justify-center gap-3 backdrop-blur-sm border-2 border-dashed rounded m-1 pointer-events-none"
            style={{
              backgroundColor: "rgba(9, 13, 22, 0.85)",
              borderColor: "var(--color-primary-accent)"
            }}
          >
            <Upload size={32} style={{ color: "var(--color-primary-accent)" }} />
            <span className="text-sm font-mono font-semibold text-white px-6 text-center">
              {t("app.fileDropHint")}
            </span>
          </div>
        )}
        {/* Obere Werkzeugleiste */}
        <TopControlBar />

        {/* Global Tab Bar spanning full width for all modes */}
        <GlobalTabBar isSchema={false} />

        {/* Split-Screen Dashboard Layout or ToDo Workspace */}
        <main className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
          {isTodoTab ? (
            <ToDoEditor />
          ) : mode === "txt" ? (
            <section className="w-full h-full flex flex-col">
              <LeftPane />
            </section>
          ) : (
            <>
              {/* Linker Bereich: Monaco Editoren */}
              <section
                style={isRightPaneFullscreen ? { display: "none" } : (isDesktop ? { width: `${splitWidth}%` } : {})}
                className="w-full md:w-auto h-1/2 md:h-full flex flex-col min-w-[250px]"
              >
                <LeftPane />
              </section>

              {/* Trennbalken (Splitter) - nur auf Desktop sichtbar */}
              {!isRightPaneFullscreen && (
                <div
                  onMouseDown={handleSplitterMouseDown}
                  className="splitter-bar hidden md:block w-1 hover:w-1.5 bg-hero-border cursor-col-resize transition-all h-full select-none shrink-0"
                />
              )}

              {/* Rechter Bereich: Interaktive Live-Ansichten */}
              <section
                style={isRightPaneFullscreen ? { width: "100%" } : (isDesktop ? { width: `${100 - splitWidth}%` } : {})}
                className="w-full md:w-auto h-1/2 md:h-full flex flex-col min-w-[250px]"
              >
                <RightPane />
              </section>
            </>
          )}
        </main>

        {/* Global Bottom Status Bar spanning full width across the entire app */}
        {!isTodoTab && <BottomStatusBar />}
      </div>

      {/* Tab Switcher Overlay */}
      {showTabSwitcher && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center pointer-events-none select-none">
          <div className="bg-[#0f172a]/95 border border-slate-800 rounded-xl shadow-2xl p-4 w-80 max-w-full space-y-3">
            <div className="text-[10px] uppercase font-mono tracking-wider font-semibold text-slate-500 pb-1.5 border-b border-slate-800">
              {t("app.tabSwitcherTitle")}
            </div>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {useFileStore.getState().jsonTabs.map((tab, idx) => {
                const isSelected = idx === switcherIndex;
                const isDirty = tab.content !== tab.lastSavedContent;
                return (
                  <div
                    key={tab.id}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-mono transition-all duration-150 ${
                      isSelected ? "text-white font-bold shadow-md" : "text-slate-400"
                    }`}
                    style={
                      isSelected
                        ? {
                            backgroundColor: "var(--color-primary-accent)",
                            boxShadow: "0 4px 12px rgba(var(--color-primary-accent-rgb), 0.25)"
                          }
                        : undefined
                    }
                  >
                    <span className="truncate max-w-[200px]">{tab.title}</span>
                    {isDirty && <span className={isSelected ? "text-white/80" : "text-amber-500"}>*</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {graphEnabled && isGraphViewOpen && (
        <React.Suspense fallback={null}>
          <GraphViewModal />
        </React.Suspense>
      )}
      <UpdateModal
        open={startupUpdateOpen}
        manualTrigger={false}
        onClose={() => setStartupUpdateOpen(false)}
      />
    </ConfigProvider>
  );
};

// Render loading page & wrap with ErrorBoundary
const AppContainer: React.FC = () => {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
};

export default AppContainer;
// Version 3.4