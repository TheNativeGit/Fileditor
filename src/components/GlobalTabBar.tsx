import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { Button, Dropdown, Tooltip } from "antd";
import { useTranslation } from "../i18n";
import {
  X,
  Pin,
  FileCode,
  FileText,
  Edit3,
  AlignLeft,
  Braces,
  Code2,
  CheckSquare,
  Network
} from "lucide-react";
import { useFileStore, Tab, getTabMode, checkAndCloseIfSecondaryInstance } from "../store/useFileStore";
import { invokeTauriSafe } from "../utils/tauriBridge";

const getFileNameFromPath = (path: string): string => {
  return path.split(/[/\\]/).pop() || path;
};

interface GlobalTabBarProps {
  isSchema?: boolean;
}

interface PointerDragSession {
  tabId: string;
  currentIndex: number;
  startX: number;
  startY: number;
  lastClientX: number;
  lastClientY: number;
  grabOffsetInTab: number;
  started: boolean;
}

export const GlobalTabBar: React.FC<GlobalTabBarProps> = ({ isSchema = false }) => {
  const {
    mode,
    jsonString,
    hasSyntaxError,
    jsonTabs,
    activeJsonTabId,
    schemaTabs,
    activeSchemaTabId,
    setActiveJsonTab,
    setActiveSchemaTab,
    closeJsonTab,
    closeSchemaTab,
    moveJsonTab,
    moveSchemaTab,
    saveJsonTab,
    saveSchemaTab,
    closeMultipleJsonTabs,
    closeMultipleSchemaTabs,
    togglePinJsonTab,
    togglePinSchemaTab,
    setGraphViewOpen,
    graphEnabled
  } = useFileStore();

  const { t } = useTranslation();

  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [isDraggingOut, setIsDraggingOut] = useState(false);
  const tabBarRef = useRef<HTMLDivElement>(null);
  const floatingPreviewRef = useRef<HTMLDivElement>(null);
  const tabNodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // FLIP snapshot of visual left coordinates right before an array reorder
  const flipSnapshotRef = useRef<Map<string, number>>(new Map());

  // States for Close Confirm modals
  const [closeConfirmTab, setCloseConfirmTab] = useState<{ id: string; title: string; isSchema: boolean } | null>(null);
  const [multiCloseConfirm, setMultiCloseConfirm] = useState<{ tabIdsToClose: string[]; isSchema: boolean } | null>(null);

  // Refs for zero-rerender 60/120fps drag tracking
  const dragSessionRef = useRef<PointerDragSession | null>(null);
  const isDraggingOutRef = useRef<boolean>(false);
  const suppressNextClickRef = useRef<boolean>(false);
  const tabsListRef = useRef<Tab[]>([]);
  const isSchemaRef = useRef<boolean>(isSchema);
  const modeRef = useRef<string>(mode);
  const edgeScrollRafRef = useRef<number | null>(null);
  const hasInitialScrolledRef = useRef<boolean>(false);

  const tabsList = isSchema ? schemaTabs : jsonTabs;
  const activeTabId = isSchema ? activeSchemaTabId : activeJsonTabId;

  useEffect(() => {
    tabsListRef.current = tabsList;
  }, [tabsList]);

  useEffect(() => {
    isSchemaRef.current = isSchema;
  }, [isSchema]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // ==========================================================================
  // Auto-scroll active/focused tab into view (especially on app startup!)
  // ==========================================================================
  useEffect(() => {
    if (!activeTabId) return;
    if (dragSessionRef.current?.started) return;

    const scrollActiveIntoView = (smooth: boolean) => {
      const container = tabBarRef.current;
      const tabEl = tabNodeRefs.current.get(activeTabId);
      if (!container || !tabEl) return;

      const containerWidth = container.clientWidth;
      if (containerWidth <= 0) return;

      const tabLeft = tabEl.offsetLeft;
      const tabWidth = tabEl.offsetWidth;
      const tabRight = tabLeft + tabWidth;
      const viewLeft = container.scrollLeft;
      const viewRight = viewLeft + containerWidth;
      const margin = 20;

      if (tabLeft < viewLeft + margin) {
        container.scrollTo({
          left: Math.max(0, tabLeft - margin),
          behavior: smooth ? "smooth" : "auto"
        });
      } else if (tabRight > viewRight - margin) {
        container.scrollTo({
          left: Math.max(0, tabRight - containerWidth + margin),
          behavior: smooth ? "smooth" : "auto"
        });
      }
    };

    const isFirstScroll = !hasInitialScrolledRef.current;
    const rafId = requestAnimationFrame(() => {
      scrollActiveIntoView(!isFirstScroll);
    });

    let timerId: ReturnType<typeof setTimeout> | null = null;
    if (isFirstScroll && tabsList.length > 0) {
      hasInitialScrolledRef.current = true;
      // Second pass after webfont/layout settle on cold app startup
      timerId = setTimeout(() => {
        scrollActiveIntoView(true);
      }, 90);
    }

    return () => {
      cancelAnimationFrame(rafId);
      if (timerId) clearTimeout(timerId);
    };
  }, [activeTabId, tabsList.length]);

  // Helper to compute & apply smooth foreground transform on the dragged tab
  const applyDraggedTabTransform = (session: PointerDragSession) => {
    const container = tabBarRef.current;
    const dragEl = tabNodeRefs.current.get(session.tabId);
    if (!container || !dragEl) return;

    if (isDraggingOutRef.current) {
      dragEl.style.transition = "transform 180ms cubic-bezier(0.22, 1, 0.36, 1), opacity 150ms ease";
      dragEl.style.transform = "translate3d(0, 0, 0)";
      return;
    }

    const barRect = container.getBoundingClientRect();
    const desiredLeft = session.lastClientX - barRect.left + container.scrollLeft - session.grabOffsetInTab;
    const dx = desiredLeft - dragEl.offsetLeft;

    dragEl.style.transition = "none";
    dragEl.style.transform = `translate3d(${dx}px, -1px, 0) scale(1.03)`;
  };

  // Capture mid-flight visual positions of all tabs and check if dragged tab crossed neighbors
  const evaluateSwapAtPointer = (session: PointerDragSession) => {
    const container = tabBarRef.current;
    const dragEl = tabNodeRefs.current.get(session.tabId);
    if (!container || !dragEl || isDraggingOutRef.current) return;

    const list = tabsListRef.current;
    const currentIdx = list.findIndex((t) => t.id === session.tabId);
    if (currentIdx === -1) return;
    session.currentIndex = currentIdx;

    const draggedTab = list[currentIdx];
    const numPinned = list.filter((t) => t.pinned).length;
    const minIdx = draggedTab.pinned ? 0 : numPinned;
    const maxIdx = draggedTab.pinned ? Math.max(0, numPinned - 1) : list.length - 1;
    if (minIdx >= maxIdx) return;

    const barRect = container.getBoundingClientRect();
    const desiredLeft = session.lastClientX - barRect.left + container.scrollLeft - session.grabOffsetInTab;
    const dragCenter = desiredLeft + dragEl.offsetWidth * 0.5;

    let targetIdx = currentIdx;

    // Check rightward crossings (handles rapid multi-tab sweeps in one frame)
    for (let i = currentIdx + 1; i <= maxIdx; i++) {
      const neighbor = tabNodeRefs.current.get(list[i].id);
      if (!neighbor) break;
      const neighborMid = neighbor.offsetLeft + neighbor.offsetWidth * 0.5;
      if (dragCenter > neighborMid) {
        targetIdx = i;
      } else {
        break;
      }
    }

    // Check leftward crossings
    if (targetIdx === currentIdx) {
      for (let i = currentIdx - 1; i >= minIdx; i--) {
        const neighbor = tabNodeRefs.current.get(list[i].id);
        if (!neighbor) break;
        const neighborMid = neighbor.offsetLeft + neighbor.offsetWidth * 0.5;
        if (dragCenter < neighborMid) {
          targetIdx = i;
        } else {
          break;
        }
      }
    }

    if (targetIdx !== currentIdx) {
      // Snapshot every tab's exact on-screen X (including any mid-flight CSS transition!)
      const snapshot = new Map<string, number>();
      list.forEach((t) => {
        if (t.id === session.tabId) return;
        const el = tabNodeRefs.current.get(t.id);
        if (el) {
          snapshot.set(t.id, el.getBoundingClientRect().left);
        }
      });
      flipSnapshotRef.current = snapshot;
      session.currentIndex = targetIdx;

      if (isSchemaRef.current) {
        moveSchemaTab(currentIdx, targetIdx);
      } else {
        moveJsonTab(currentIdx, targetIdx);
      }
    }
  };

  // ==========================================================================
  // FLIP Animation on Tab Swap (Displaced tabs wipe smoothly under active tab)
  // ==========================================================================
  useLayoutEffect(() => {
    const session = dragSessionRef.current;
    if (session?.started) {
      applyDraggedTabTransform(session);
    }

    const snapshot = flipSnapshotRef.current;
    if (snapshot.size === 0) return;
    flipSnapshotRef.current = new Map();

    const animationsToPlay: HTMLDivElement[] = [];

    snapshot.forEach((prevScreenLeft, tabId) => {
      const el = tabNodeRefs.current.get(tabId);
      if (!el) return;

      // Measure natural post-swap layout position
      el.style.transition = "none";
      el.style.transform = "none";
      const newScreenLeft = el.getBoundingClientRect().left;
      const deltaX = prevScreenLeft - newScreenLeft;

      if (Math.abs(deltaX) > 0.5) {
        // Invert: place at previous visual coordinate with subtle depth scale so it glides underneath
        el.style.transform = `translate3d(${deltaX}px, 0, 0) scale(0.97)`;
        animationsToPlay.push(el);
      }
    });

    if (animationsToPlay.length > 0) {
      // Force synchronous layout flush, then glide smoothly to resting slots
      void document.body.offsetWidth;
      requestAnimationFrame(() => {
        animationsToPlay.forEach((el) => {
          el.style.transition = "transform 240ms cubic-bezier(0.22, 1, 0.36, 1)";
          el.style.transform = "translate3d(0, 0, 0) scale(1)";
        });
      });
    }
  }, [tabsList]);

  // ==========================================================================
  // Global Pointer Move & Release Handlers (60/120fps GPU-accelerated)
  // ==========================================================================
  useEffect(() => {
    const stopEdgeAutoScroll = () => {
      if (edgeScrollRafRef.current !== null) {
        cancelAnimationFrame(edgeScrollRafRef.current);
        edgeScrollRafRef.current = null;
      }
    };

    const startOrUpdateEdgeAutoScroll = () => {
      if (edgeScrollRafRef.current !== null) return;
      const tick = () => {
        const session = dragSessionRef.current;
        const container = tabBarRef.current;
        if (!session || !session.started || isDraggingOutRef.current || !container) {
          edgeScrollRafRef.current = null;
          return;
        }
        const rect = container.getBoundingClientRect();
        const edgeZone = 38;
        let speed = 0;
        if (session.lastClientX < rect.left + edgeZone) {
          speed = -Math.ceil(((rect.left + edgeZone - session.lastClientX) / edgeZone) * 8);
        } else if (session.lastClientX > rect.right - edgeZone) {
          speed = Math.ceil(((session.lastClientX - (rect.right - edgeZone)) / edgeZone) * 8);
        }
        if (speed !== 0) {
          const prevScroll = container.scrollLeft;
          container.scrollLeft += speed;
          if (container.scrollLeft !== prevScroll) {
            applyDraggedTabTransform(session);
            evaluateSwapAtPointer(session);
          }
          edgeScrollRafRef.current = requestAnimationFrame(tick);
        } else {
          edgeScrollRafRef.current = null;
        }
      };
      edgeScrollRafRef.current = requestAnimationFrame(tick);
    };

    const handleGlobalMouseMove = (e: MouseEvent) => {
      const session = dragSessionRef.current;
      if (!session) return;

      session.lastClientX = e.clientX;
      session.lastClientY = e.clientY;

      if (!session.started) {
        const dist = Math.hypot(e.clientX - session.startX, e.clientY - session.startY);
        if (dist < 4) return;

        session.started = true;
        suppressNextClickRef.current = true;
        setDraggedTabId(session.tabId);

        // Activate dragged tab so it is always the active foreground file
        if (isSchemaRef.current) {
          setActiveSchemaTab(session.tabId);
        } else {
          setActiveJsonTab(session.tabId);
        }
      }

      if (tabBarRef.current) {
        const rect = tabBarRef.current.getBoundingClientRect();
        const isInsideBar =
          e.clientY >= rect.top - 14 &&
          e.clientY <= rect.bottom + 18 &&
          e.clientX >= rect.left - 16 &&
          e.clientX <= rect.right + 16;

        const nextOut = !isInsideBar;
        if (nextOut !== isDraggingOutRef.current) {
          isDraggingOutRef.current = nextOut;
          setIsDraggingOut(nextOut);
        }
      }

      if (isDraggingOutRef.current) {
        stopEdgeAutoScroll();
        applyDraggedTabTransform(session);
        if (floatingPreviewRef.current) {
          floatingPreviewRef.current.style.transform = `translate3d(${e.clientX + 18}px, ${e.clientY + 18}px, 0)`;
        }
      } else {
        applyDraggedTabTransform(session);
        evaluateSwapAtPointer(session);
        startOrUpdateEdgeAutoScroll();
      }
    };

    const handleGlobalMouseUp = async (e: MouseEvent) => {
      stopEdgeAutoScroll();
      const session = dragSessionRef.current;
      if (!session) return;
      dragSessionRef.current = null;

      if (!session.started) {
        return;
      }

      const dragEl = tabNodeRefs.current.get(session.tabId);
      if (dragEl) {
        // Smoothly settle foreground dragged tab into its final slot
        dragEl.style.transition = "transform 200ms cubic-bezier(0.22, 1, 0.36, 1)";
        dragEl.style.transform = "translate3d(0, 0, 0) scale(1)";
        const cleanupEl = dragEl;
        setTimeout(() => {
          if (dragSessionRef.current?.tabId !== session.tabId) {
            cleanupEl.style.transition = "";
            cleanupEl.style.transform = "";
          }
        }, 210);
      }

      let isOutside = false;
      if (tabBarRef.current) {
        const rect = tabBarRef.current.getBoundingClientRect();
        isOutside =
          e.clientY < rect.top - 14 ||
          e.clientY > rect.bottom + 18 ||
          e.clientX < rect.left - 16 ||
          e.clientX > rect.right + 16 ||
          e.clientY < 0 ||
          e.clientX < 0 ||
          e.clientX > window.innerWidth ||
          e.clientY > window.innerHeight;
      }

      setDraggedTabId(null);
      isDraggingOutRef.current = false;
      setIsDraggingOut(false);

      if (isOutside) {
        const tab = tabsListRef.current.find((t) => t.id === session.tabId);
        if (tab) {
          const myInstanceId = (window as any).__FILEDITOR_INSTANCE_ID__ || "main";
          let targetInstanceId: string | null = null;
          try {
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i);
              if (key && key.startsWith("fileditor_instance_rect_")) {
                const val = localStorage.getItem(key);
                if (val) {
                  const r = JSON.parse(val);
                  if (r.id !== myInstanceId && Date.now() - r.timestamp < 10000) {
                    if (
                      e.screenX >= r.left &&
                      e.screenX <= r.right &&
                      e.screenY >= r.top &&
                      e.screenY <= r.bottom
                    ) {
                      targetInstanceId = r.id;
                      break;
                    }
                  }
                }
              }
            }
          } catch {}

          if (targetInstanceId) {
            localStorage.setItem(
              "fileditor_tab_transfer_incoming",
              JSON.stringify({
                targetInstanceId,
                sourceInstanceId: myInstanceId,
                tab,
                isSchema: isSchemaRef.current,
                timestamp: Date.now()
              })
            );
          } else {
            const tabMode = getTabMode(tab);
            const ext =
              tabMode === "json"
                ? "json"
                : tabMode === "xml"
                ? "xml"
                : tabMode === "todo"
                ? "todo"
                : tabMode === "txt"
                ? "txt"
                : "md";
            const fileName = tab.path
              ? getFileNameFromPath(tab.path)
              : tab.title.includes(".")
              ? tab.title
              : `${tab.title}.${ext}`;
            await invokeTauriSafe("spawn_new_instance", {
              content: tab.content,
              filename: fileName,
              path: tab.path || null,
              x: e.screenX,
              y: e.screenY
            });
          }

          if (isSchemaRef.current) {
            if (tab.pinned) togglePinSchemaTab(tab.id);
            closeSchemaTab(tab.id);
          } else {
            if (tab.pinned) togglePinJsonTab(tab.id);
            closeJsonTab(tab.id);
            checkAndCloseIfSecondaryInstance();
          }
        }
      }
    };

    window.addEventListener("mousemove", handleGlobalMouseMove, { passive: true });
    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => {
      stopEdgeAutoScroll();
      window.removeEventListener("mousemove", handleGlobalMouseMove);
      window.removeEventListener("mouseup", handleGlobalMouseUp);
    };
  }, [
    closeJsonTab,
    closeSchemaTab,
    moveJsonTab,
    moveSchemaTab,
    setActiveJsonTab,
    setActiveSchemaTab,
    togglePinJsonTab,
    togglePinSchemaTab
  ]);

  const handleTabWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.deltaY !== 0) {
      e.currentTarget.scrollLeft += e.deltaY;
    }
  };

  const handleTabCloseClick = (e: React.MouseEvent, tab: Tab) => {
    e.stopPropagation();
    if (!tab.path || tab.content !== tab.lastSavedContent) {
      setCloseConfirmTab({ id: tab.id, title: tab.title, isSchema });
      return;
    }
    if (isSchema) {
      closeSchemaTab(tab.id);
    } else {
      closeJsonTab(tab.id);
    }
  };

  const handleTabContextMenuClick = (key: string, tab: Tab, index: number) => {
    if (key === "close") {
      if (!tab.path || tab.content !== tab.lastSavedContent) {
        setCloseConfirmTab({ id: tab.id, title: tab.title, isSchema });
        return;
      }
      if (isSchema) {
        closeSchemaTab(tab.id);
      } else {
        closeJsonTab(tab.id);
      }
    } else if (key === "pin") {
      if (isSchema) {
        togglePinSchemaTab(tab.id);
      } else {
        togglePinJsonTab(tab.id);
      }
    } else if (key === "close-others") {
      const otherTabs = tabsList.filter((t) => t.id !== tab.id && !t.pinned);
      const dirtyOthers = otherTabs.filter((t) => !t.path || t.content !== t.lastSavedContent);
      if (dirtyOthers.length > 0) {
        setMultiCloseConfirm({ tabIdsToClose: otherTabs.map((t) => t.id), isSchema });
      } else if (isSchema) {
        closeMultipleSchemaTabs(otherTabs.map((t) => t.id));
      } else {
        closeMultipleJsonTabs(otherTabs.map((t) => t.id));
      }
    } else if (key === "close-right") {
      const rightTabs = tabsList.slice(index + 1).filter((t) => !t.pinned);
      const dirtyRight = rightTabs.filter((t) => !t.path || t.content !== t.lastSavedContent);
      if (dirtyRight.length > 0) {
        setMultiCloseConfirm({ tabIdsToClose: rightTabs.map((t) => t.id), isSchema });
      } else if (isSchema) {
        closeMultipleSchemaTabs(rightTabs.map((t) => t.id));
      } else {
        closeMultipleJsonTabs(rightTabs.map((t) => t.id));
      }
    } else if (key === "close-all") {
      const unpinnedTabs = tabsList.filter((t) => !t.pinned);
      const dirtyAll = unpinnedTabs.filter((t) => !t.path || t.content !== t.lastSavedContent);
      if (dirtyAll.length > 0) {
        setMultiCloseConfirm({ tabIdsToClose: unpinnedTabs.map((t) => t.id), isSchema });
      } else if (isSchema) {
        closeMultipleSchemaTabs(unpinnedTabs.map((t) => t.id));
      } else {
        closeMultipleJsonTabs(unpinnedTabs.map((t) => t.id));
      }
    } else if (key === "show-in-explorer" && tab.path) {
      invokeTauriSafe("show_in_explorer", { path: tab.path });
    }
  };

  const executeCloseTabSave = async () => {
    if (!closeConfirmTab) return;
    const { id } = closeConfirmTab;
    let success = false;
    if (isSchema) {
      success = await saveSchemaTab(id);
      if (success) closeSchemaTab(id);
    } else {
      success = await saveJsonTab(id);
      if (success) closeJsonTab(id);
    }
    if (success) setCloseConfirmTab(null);
  };

  const executeCloseTabDiscard = () => {
    if (!closeConfirmTab) return;
    const { id } = closeConfirmTab;
    if (isSchema) {
      closeSchemaTab(id);
    } else {
      closeJsonTab(id);
    }
    setCloseConfirmTab(null);
  };

  const executeMultiCloseSave = async () => {
    if (!multiCloseConfirm) return;
    const { tabIdsToClose } = multiCloseConfirm;

    const targetTabs = tabsList.filter((t) => tabIdsToClose.includes(t.id));
    const dirtyTabs = targetTabs.filter((t) => t.content !== t.lastSavedContent);

    let allSaved = true;
    for (const tabItem of dirtyTabs) {
      const success = isSchema ? await saveSchemaTab(tabItem.id) : await saveJsonTab(tabItem.id);
      if (!success) {
        allSaved = false;
        break;
      }
    }

    if (allSaved) {
      if (isSchema) {
        closeMultipleSchemaTabs(tabIdsToClose);
      } else {
        closeMultipleJsonTabs(tabIdsToClose);
      }
      setMultiCloseConfirm(null);
    }
  };

  const executeMultiCloseDiscard = () => {
    if (!multiCloseConfirm) return;
    const { tabIdsToClose } = multiCloseConfirm;
    if (isSchema) {
      closeMultipleSchemaTabs(tabIdsToClose);
    } else {
      closeMultipleJsonTabs(tabIdsToClose);
    }
    setMultiCloseConfirm(null);
  };

  // Height and Padding adjustments for main vs schema tabs
  const tabHeightClass = isSchema
    ? "h-8 bg-hero-panel/60 border-b border-hero-border shrink-0"
    : "h-9 bg-hero-panel border-b border-hero-border shrink-0";
  const tabsListPaddingClass = isSchema ? "pt-1" : "pt-1.5";
  const tabItemClass = isSchema ? "h-6 text-[10px]" : "h-7 text-[11px]";

  const draggedTabObj = draggedTabId ? tabsList.find((t) => t.id === draggedTabId) : null;

  return (
    <div data-tauri-drag-region className={`flex items-center justify-between select-none px-2 w-full ${tabHeightClass}`}>
      {/* Save Tab confirms */}
      {closeConfirmTab && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#0f172a] border border-slate-800 rounded-xl shadow-2xl p-6 max-w-sm w-full space-y-4 text-left">
            <h3 className="text-sm font-bold text-white">{t("tabs.unsavedChanges")}</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              {t("tabs.confirmCloseDesc", { title: closeConfirmTab.title })}
            </p>
            <div className="flex space-x-2 pt-2">
              <Button type="primary" size="small" onClick={executeCloseTabSave} className="border-none font-semibold text-xs flex-1">
                {t("tabs.save")}
              </Button>
              <Button size="small" danger onClick={executeCloseTabDiscard} className="text-xs flex-1">
                {t("tabs.discard")}
              </Button>
              <Button size="small" onClick={() => setCloseConfirmTab(null)} className="bg-transparent border-slate-800 text-slate-400 hover:text-white text-xs flex-1">
                {t("tabs.cancel")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {multiCloseConfirm && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#0f172a] border border-slate-800 rounded-xl shadow-2xl p-6 max-w-sm w-full space-y-4 text-left">
            <h3 className="text-sm font-bold text-white">{t("tabs.unsavedChanges")}</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              {t("tabs.confirmMultiCloseDesc")}
            </p>
            <div className="flex flex-col space-y-2 pt-2">
              <Button type="primary" size="small" onClick={executeMultiCloseSave} className="border-none font-semibold text-xs py-1.5 h-8">
                {t("tabs.saveAll")}
              </Button>
              <Button size="small" danger onClick={executeMultiCloseDiscard} className="text-xs py-1.5 h-8">
                {t("tabs.discardAll")}
              </Button>
              <Button size="small" onClick={() => setMultiCloseConfirm(null)} className="bg-transparent border-slate-800 text-slate-400 hover:text-white text-xs py-1.5 h-8">
                {t("tabs.cancel")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs List */}
      <div
        ref={tabBarRef}
        onWheel={handleTabWheel}
        onDragOver={(e) => {
          if (
            e.dataTransfer.types.includes("application/fileditor-tab") ||
            e.dataTransfer.types.includes("text/plain") ||
            localStorage.getItem("fileditor_active_drag_tab")
          ) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }
        }}
        onDrop={(e) => {
          let payloadStr = e.dataTransfer.getData("application/fileditor-tab");
          if (!payloadStr) {
            payloadStr = e.dataTransfer.getData("text/plain");
          }
          if (!payloadStr) {
            payloadStr = localStorage.getItem("fileditor_active_drag_tab") || "";
          }

          if (payloadStr) {
            try {
              const parsed = JSON.parse(payloadStr);
              const myInstanceId = (window as any).__FILEDITOR_INSTANCE_ID__ || "main";
              if (parsed && parsed.tab && parsed.sourceInstanceId !== myInstanceId) {
                e.preventDefault();
                e.stopPropagation();
                const droppedTab = parsed.tab;
                const droppedIsSchema = parsed.isSchema;

                const store = useFileStore.getState();
                if (droppedIsSchema) {
                  store.addSchemaTab(droppedTab.path, droppedTab.content);
                } else {
                  store.addJsonTab(droppedTab.path, droppedTab.content, droppedTab.type || getTabMode(droppedTab));
                }

                localStorage.setItem(
                  "fileditor_tab_transfer",
                  JSON.stringify({
                    sourceInstanceId: parsed.sourceInstanceId,
                    tabId: droppedTab.id,
                    timestamp: Date.now()
                  })
                );
                localStorage.removeItem("fileditor_active_drag_tab");
              }
            } catch (err) {
              console.error("Error processing dropped tab:", err);
            }
          }
        }}
        className={`relative flex items-end h-full overflow-x-auto scrollbar-none flex-1 pr-4 space-x-1 ${tabsListPaddingClass}`}
      >
        {tabsList.map((tab, idx) => {
          const isActive = tab.id === activeTabId;
          const isDirty = !tab.path || tab.content !== tab.lastSavedContent;
          const isDragged = tab.id === draggedTabId;
          const tabMode = getTabMode(tab);
          const isTodo = tab.type === "todo" || tabMode === "todo" || tab.id === "todo_plugin_tab";
          const TabIcon = isSchema
            ? mode === "json"
              ? Edit3
              : FileCode
            : isTodo
            ? CheckSquare
            : tabMode === "json"
            ? Braces
            : tabMode === "xml"
            ? Code2
            : FileText;

          const useAccentIcon = isActive && !isTodo && tabMode !== "json" && tabMode !== "xml";
          const iconColorClass = isActive
            ? isTodo
              ? "text-emerald-400"
              : tabMode === "json"
              ? "text-amber-400"
              : tabMode === "xml"
              ? "text-sky-400"
              : ""
            : "text-slate-500";

          return (
            <Dropdown
              key={tab.id}
              menu={{
                items: [
                  { key: "close", label: t("tabs.close") },
                  { key: "pin", label: tab.pinned ? t("tabs.unpin") : t("tabs.pin") },
                  { key: "close-others", label: t("tabs.closeOthers") },
                  { key: "close-right", label: t("tabs.closeRight") },
                  { key: "close-all", label: t("tabs.closeAll") },
                  ...(tab.path ? [{ key: "show-in-explorer", label: t("tabs.showInExplorer") }] : [])
                ],
                onClick: ({ key }) => handleTabContextMenuClick(key, tab, idx)
              }}
              trigger={["contextMenu"]}
            >
              <div
                ref={(node) => {
                  if (node) {
                    tabNodeRefs.current.set(tab.id, node);
                  } else {
                    tabNodeRefs.current.delete(tab.id);
                  }
                }}
                onMouseDown={(e) => {
                  if (e.button !== 0) return;
                  if ((e.target as HTMLElement).closest("button")) return;

                  const container = tabBarRef.current;
                  const el = tabNodeRefs.current.get(tab.id);
                  if (!container || !el) return;

                  const barRect = container.getBoundingClientRect();
                  const grabOffsetInTab = e.clientX - barRect.left + container.scrollLeft - el.offsetLeft;

                  dragSessionRef.current = {
                    tabId: tab.id,
                    currentIndex: idx,
                    startX: e.clientX,
                    startY: e.clientY,
                    lastClientX: e.clientX,
                    lastClientY: e.clientY,
                    grabOffsetInTab,
                    started: false
                  };
                }}
                onClick={() => {
                  if (suppressNextClickRef.current) {
                    suppressNextClickRef.current = false;
                    return;
                  }
                  if (isSchema) {
                    setActiveSchemaTab(tab.id);
                  } else {
                    setActiveJsonTab(tab.id);
                  }
                }}
                style={
                  isActive || isDragged
                    ? {
                        borderTopColor: "var(--color-primary-accent, #a855f7)",
                        boxShadow: isDragged
                          ? "0 8px 20px rgba(var(--color-primary-accent-rgb, 168, 85, 247), 0.28)"
                          : "0 1px 6px rgba(var(--color-primary-accent-rgb, 168, 85, 247), 0.14)",
                        willChange: isDragged ? "transform" : undefined
                      }
                    : undefined
                }
                className={`group relative px-3 flex items-center justify-between space-x-1.5 rounded-t-md cursor-pointer font-semibold transition-colors duration-150 shrink-0 select-none ${tabItemClass} ${
                  isActive
                    ? "bg-[#141d31] border-t-2 border-x border-x-slate-700/80 text-white z-20"
                    : "bg-[#090d15] border-t border-t-transparent border-x border-x-transparent text-slate-400 hover:text-slate-200 hover:bg-[#0c121e] z-10"
                } ${
                  isDragged
                    ? isDraggingOut
                      ? "!z-30 opacity-45"
                      : "!z-30 bg-[#1a2540] text-white ring-1 ring-[rgba(var(--color-primary-accent-rgb,168,85,247),0.45)]"
                    : ""
                }`}
              >
                <div className="flex items-center space-x-1.5 min-w-0">
                  <TabIcon
                    size={isSchema ? 9 : 11}
                    className={iconColorClass}
                    style={useAccentIcon ? { color: "var(--color-primary-accent, #a855f7)" } : undefined}
                  />
                  <Tooltip title={tab.path || `${tab.title}${isDirty ? " *" : ""}`} mouseEnterDelay={0.5}>
                    <div className="flex items-center min-w-0">
                      <span className={`truncate font-mono ${isSchema ? "max-w-[85px]" : "max-w-[110px]"}`}>
                        {tab.title}
                      </span>
                      {isDirty && (
                        <span className="text-amber-400 font-bold font-mono text-xs shrink-0 ml-0.5" title={t("tabs.unsavedChanges")}>
                          *
                        </span>
                      )}
                    </div>
                  </Tooltip>
                </div>

                {/* Pin & Close Action Slot */}
                <div className="flex items-center justify-end space-x-0.5 shrink-0 w-9">
                  {/* Pin Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isSchema) {
                        togglePinSchemaTab(tab.id);
                      } else {
                        togglePinJsonTab(tab.id);
                      }
                    }}
                    style={tab.pinned ? { color: "var(--color-primary-accent, #a855f7)" } : undefined}
                    className={`p-0.5 rounded transition-all hover:bg-slate-800 ${
                      tab.pinned
                        ? "opacity-100"
                        : isActive
                        ? "text-slate-500 hover:text-white opacity-60 hover:opacity-100"
                        : "text-slate-500 opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-white"
                    }`}
                    title={tab.pinned ? t("tabs.unpin") : t("tabs.pin")}
                  >
                    <Pin
                      size={11}
                      style={tab.pinned ? { fill: "var(--color-primary-accent, #a855f7)" } : undefined}
                    />
                  </button>

                  {/* Close Button */}
                  <button
                    type="button"
                    onClick={(e) => handleTabCloseClick(e, tab)}
                    className={`p-0.5 rounded-full hover:bg-slate-800 text-slate-500 hover:text-rose-400 transition-all ${
                      isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    }`}
                    title={t("tabs.close")}
                  >
                    <X size={isSchema ? 9 : 10} />
                  </button>
                </div>
              </div>
            </Dropdown>
          );
        })}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center space-x-1 shrink-0 pb-1">
        {!isSchema && graphEnabled && (
          <Tooltip title={t("tabs.graphViewTooltip")}>
            <Button
              type="text"
              size="small"
              icon={<Network size={14} style={{ color: "var(--color-primary-accent, #a855f7)" }} />}
              onClick={() => setGraphViewOpen(true)}
              className="hover:bg-slate-800 h-7 w-7 p-0 flex items-center justify-center"
            />
          </Tooltip>
        )}
        {(mode === "json" || mode === "xml") && !isSchema && (
          <>
            <div className="h-4 w-[1px] bg-slate-800 mx-1"></div>
            <Button
              type="text"
              size="small"
              icon={<AlignLeft size={13} />}
              disabled={!activeJsonTabId || !jsonString.trim() || hasSyntaxError}
              onClick={() => window.dispatchEvent(new CustomEvent("custom-format-active-tab"))}
              className="text-[10px] h-6 px-2 flex items-center space-x-1 text-slate-400 hover:!text-[var(--color-primary-accent)] disabled:text-slate-600 disabled:hover:text-slate-600 font-semibold"
            >
              {t("editor.format")}
            </Button>
          </>
        )}
      </div>

      {/* Floating Document Drag Preview when dragged outside tab bar */}
      {isDraggingOut && draggedTabObj && (
        <div
          ref={floatingPreviewRef}
          className="fixed left-0 top-0 pointer-events-none z-[99999] flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#0f172a]/95 border backdrop-blur select-none will-change-transform"
          style={{
            borderColor: "rgba(var(--color-primary-accent-rgb, 168, 85, 247), 0.7)",
            boxShadow: "0 12px 30px rgba(var(--color-primary-accent-rgb, 168, 85, 247), 0.35)",
            transform: `translate3d(${(dragSessionRef.current?.lastClientX ?? 0) + 18}px, ${(dragSessionRef.current?.lastClientY ?? 0) + 18}px, 0)`
          }}
        >
          <svg width="18" height="22" viewBox="0 0 18 22" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0 drop-shadow">
            <path d="M1 2.5C1 1.67157 1.67157 1 2.5 1H11.5L17 6.5V19.5C17 20.3284 16.3284 21 15.5 21H2.5C1.67157 21 1 20.3284 1 19.5V2.5Z" fill="#FFFFFF" stroke="#334155" strokeWidth="1.5" />
            <path d="M11 1V7H17" fill="#CBD5E1" />
            <line x1="4" y1="10" x2="14" y2="10" stroke="#64748B" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="4" y1="13.5" x2="14" y2="13.5" stroke="#64748B" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="4" y1="17" x2="10" y2="17" stroke="#64748B" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="text-xs font-mono font-bold text-white max-w-[140px] truncate">
            {draggedTabObj.title}
          </span>
        </div>
      )}
    </div>
  );
};
