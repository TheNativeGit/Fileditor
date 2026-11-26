import React, { useEffect, useRef, useState, useMemo } from "react";
import { useFileStore } from "../../store/useFileStore";
import { renderMarkdownToHtml, getMarkdownBodyStartLine } from "../../utils/markdownParser";
import { FileText, Maximize2, Minimize2, Layout, ChevronUp, ListTree } from "lucide-react";
import { Dropdown, message } from "antd";
import { resolveLinkToTabOrPath } from "../../utils/todoLinkParser";
import { openArbitraryFile } from "../../utils/fileLinkOpener";
import { logger } from "../../utils/logger";
import { useTranslation } from "../../i18n";
import { invokeTauriSafe, isTauriEnv } from "../../utils/tauriBridge";

export const MarkdownView: React.FC = () => {
  const { t } = useTranslation();
  const { 
    jsonString, 
    isRightPaneFullscreen, 
    setRightPaneFullscreen,
    fullscreenMarkdownWidth,
    fullscreenMarkdownZoom,
    activeJsonTabId,
    jsonTabs,
    tabViewStates,
    setTabViewStates,
    markdownRememberViewState
  } = useFileStore();
  const htmlContent = renderMarkdownToHtml(jsonString);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoomPercent, setZoomPercent] = useState<number>(100);
  const [hoveredUrl, setHoveredUrl] = useState<string | null>(null);
  const [showJumpUp, setShowJumpUp] = useState<boolean>(false);
  
  // Custom width control state
  const [previewWidth, setPreviewWidth] = useState<string>("850px");

  // Floating controls visibility and scroll tracking state
  const [showControls, setShowControls] = useState<boolean>(true);
  const [isHoveringControlsTrigger, setIsHoveringControlsTrigger] = useState(false);
  const lastScrollTop = useRef<number>(0);

  // Table of Contents (TOC) state
  const [isTocOpen, setIsTocOpen] = useState<boolean>(false);
  const tocRef = useRef<HTMLDivElement>(null);
  const tocBtnRef = useRef<HTMLButtonElement>(null);

  const preFullscreenWidthRef = useRef<string>("850px");
  const preFullscreenZoomRef = useRef<number>(100);
  const wasFullscreenRef = useRef<boolean>(false);

  const activeTab = jsonTabs.find(t => t.id === activeJsonTabId);
  const tabKey = activeTab?.path || activeTab?.id || "";

  // Reset floating controls visibility when switching tabs
  useEffect(() => {
    setShowControls(true);
    lastScrollTop.current = 0;
  }, [tabKey]);

  // Parse headings for Table of Contents live from current markdown
  const headings = useMemo(() => {
    const lines = jsonString.split(/\r?\n/);
    const startLine = getMarkdownBodyStartLine(lines);
    const items: { line: number; text: string; level: number }[] = [];
    let inCode = false;
    for (let i = startLine; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith("```")) {
        inCode = !inCode;
        continue;
      }
      if (inCode) continue;
      const match = trimmed.match(/^(#{1,4})\s+(.*)$/);
      if (match) {
        const level = match[1].length;
        const cleanText = match[2]
          .replace(/[*_~`]/g, "")
          .replace(/\[(.*?)\]\(.*?\)/g, "$1")
          .trim();
        if (cleanText) {
          items.push({ line: i, text: cleanText, level });
        }
      }
    }
    return items;
  }, [jsonString]);

  // Close TOC when clicking outside, but remain open if clicking inside TOC
  useEffect(() => {
    if (!isTocOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        tocRef.current && !tocRef.current.contains(target) &&
        tocBtnRef.current && !tocBtnRef.current.contains(target)
      ) {
        setIsTocOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isTocOpen]);

  // Restore scroll position, zoom, and width when tabKey changes
  useEffect(() => {
    if (!markdownRememberViewState || !tabKey) return;
    const saved = tabViewStates[tabKey];
    if (saved) {
      if (typeof saved.scrollTop === "number" && containerRef.current) {
        containerRef.current.scrollTop = saved.scrollTop;
      }
      if (typeof saved.fullscreenZoom === "number") {
        setZoomPercent(saved.fullscreenZoom);
      }
      if (saved.fullscreenWidth) {
        setPreviewWidth(saved.fullscreenWidth);
      }
    }
  }, [tabKey, markdownRememberViewState]);

  // Save width & zoom per tab
  useEffect(() => {
    if (markdownRememberViewState && tabKey) {
      setTabViewStates(tabKey, { fullscreenWidth: previewWidth, fullscreenZoom: zoomPercent });
    }
  }, [previewWidth, zoomPercent, tabKey, markdownRememberViewState]);

  useEffect(() => {
    if (isRightPaneFullscreen && !wasFullscreenRef.current) {
      preFullscreenWidthRef.current = previewWidth;
      preFullscreenZoomRef.current = zoomPercent;
      setPreviewWidth(fullscreenMarkdownWidth);
      setZoomPercent(fullscreenMarkdownZoom);
      wasFullscreenRef.current = true;
    } else if (!isRightPaneFullscreen && wasFullscreenRef.current) {
      setPreviewWidth(preFullscreenWidthRef.current);
      setZoomPercent(preFullscreenZoomRef.current);
      wasFullscreenRef.current = false;
      setIsTocOpen(false);
    }
  }, [isRightPaneFullscreen, fullscreenMarkdownWidth, fullscreenMarkdownZoom]);

  const scrollToHeading = (line: number) => {
    if (!containerRef.current) return;
    const targetEl = containerRef.current.querySelector(`[data-line="${line}"]`) as HTMLElement | null;
    if (targetEl) {
      const containerTop = containerRef.current.getBoundingClientRect().top;
      const elTop = targetEl.getBoundingClientRect().top;
      const currentScroll = containerRef.current.scrollTop;
      const targetScroll = currentScroll + (elTop - containerTop) - 8;
      containerRef.current.scrollTo({
        top: Math.max(0, targetScroll),
        behavior: "smooth"
      });
    }
  };

  const widthItems = [
    { key: "650px", label: t("markdown.narrow") },
    { key: "850px", label: t("markdown.standard") },
    { key: "1200px", label: t("markdown.wide") },
    { key: "100%", label: t("markdown.max") }
  ];

  useEffect(() => {
    const handleEditorSelect = (e: Event) => {
      const { markdownSyncPreviewFromEditor } = useFileStore.getState();
      if (!markdownSyncPreviewFromEditor) return;

      const customEvent = e as CustomEvent<{ line: number; endLine?: number; selectedText?: string; colIndex?: number }>;
      const startLine = customEvent.detail.line;
      const endLine = typeof customEvent.detail.endLine === "number" ? customEvent.detail.endLine : startLine;
      const selectedText = customEvent.detail.selectedText?.trim();
      const colIndex = customEvent.detail.colIndex;
      if (!containerRef.current) return;

      // Remove active class from all elements
      const activeElements = containerRef.current.querySelectorAll(".markdown-line-active, .markdown-cell-active");
      activeElements.forEach(el => el.classList.remove("markdown-line-active", "markdown-cell-active"));

      const allLineEls = Array.from(containerRef.current.querySelectorAll("[data-line]")) as HTMLElement[];

      // Highlight all elements in range [startLine, endLine]
      const minLine = Math.min(startLine, endLine);
      const maxLine = Math.max(startLine, endLine);
      const matchingEls = allLineEls.filter(el => {
        const elLine = parseInt(el.getAttribute("data-line") || "-1", 10);
        return elLine >= minLine && elLine <= maxLine;
      });

      let targetEl: HTMLElement | null = matchingEls.length > 0 ? matchingEls[0] : null;

      if (!targetEl) {
        // Find closest preceding element with data-line attribute
        let closest: HTMLElement | null = null;
        let closestLine = -1;
        for (const el of allLineEls) {
          const elLine = parseInt(el.getAttribute("data-line") || "0", 10);
          if (elLine <= startLine && elLine > closestLine) {
            closest = el;
            closestLine = elLine;
          }
        }
        targetEl = closest;
        if (targetEl) {
          targetEl.classList.add("markdown-line-active");
        }
      } else {
        matchingEls.forEach(el => el.classList.add("markdown-line-active"));
      }

      // If targetEl is a table row (TR), highlight specific cell
      if (targetEl && targetEl.tagName === "TR") {
        let cellTarget: HTMLElement | null = null;
        if (colIndex !== undefined) {
          cellTarget = targetEl.querySelector(`td[data-col="${colIndex}"], th[data-col="${colIndex}"]`);
        }
        if (!cellTarget && selectedText) {
          const cells = Array.from(targetEl.querySelectorAll("td, th")) as HTMLElement[];
          cellTarget = cells.find(c => (c.textContent || "").includes(selectedText)) || null;
        }
        if (cellTarget) {
          cellTarget.classList.add("markdown-cell-active");
        }
      }

      if (targetEl && containerRef.current) {
        targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    };

    window.addEventListener("custom-editor-select", handleEditorSelect);
    return () => {
      window.removeEventListener("custom-editor-select", handleEditorSelect);
    };
  }, []);

  // Listen to wheel events with passive: false to allow preventDefault for Zoom control
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleNativeWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        setZoomPercent((prev) => {
          const delta = e.deltaY < 0 ? 10 : -10;
          const next = prev + delta;
          return Math.max(50, Math.min(300, next));
        });
      }
    };

    container.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleNativeWheel);
    };
  }, []);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = e.currentTarget.scrollTop;
    setShowJumpUp(scrollTop > 80);

    // Hide controls when scrolling down, restore when scrolling up, near top, or when document is not scrollable
    const maxScroll = e.currentTarget.scrollHeight - e.currentTarget.clientHeight;
    if (scrollTop <= 20 || maxScroll <= 10) {
      setShowControls(true);
    } else if (scrollTop > lastScrollTop.current + 5) {
      setShowControls(false);
      setIsTocOpen(false);
    } else if (scrollTop < lastScrollTop.current - 5) {
      setShowControls(true);
    }
    lastScrollTop.current = scrollTop;

    if (markdownRememberViewState && tabKey) {
      setTabViewStates(tabKey, { scrollTop });
    }
  };

  const handlePreviewClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;

    // Handle interactive checkbox clicking in preview
    if (target.tagName === "INPUT" && target.getAttribute("type") === "checkbox") {
      const lineEl = target.closest("[data-line]") as HTMLElement | null;
      if (lineEl) {
        const lineStr = lineEl.getAttribute("data-line");
        if (lineStr !== null) {
          const lineIdx = parseInt(lineStr, 10);
          if (!isNaN(lineIdx)) {
            const { jsonString, setJsonString } = useFileStore.getState();
            const lines = jsonString.split(/\r?\n/);
            if (lines[lineIdx]) {
              let lineText = lines[lineIdx];
              if (lineText.includes("[ ]")) {
                lineText = lineText.replace("[ ]", "[x]");
              } else if (lineText.includes("[x]")) {
                lineText = lineText.replace("[x]", "[ ]");
              } else if (lineText.includes("[X]")) {
                lineText = lineText.replace("[X]", "[ ]");
              }
              lines[lineIdx] = lineText;
              setJsonString(lines.join("\n"), false);
            }
          }
        }
      }
      return;
    }

    // Handle link clicking in Markdown preview (both Ctrl+Click and normal click!)
    const anchor = target.closest("a");
    if (anchor) {
      const href = anchor.getAttribute("href");
      if (href) {
        event.preventDefault();
        event.stopPropagation();
        const { jsonTabs, activeJsonTabId, setActiveJsonTab, openJsonFile } = useFileStore.getState();
        const activeTab = jsonTabs.find(t => t.id === activeJsonTabId);
        const { tabId, cleanPath, isWebUrl } = resolveLinkToTabOrPath(href, jsonTabs, activeTab?.path);

        logger.info("MarkdownView", `Link clicked in preview: href="${href}", cleanPath="${cleanPath}", tabId="${tabId}", isWebUrl=${isWebUrl}`);

        if (isWebUrl) {
          let finalUrl = cleanPath;
          if (!/^https?:\/\//i.test(finalUrl)) {
            finalUrl = `https://${finalUrl}`;
          }
          if (isTauriEnv()) {
            invokeTauriSafe("open_external_url", { url: finalUrl });
          } else {
            window.open(finalUrl, "_blank", "noopener,noreferrer");
          }
          message.success(t("markdown.linkOpened", { url: finalUrl }));
        } else if (tabId) {
          setActiveJsonTab(tabId);
        } else if (cleanPath) {
          openArbitraryFile(cleanPath, openJsonFile, { revealInExplorer: event.altKey });
        }
      }
      return;
    }

    syncPreviewLineToEditor(target);
  };

  const syncPreviewLineToEditor = (target: HTMLElement) => {
    // Ignore interactive element clicks (like inputs or buttons)
    if (target.tagName === "INPUT" || target.closest("button") || target.closest("a")) {
      return;
    }

    const sel = window.getSelection();
    const selText = sel ? sel.toString().trim() : "";

    let lineEl = target.closest("[data-line]") as HTMLElement | null;
    if (!lineEl && sel && sel.anchorNode) {
      const anchorEl = sel.anchorNode instanceof HTMLElement ? sel.anchorNode : sel.anchorNode.parentElement;
      lineEl = anchorEl?.closest("[data-line]") as HTMLElement | null;
    }

    if (lineEl) {
      const lineStr = lineEl.getAttribute("data-line");
      if (lineStr !== null) {
        const line = parseInt(lineStr, 10);

        // Highlight line in preview immediately
        const activeElements = containerRef.current?.querySelectorAll(".markdown-line-active, .markdown-cell-active");
        activeElements?.forEach(el => el.classList.remove("markdown-line-active", "markdown-cell-active"));
        lineEl.classList.add("markdown-line-active");

        const cellEl = target.closest("td, th") as HTMLElement | null;
        let colIndex: number | undefined = undefined;
        let selectedText = selText;

        if (cellEl) {
          cellEl.classList.add("markdown-cell-active");
          const colAttr = cellEl.getAttribute("data-col");
          if (colAttr !== null) {
            colIndex = parseInt(colAttr, 10);
          }
          if (!selectedText) {
            selectedText = (cellEl.textContent || "").trim();
          }
        }

        const { markdownSyncEditorFromPreview } = useFileStore.getState();
        if (markdownSyncEditorFromPreview) {
          window.dispatchEvent(new CustomEvent("custom-preview-click", {
            detail: { line, colIndex, selectedText }
          }));
        }
      }
    }
  };

  const handlePreviewMouseUp = (event: React.MouseEvent<HTMLDivElement>) => {
    const sel = window.getSelection();
    if (sel && sel.toString().trim().length > 0) {
      syncPreviewLineToEditor(event.target as HTMLElement);
    }
  };

  const handlePreviewKeyDown = async (e: React.KeyboardEvent<HTMLDivElement>) => {
    const isCtrl = e.ctrlKey || e.metaKey;
    if (isCtrl && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "c") {
      const sel = window.getSelection();
      if (sel && sel.toString().length > 0) {
        // Manual text selection exists — let native copy handle it
        return;
      }

      const activeCell = containerRef.current?.querySelector(".markdown-cell-active") as HTMLElement | null;
      if (activeCell) {
        const text = (activeCell.innerText ?? activeCell.textContent ?? "").trim();
        if (text.length > 0) {
          e.preventDefault();
          try {
            await navigator.clipboard.writeText(text);
            invokeTauriSafe("native_write_clipboard", { text });
          } catch (err) {
            logger.error("MarkdownView", `Failed to copy cell content: ${err}`);
          }
        }
      }
    }
  };

  const handleMouseOver = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const anchor = target.closest("a");
    if (anchor) {
      setHoveredUrl(anchor.getAttribute("href") || "");
    } else {
      setHoveredUrl(null);
    }
  };

  const handleMouseOut = () => {
    setHoveredUrl(null);
  };

  if (!jsonString.trim()) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 bg-[#090d16]/30 select-none">
        <FileText size={40} className="mb-2 text-slate-600 opacity-45 animate-pulse" />
        <span className="text-xs italic font-mono">{t("markdown.empty")}</span>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      tabIndex={-1}
      onKeyDown={handlePreviewKeyDown}
      onClick={handlePreviewClick}
      onMouseUp={handlePreviewMouseUp}
      onScroll={handleScroll}
      onMouseOver={handleMouseOver}
      onMouseOut={handleMouseOut}
      className="w-full h-full bg-[#090d16] overflow-y-auto px-8 py-8 select-text selection:bg-purple-900/50 scrollbar-thin relative markdown-zoom-container outline-none"
      style={{ fontSize: `${15 * (zoomPercent / 100)}px` }}
    >
      {/* Invisible Hover Zone at top-right to guarantee controls can always be revealed in Fullscreen */}
      <div 
        onMouseEnter={() => setIsHoveringControlsTrigger(true)}
        onMouseLeave={() => setIsHoveringControlsTrigger(false)}
        className="fixed top-0 right-0 h-10 w-64 z-[49] pointer-events-auto"
      />

      {/* Floating Fullscreen, Width and Zoom Controls (Persistent translucent glass styling with scroll-down hide) */}
      <div 
        onMouseEnter={() => setIsHoveringControlsTrigger(true)}
        onMouseLeave={() => setIsHoveringControlsTrigger(false)}
        className={`sticky top-0 h-0 w-full flex justify-end -mr-5 pr-1 z-50 select-none transition-all duration-300 ease-out ${
          showControls || isHoveringControlsTrigger ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 -translate-y-4 pointer-events-none"
        }`}
      >
        <div className="flex items-center space-x-2.5 bg-slate-900/35 hover:bg-slate-900/85 backdrop-blur-[3px] hover:backdrop-blur-md border border-slate-700/40 hover:border-slate-600/80 px-3 py-1.5 rounded-xl shadow-lg -mt-5 h-9 transition-all duration-200">
          {/* TOC-Button (exclusively in fullscreen) */}
          {isRightPaneFullscreen && (
            <>
              <button
                ref={tocBtnRef}
                onClick={() => setIsTocOpen(!isTocOpen)}
                className={`p-1.5 rounded-lg hover:bg-slate-800/80 text-slate-300 hover:text-white cursor-pointer transition-all flex items-center justify-center ${
                  isTocOpen ? "border" : ""
                }`}
                style={
                  isTocOpen
                    ? {
                        backgroundColor: "rgba(var(--color-primary-accent-rgb), 0.16)",
                        color: "var(--color-primary-accent)",
                        borderColor: "rgba(var(--color-primary-accent-rgb), 0.45)"
                      }
                    : undefined
                }
                title={t("markdown.tableOfContents") || "Inhaltsverzeichnis"}
              >
                <ListTree size={15} style={isTocOpen ? { color: "var(--color-primary-accent)" } : undefined} className={isTocOpen ? "" : "text-slate-300 hover:text-white"} />
              </button>
              <div className="h-5 w-[1px] bg-slate-700/60"></div>
            </>
          )}

          {/* Width Selector (Icon only, no text) */}
          <Dropdown
            menu={{
              items: widthItems,
              onClick: ({ key }) => setPreviewWidth(key)
            }}
            trigger={["click"]}
          >
            <button 
              className="p-1.5 rounded-lg hover:bg-slate-800/80 text-slate-300 hover:text-white cursor-pointer transition-all flex items-center justify-center border border-transparent hover:border-slate-600/60"
              title={t("markdown.previewWidth")}
            >
              <Layout size={15} style={{ color: "var(--color-primary-accent)" }} />
            </button>
          </Dropdown>

          {/* Zoom Level Indicator */}
          <span className="text-xs text-slate-300 px-1 font-mono select-none font-medium">
            {t("markdown.zoom")}: {zoomPercent}%
          </span>

          <div className="h-5 w-[1px] bg-slate-700/60"></div>

          {/* Fullscreen Toggle */}
          <button
            onClick={() => setRightPaneFullscreen(!isRightPaneFullscreen)}
            className="p-1.5 rounded-lg hover:bg-slate-800/80 text-slate-300 hover:text-white cursor-pointer transition-all flex items-center justify-center"
            title={isRightPaneFullscreen ? `${t("markdown.exitFullscreen")} (F11 / Esc)` : `${t("markdown.fullscreen")} (F11)`}
          >
            {isRightPaneFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        </div>
      </div>

      {/* Table of Contents Popover (Displayed under the floating bar in Fullscreen) */}
      {isRightPaneFullscreen && isTocOpen && (
        <div 
          ref={tocRef}
          className="fixed top-11 right-5 z-[100] w-80 max-h-[70vh] flex flex-col bg-[#0f172a]/95 backdrop-blur-md border border-slate-700/80 rounded-xl shadow-2xl overflow-hidden select-none animate-in fade-in zoom-in-95 duration-150"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-800 bg-slate-900/80">
            <span className="text-xs font-semibold text-white flex items-center gap-1.5">
              <ListTree size={14} style={{ color: "var(--color-primary-accent)" }} />
              {t("markdown.tableOfContents") || "Inhaltsverzeichnis"}
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              {headings.length} {headings.length === 1 ? t("markdown.sectionSingular") : t("markdown.sectionPlural")}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5 scrollbar-thin text-xs">
            {headings.length === 0 ? (
              <div className="py-6 text-center text-slate-500 italic text-xs">
                {t("markdown.noHeadings") || "Keine Überschriften vorhanden"}
              </div>
            ) : (
              headings.map((item, idx) => {
                const indentPx = (item.level - 1) * 12;
                return (
                  <button
                    key={`${item.line}-${idx}`}
                    onClick={() => scrollToHeading(item.line)}
                    className={`w-full text-left py-1.5 px-2 rounded hover:bg-slate-800/80 hover:text-white transition-colors flex items-center gap-2 truncate cursor-pointer ${
                      item.level === 1 ? "font-bold text-white text-xs" :
                      item.level === 2 ? "font-semibold text-slate-200 text-xs" :
                      item.level === 3 ? "text-slate-350 text-[11px]" :
                      "text-slate-400 text-[11px]"
                    }`}
                    style={{ paddingLeft: `${indentPx + 8}px` }}
                    title={item.text}
                  >
                    <span className="text-[9px] font-mono shrink-0 select-none" style={{ color: "var(--color-primary-accent)" }}>
                      {"#".repeat(item.level)}
                    </span>
                    <span className="truncate">{item.text}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      <div 
        className="mx-auto text-slate-300 space-y-4 pb-24 transition-all duration-100 select-text"
        style={{ maxWidth: previewWidth }}
        dangerouslySetInnerHTML={{ __html: htmlContent }}
      />

      {hoveredUrl && (
        <div className="absolute bottom-2 left-2 px-2.5 py-1 rounded bg-[#090d16]/95 border border-slate-800 text-[10px] font-mono text-slate-400 z-50 shadow-md max-w-sm truncate pointer-events-none select-none transition-all duration-150">
          {hoveredUrl}
        </div>
      )}

      {/* JumpUp Button */}
      {showJumpUp && (
        <button
          onClick={() => {
            if (containerRef.current) {
              containerRef.current.scrollTo({ top: 0, behavior: "smooth" });
            }
          }}
          className="fixed bottom-6 right-6 z-30 w-8 h-8 rounded-full text-white shadow-lg backdrop-blur flex items-center justify-center transition-all cursor-pointer border hover:scale-110 active:scale-95"
          style={{
            backgroundColor: "rgba(var(--color-primary-accent-rgb), 0.85)",
            borderColor: "rgba(var(--color-primary-accent-rgb), 0.45)"
          }}
          title={t("markdown.jumpUp")}
        >
          <ChevronUp size={16} />
        </button>
      )}
    </div>
  );
};
