import React, { useState, useEffect, useRef } from "react";
import Editor from "@monaco-editor/react";
import { Switch, Button, Modal, Dropdown, Tooltip, Select, message } from "antd";
import { useFileStore, useFileStore as useJSONStore, Tab } from "../store/useFileStore";
import { GlobalTabBar } from "./GlobalTabBar";
import { 
  AlertTriangle, 
  CheckCircle, 
  ChevronDown, 
  ChevronUp, 
  FolderOpen, 
  Plus, 
  X, 
  FileJson,
  FileCode,
  FileText,
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  Link2,
  Image,
  Code2,
  Quote,
  List,
  ListOrdered,
  CheckSquare,
  Table,
  Underline,
  WrapText,
  Pilcrow,
  Hash,
  Map,
  SortAsc,
  SortDesc,
  Scissors,
  Layers,
  Search,
  Upload
} from "lucide-react";
import { formatXmlString, xmlStringToJsObject } from "../utils/xmlConverter";
import { LinkInsertPopover } from "./LinkInsertPopover";
import { configureMonacoMarkdown, updateMonacoAccentTheme } from "../utils/monacoMarkdownConfig";
import { openArbitraryFile } from "../utils/fileLinkOpener";
import { ClickableTooltip } from "./ClickableTooltip";
import { useTranslation, useI18nStore } from "../i18n";
import { invokeTauriSafe, listenNativeFileDrop } from "../utils/tauriBridge";
import {
  detectJsonSchemaDialect,
  detectXmlSchemaDialect,
  getJsonSchemaDialectLabel,
  getXmlSchemaDialectLabel,
  normalizeDraft04Schema,
  JsonSchemaDialect,
  XmlSchemaDialect
} from "../utils/schemaValidator";

export const LeftPane: React.FC = () => {
  const {
    mode,
    jsonString,
    setJsonString,
    schemaString,
    setSchemaString,
    schemaValue,
    validationErrors,
    isValid,
    isSchemaEnabled,
    setSchemaEnabled,

    // Tabs
    jsonTabs,
    activeJsonTabId,
    schemaTabs,
    activeSchemaTabId,
    recentJsonFiles,
    addJsonTab,
    addSchemaTab,
    closeJsonTab,
    closeSchemaTab,
    saveJsonTab,
    saveSchemaTab,
    openJsonFile,
    openSchemaFile,
    jsonSchemaDialect,
    xmlSchemaDialect,
    setSchemaDialect,

    txtWordWrap,
    txtLineNumbers,
    txtShowWhitespace,
    txtMinimap,
    txtLineEndings,
    txtEncoding,
    setTxtWordWrap,
    setTxtLineNumbers,
    setTxtShowWhitespace,
    setTxtMinimap,
    saveAll,
    setCursorPos
  } = useJSONStore();

  const [showSchema, setShowSchema] = useState(false);
  const [schemaHeight, setSchemaHeight] = useState<number>(() => {
    const saved = parseInt(localStorage.getItem("fileditor_schema_panel_height") || "280", 10);
    if (!Number.isFinite(saved)) return 280;
    return Math.max(150, Math.min(560, saved));
  });
  const [isResizingSchema, setIsResizingSchema] = useState(false);
  const [isDraggingSchemaOver, setIsDraggingSchemaOver] = useState(false);
  const { t, currentLanguage } = useTranslation();
  const [showJumpUp, setShowJumpUp] = useState(false);
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);
  const [selectedEditorText, setSelectedEditorText] = useState("");
  const leftPaneRef = useRef<HTMLDivElement>(null);
  const schemaPanelRef = useRef<HTMLDivElement>(null);
  const showSchemaRef = useRef(showSchema);
  const modeRef = useRef(mode);

  useEffect(() => {
    showSchemaRef.current = showSchema;
    if (!showSchema) setIsDraggingSchemaOver(false);
  }, [showSchema]);

  useEffect(() => {
    modeRef.current = mode;
    if (mode !== "json" && mode !== "xml") setIsDraggingSchemaOver(false);
  }, [mode]);

  // Native Tauri OS Drag & Drop listener targeting the open bottom-left Schema panel
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    const isInsideSchemaPanel = (pos?: { x: number; y: number }): boolean => {
      if (!pos || !schemaPanelRef.current) return false;
      const rect = schemaPanelRef.current.getBoundingClientRect();
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
        if (!showSchemaRef.current || (modeRef.current !== "json" && modeRef.current !== "xml")) {
          setIsDraggingSchemaOver(false);
          return;
        }

        if (payload.type === "enter" || payload.type === "over") {
          setIsDraggingSchemaOver(isInsideSchemaPanel(payload.position));
        } else if (payload.type === "leave") {
          setIsDraggingSchemaOver(false);
        } else if (payload.type === "drop") {
          const hit = isInsideSchemaPanel(payload.position);
          setIsDraggingSchemaOver(false);
          if (hit && payload.paths && payload.paths.length > 0) {
            const droppedPath = payload.paths[0];
            await useFileStore.getState().openSchemaFile(droppedPath);
            useFileStore.getState().setSchemaEnabled(true);
            const baseName = droppedPath.split(/[/\\]/).pop() || droppedPath;
            message.success(useI18nStore.getState().t("leftPane.schemaLoadedSuccess", { name: baseName }));
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

  const handleOpenLinkPopover = (open: boolean) => {
    if (open && editorRef.current) {
      const editor = editorRef.current;
      const model = editor.getModel();
      const selection = editor.getSelection();
      if (model && selection && !selection.isEmpty()) {
        setSelectedEditorText(model.getValueInRange(selection));
      } else {
        setSelectedEditorText("");
      }
    }
    setLinkPopoverOpen(open);
  };
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const autoNumberRef = useRef<{ lineNumber: number; prefix: string } | null>(null);
  const isSyncingFromPreview = useRef(false);
  const selectionDebounceRef = useRef<any>(null);

  const handleLineOperation = (key: string) => {
    const lines = jsonString.split(/\r?\n/);
    if (key === "sort-asc") {
      lines.sort((a, b) => a.localeCompare(b));
      setJsonString(lines.join("\n"));
    } else if (key === "sort-desc") {
      lines.sort((a, b) => b.localeCompare(a));
      setJsonString(lines.join("\n"));
    } else if (key === "sort-num") {
      lines.sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0));
      setJsonString(lines.join("\n"));
    } else if (key === "unique") {
      const unique = Array.from(new Set(lines));
      setJsonString(unique.join("\n"));
    } else if (key === "trim-empty") {
      const nonEmpty = lines.filter(l => l.trim().length > 0);
      setJsonString(nonEmpty.join("\n"));
    }
  };

  // Ref tracking initial and modified lines for Monaco change decorations (Notepad++ style)
  const tabLineTrackerRef = useRef<{
    [tabId: string]: {
      sessionOriginalContent: string;
    }
  }>({});

  // Computes changed line indices using Longest Common Subsequence (LCS)
function computeChangedLineIndices(referenceLines: string[], currentLines: string[]): Set<number> {
  const m = referenceLines.length;
  const n = currentLines.length;

  if (m === 0) {
    const changed = new Set<number>();
    for (let j = 0; j < n; j++) changed.add(j);
    return changed;
  }
  if (n === 0) {
    return new Set<number>();
  }

  let prefix = 0;
  while (prefix < m && prefix < n && referenceLines[prefix] === currentLines[prefix]) {
    prefix++;
  }

  let suffix = 0;
  while (
    suffix < m - prefix &&
    suffix < n - prefix &&
    referenceLines[m - 1 - suffix] === currentLines[n - 1 - suffix]
  ) {
    suffix++;
  }

  const refMid = referenceLines.slice(prefix, m - suffix);
  const curMid = currentLines.slice(prefix, n - suffix);
  const changed = new Set<number>();

  if (refMid.length === 0) {
    for (let k = 0; k < curMid.length; k++) {
      changed.add(prefix + k);
    }
    return changed;
  }

  if (curMid.length === 0) {
    return changed;
  }

  const idMap: Record<string, number> = {};
  let nextId = 1;
  const getId = (str: string) => {
    let id = idMap[str];
    if (!id) {
      id = nextId++;
      idMap[str] = id;
    }
    return id;
  };

  const a = refMid.map(getId);
  const b = curMid.map(getId);
  const lenA = a.length;
  const lenB = b.length;

  const dp: number[][] = Array.from({ length: lenA + 1 }, () => new Uint16Array(lenB + 1) as any);

  for (let i = 1; i <= lenA; i++) {
    for (let j = 1; j <= lenB; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const matchedCurIndices = new Set<number>();
  let currA = lenA;
  let currB = lenB;
  while (currA > 0 && currB > 0) {
    if (a[currA - 1] === b[currB - 1]) {
      matchedCurIndices.add(currB - 1);
      currA--;
      currB--;
    } else if (dp[currA - 1][currB] >= dp[currA][currB - 1]) {
      currA--;
    } else {
      currB--;
    }
  }

  for (let k = 0; k < curMid.length; k++) {
    if (!matchedCurIndices.has(k)) {
      changed.add(prefix + k);
    }
  }

  return changed;
}

  const updateEditorDecorations = (editor: any, monaco: any, tab: Tab) => {
    if (!tab) return;

    let tracker = tabLineTrackerRef.current[tab.id];
    if (!tracker) {
      tracker = {
        sessionOriginalContent: tab.lastSavedContent || tab.content
      };
      tabLineTrackerRef.current[tab.id] = tracker;
    }

    const currentLines = tab.content.split(/\r?\n/);
    const savedLines = (tab.lastSavedContent || "").split(/\r?\n/);
    const sessionOriginalLines = (tracker.sessionOriginalContent || "").split(/\r?\n/);

    const unsavedIndices = computeChangedLineIndices(savedLines, currentLines);
    const sessionDiffIndices = computeChangedLineIndices(sessionOriginalLines, currentLines);

    const newDecorations: any[] = [];
    for (let i = 0; i < currentLines.length; i++) {
      const lineNum = i + 1;
      let className = "";

      if (unsavedIndices.has(i)) {
        className = "monaco-line-orange";
      } else if (sessionDiffIndices.has(i)) {
        className = "monaco-line-green";
      }

      if (className) {
        newDecorations.push({
          range: new monaco.Range(lineNum, 1, lineNum, 1),
          options: {
            isWholeLine: true,
            linesDecorationsClassName: className
          }
        });
      }
    }

    const oldDecs = (editor as any)._lineDecorations || [];
    const newDecsIds = editor.deltaDecorations(oldDecs, newDecorations);
    (editor as any)._lineDecorations = newDecsIds;
  };

    // Dynamically update Monaco theme when accent colors change in settings
  useEffect(() => {
    const handleThemeChange = (e: Event) => {
      const customEvent = e as CustomEvent<any>;
      if (monacoRef.current && customEvent.detail) {
        updateMonacoAccentTheme(monacoRef.current, customEvent.detail);
      }
    };
    window.addEventListener("accent-theme-changed", handleThemeChange);
    return () => {
      window.removeEventListener("accent-theme-changed", handleThemeChange);
    };
  }, []);

  // Run decorations updates when content/tab/saving updates
  useEffect(() => {
    const activeTab = jsonTabs.find(t => t.id === activeJsonTabId);
    if (editorRef.current && monacoRef.current && activeTab) {
      updateEditorDecorations(editorRef.current, monacoRef.current, activeTab);
    }
  }, [jsonString, activeJsonTabId, jsonTabs]);

  const isJsonValid = (() => {
    if (!jsonString.trim()) return false;
    if (mode === "markdown") return true;
    if (mode === "json") {
      try {
        JSON.parse(jsonString);
        return true;
      } catch (e) {
        return false;
      }
    } else {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(jsonString, "application/xml");
        return !doc.querySelector("parsererror");
      } catch (e) {
        return false;
      }
    }
  })();

  const insertFormatting = (before: string, after: string = "") => {
    if (!editorRef.current || !monacoRef.current) return;
    const editor = editorRef.current;
    const selection = editor.getSelection();
    const model = editor.getModel();
    if (!model || !selection) return;

    const selectedText = model.getValueInRange(selection);
    const replacement = before + selectedText + after;
    
    const range = new monacoRef.current.Range(
      selection.startLineNumber,
      selection.startColumn,
      selection.endLineNumber,
      selection.endColumn
    );
    
    editor.executeEdits("markdown-formatter", [{
      range,
      text: replacement,
      forceMoveMarkers: true
    }]);

    editor.focus();
    if (selectedText.length === 0) {
      const newColumn = selection.startColumn + before.length;
      editor.setSelection(new monacoRef.current.Selection(
        selection.startLineNumber,
        newColumn,
        selection.startLineNumber,
        newColumn
      ));
    }
  };

  const applyLineFormatting = (prefix: string) => {
    if (!editorRef.current || !monacoRef.current) return;
    const editor = editorRef.current;
    const selection = editor.getSelection();
    const model = editor.getModel();
    if (!model || !selection) return;

    const startLine = selection.startLineNumber;
    const endLine = selection.endLineNumber;
    const edits = [];

    for (let line = startLine; line <= endLine; line++) {
      const lineText = model.getLineContent(line);
      const match = lineText.match(/^(\s*)(#+\s+|- \[\s*\]\s+|- \s+|\d+\.\s+|> \s+)?(.*)/);
      if (match) {
        const indent = match[1];
        const currentPrefix = match[2] || "";
        const content = match[3];

        if (prefix === "- [ ] ") {
          if (currentPrefix.includes("[ ]")) {
            const range = new monacoRef.current.Range(line, 1, line, indent.length + currentPrefix.length + 1);
            edits.push({ range, text: `${indent}- [x] ${content}` });
          } else if (currentPrefix.includes("[x]") || currentPrefix.includes("[X]")) {
            const range = new monacoRef.current.Range(line, 1, line, indent.length + currentPrefix.length + 1);
            edits.push({ range, text: `${indent}${content}` });
          } else {
            const range = new monacoRef.current.Range(line, 1, line, indent.length + currentPrefix.length + 1);
            edits.push({ range, text: `${indent}- [ ] ${content}` });
          }
        } else {
          if (currentPrefix.trim() === prefix.trim()) {
            const range = new monacoRef.current.Range(line, 1, line, indent.length + currentPrefix.length + 1);
            edits.push({ range, text: `${indent}${content}` });
          } else {
            const range = new monacoRef.current.Range(line, 1, line, indent.length + currentPrefix.length + 1);
            edits.push({ range, text: `${indent}${prefix}${content}` });
          }
        }
      }
    }

    editor.executeEdits("line-formatting", edits);
    editor.focus();
  };

  const handleFormat = () => {
    try {
      if (mode === "json") {
        const parsed = JSON.parse(jsonString);
        const formatted = JSON.stringify(parsed, null, 2);
        setJsonString(formatted, false);
      } else if (mode === "xml") {
        const { error } = xmlStringToJsObject(jsonString);
        if (error) {
          message.warning(t("leftPane.xmlFormatError"));
          return;
        }
        const formatted = formatXmlString(jsonString);
        setJsonString(formatted, false);
      }
    } catch (e) {
      message.warning(t("leftPane.docFormatError"));
    }
  };

  // Native file picker dialogs
  const handleOpenJsonFile = async () => {
    const selectedPath = await invokeTauriSafe<string | null>("open_file_dialog", {
      title: t("menu.open"),
      filterName: t("menu.supportedFilesFilter"),
      filterExt: mode === "json" ? "json" : mode === "xml" ? "xml;xsd;dtd;rng;sch" : mode === "txt" ? "txt;log;text" : "md;markdown"
    });
    if (selectedPath) {
      openJsonFile(selectedPath);
    }
  };

  const handleOpenSchemaFile = async () => {
    const selectedPath = await invokeTauriSafe<string | null>("open_file_dialog", {
      title: mode === "json" ? t("leftPane.schemaJsonTitle") : t("leftPane.schemaXmlTitle"),
      filterName: mode === "json" ? "JSON Schema (*.json)" : "XML Schema (*.xsd, *.dtd, *.rng, *.sch, *.xml)",
      filterExt: mode === "json" ? "json" : "xsd;dtd;rng;sch;xml"
    });
    if (selectedPath) {
      openSchemaFile(selectedPath);
      setSchemaEnabled(true);
    }
  };

  // Re-run validation when display language changes so validation messages update immediately
  useEffect(() => {
    const state = useFileStore.getState();
    if (state.mode === "json" || state.mode === "xml") {
      state.runValidation(state.jsonString, state.mode);
    }
  }, [currentLanguage]);

  // Vertical splitter drag handler for resizing the bottom-left Schema panel (JSON & XML)
  const handleSchemaResizeMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const startHeight = schemaHeight;
    setIsResizingSchema(true);

    const containerHeight = leftPaneRef.current?.getBoundingClientRect().height || window.innerHeight;
    const footerReserved = validationErrors.length > 0 ? 144 : 36;
    const maxHeight = Math.max(200, Math.floor(containerHeight - footerReserved - 130));
    const minHeight = 140;

    let latestHeight = startHeight;

    const handleMouseMove = (moveEvt: MouseEvent) => {
      const deltaY = startY - moveEvt.clientY;
      const clamped = Math.max(minHeight, Math.min(maxHeight, startHeight + deltaY));
      latestHeight = Math.round(clamped);
      setSchemaHeight(latestHeight);
    };

    const handleMouseUp = () => {
      setIsResizingSchema(false);
      try {
        localStorage.setItem("fileditor_schema_panel_height", String(latestHeight));
      } catch {}
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  // Synchronize JSON schema with Monaco worker upon schema update or activation
  useEffect(() => {
    if (monacoRef.current && mode === "json") {
      const monaco = monacoRef.current;
      const effectiveDialect = schemaValue
        ? (jsonSchemaDialect === "auto" ? detectJsonSchemaDialect(schemaValue) : jsonSchemaDialect)
        : "draft-07";
      const isMonacoDraftCompatible = effectiveDialect !== "jtd";
      const monacoSchema =
        schemaValue && effectiveDialect === "draft-04"
          ? normalizeDraft04Schema(schemaValue, true)
          : schemaValue;
      monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
        validate: true,
        enableSchemaRequest: false,
        schemaRequest: "ignore",
        schemas: isSchemaEnabled && monacoSchema && isMonacoDraftCompatible
          ? [
            {
              uri: "fileditor://active-json-schema.json",
              fileMatch: ["inmemory://fileditor/main/*"],
              schema: monacoSchema
            }
          ]
          : []
      });
    }
  }, [schemaValue, isSchemaEnabled, mode, jsonSchemaDialect]);

  // Listen to clicks in the preview pane and move cursor / selection in editor
  useEffect(() => {
    const handlePreviewClick = (e: Event) => {
      const { markdownSyncEditorFromPreview } = useFileStore.getState();
      if (!markdownSyncEditorFromPreview) return;

      const customEvent = e as CustomEvent<{ line: number; colIndex?: number; selectedText?: string }>;
      const lineNum = customEvent.detail.line;
      const colIndex = customEvent.detail.colIndex;
      const selectedText = customEvent.detail.selectedText?.trim();

      if (!editorRef.current) return;

      const editor = editorRef.current;
      const model = editor.getModel();
      if (!model) return;

      isSyncingFromPreview.current = true;

      const monacoLineNumber = lineNum + 1;
      const lineContent = model.getLineContent(monacoLineNumber);

      let startCol = 1;
      let endCol = lineContent.length + 1;

      // Table cell targeting
      if (colIndex !== undefined && lineContent.includes("|")) {
        const parts = lineContent.split("|");
        const targetPartIndex = colIndex + 1;
        if (targetPartIndex < parts.length) {
          let offset = 0;
          for (let p = 0; p < targetPartIndex; p++) {
            offset += parts[p].length + 1;
          }
          const cellSegment = parts[targetPartIndex];
          if (selectedText && cellSegment.includes(selectedText)) {
            const idxInCell = cellSegment.indexOf(selectedText);
            startCol = offset + idxInCell + 1;
            endCol = startCol + selectedText.length;
          } else {
            const leadingSpaces = cellSegment.length - cellSegment.trimStart().length;
            const trimmedLen = cellSegment.trim().length;
            if (trimmedLen > 0) {
              startCol = offset + leadingSpaces + 1;
              endCol = startCol + trimmedLen;
            } else {
              startCol = offset + 1;
              endCol = offset + cellSegment.length + 1;
            }
          }
        }
      } else if (selectedText && lineContent.includes(selectedText)) {
        const idx = lineContent.indexOf(selectedText);
        if (idx !== -1) {
          startCol = idx + 1;
          endCol = startCol + selectedText.length;
        }
      }

      // Highlight the targeted range / line
      editor.setSelection({
        startLineNumber: monacoLineNumber,
        startColumn: startCol,
        endLineNumber: monacoLineNumber,
        endColumn: endCol
      });

      // Position cursor at start of selection and scroll so line is centered in view
      editor.setPosition({ lineNumber: monacoLineNumber, column: startCol });
      editor.revealLineInCenter(monacoLineNumber);

      setTimeout(() => {
        isSyncingFromPreview.current = false;
      }, 200);
    };

    window.addEventListener("custom-preview-click", handlePreviewClick);
    return () => {
      window.removeEventListener("custom-preview-click", handlePreviewClick);
    };
  }, []);

  // Format helper event from GlobalTabBar
  useEffect(() => {
    const handleFormatEvent = () => {
      handleFormat();
    };
    window.addEventListener("custom-format-active-tab", handleFormatEvent);
    return () => {
      window.removeEventListener("custom-format-active-tab", handleFormatEvent);
    };
  }, [jsonString, mode]);

  // Thema- und Markdown-Definition vor dem Laden des Editors
  const handleBeforeMount = (monaco: any) => {
    const theme = useJSONStore.getState().accentTheme;
    configureMonacoMarkdown(monaco, theme);
  };

  // Initialisierung des Monaco-Editors mit Tastenkombinationen und Auto-Wrap
  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    editor.onDidFocusEditorWidget(() => {
      (window as any).__FILEDITOR_SCHEMA_FOCUSED__ = false;
    });

    // Handle Ctrl+Click on Markdown links inside Monaco Editor
    editor.onMouseDown((e: any) => {
      if ((e.event.ctrlKey || e.event.metaKey) && mode === "markdown" && e.target && e.target.position) {
        const model = editor.getModel();
        if (!model) return;
        const lineContent = model.getLineContent(e.target.position.lineNumber);
        const col = e.target.position.column;
        const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
        let match;
        while ((match = linkRegex.exec(lineContent)) !== null) {
          const startCol = match.index + 1;
          const endCol = startCol + match[0].length;
          if (col >= startCol && col <= endCol) {
            e.event.preventDefault();
            e.event.stopPropagation();
            const target = match[2].trim();
            if (/^https?:\/\//i.test(target)) {
              invokeTauriSafe("open_external_url", { url: target });
            } else {
              openArbitraryFile(target, openJsonFile);
            }
            break;
          }
        }
      }
    });

    // Listen to cursor changes and dispatch custom event for markdown scroll sync
    editor.onDidChangeCursorPosition((e: any) => {
      setCursorPos({ line: e.position.lineNumber, col: e.position.column });
      const line = e.position.lineNumber - 1;
      window.dispatchEvent(new CustomEvent("editor-cursor-move", { detail: { line } }));
    });

    // Listen to selection and cursor changes in markdown editor to sync to live preview
    editor.onDidChangeCursorSelection((e: any) => {
      if (isSyncingFromPreview.current) return;
      if (useFileStore.getState().mode !== "markdown") return;

      const { markdownSyncPreviewFromEditor } = useFileStore.getState();
      if (!markdownSyncPreviewFromEditor) return;

      const selection = e.selection;
      if (!selection) return;

      const isSelecting = !selection.isEmpty();
      const isMouseClick = e.source === "mouse";

      // React when marking a line/text or clicking into a line with mouse
      if (isSelecting || isMouseClick) {
        const startLine = selection.startLineNumber - 1;
        const endLine = selection.endLineNumber - 1;

        const model = editor.getModel();
        let selectedText = "";
        let colIndex: number | undefined = undefined;

        if (model) {
          if (isSelecting) {
            selectedText = model.getValueInRange(selection);
          }
          const lineContent = model.getLineContent(selection.startLineNumber);
          const trimmed = lineContent.trim();
          if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
            // Count unescaped '|' before cursor position
            const textBefore = lineContent.substring(0, selection.startColumn - 1);
            const unescapedText = textBefore.replace(/\\\|/g, "");
            const pipeMatches = unescapedText.match(/\|/g);
            if (pipeMatches && pipeMatches.length >= 1) {
              colIndex = pipeMatches.length - 1;
            }
          }
        }

        clearTimeout(selectionDebounceRef.current);
        selectionDebounceRef.current = setTimeout(() => {
          window.dispatchEvent(new CustomEvent("custom-editor-select", {
            detail: { line: startLine, endLine, selectedText, colIndex }
          }));
        }, 40);
      }
    });

    // Bind drop event directly on Monaco's DOM node using capture phase
    const domNode = editor.getDomNode();
    if (domNode) {
      domNode.addEventListener("drop", (e: DragEvent) => {
        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
          e.preventDefault();
          e.stopPropagation();

          const file = files[0];
          let path = (file as any).path || file.name;
          // Replace backslashes with forward slashes to prevent escape sequences in Markdown
          path = path.replace(/\\/g, "/");
          const name = file.name;
          
          const isImage = /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(name);
          const markdownSnippet = isImage 
            ? `![${name.replace(/\.[^/.]+$/, "")}](${path})`
            : `[${name}](${path})`;

          const target = editor.getTargetAtClientPoint(e.clientX, e.clientY);
          const position = target?.position || editor.getPosition() || { lineNumber: 1, column: 1 };
          
          const range = new monaco.Range(
            position.lineNumber,
            position.column,
            position.lineNumber,
            position.column
          );
          
          editor.executeEdits("drag-drop-file", [{
            range,
            text: markdownSnippet,
            forceMoveMarkers: true
          }]);
          
          editor.focus();
        }
      }, true);

      // Strip tooltips/titles from Find Widget elements to completely disable Find tooltips
      domNode.addEventListener("mouseover", (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target && target.closest(".find-widget, .monaco-find-widget")) {
          const findWidget = target.closest(".find-widget, .monaco-find-widget");
          if (findWidget) {
            findWidget.querySelectorAll("[title]").forEach((el) => {
              el.removeAttribute("title");
            });
          }
        }
      }, true);
    }

    editor.onDidScrollChange((e: any) => {
      setShowJumpUp(e.scrollTop > 80);
    });

    // Handle dynamic custom hotkeys inside Monaco
    editor.onKeyDown((e: any) => {
      const state = useJSONStore.getState();
      const hotkeys = state.customHotkeys || {};

      const matchesShortcut = (shortcut: string) => {
        if (!shortcut) return false;
        const parts = shortcut.split("+").map(p => p.trim().toLowerCase());
        const needsCtrl = parts.includes("ctrl");
        const needsShift = parts.includes("shift");
        const needsAlt = parts.includes("alt");
        
        const keyPart = parts.find(p => p !== "ctrl" && p !== "shift" && p !== "alt");
        if (!keyPart) return false;

        const isCtrlPressed = e.ctrlKey || e.metaKey;
        const isShiftPressed = e.shiftKey;
        const isAltPressed = e.altKey;

        if (needsCtrl !== isCtrlPressed) return false;
        if (needsShift !== isShiftPressed) return false;
        if (needsAlt !== isAltPressed) return false;

        const browserKey = e.browserEvent.key.toLowerCase();
        if (keyPart === "space" && browserKey === " ") return true;
        return browserKey === keyPart;
      };

      if (mode === "markdown") {
        if (e.browserEvent.key === "F11") {
          e.preventDefault();
          e.stopPropagation();
          const { isRightPaneFullscreen, setRightPaneFullscreen } = useJSONStore.getState();
          setRightPaneFullscreen(!isRightPaneFullscreen);
          return;
        }
        if (e.browserEvent.key === "Escape") {
          const { isRightPaneFullscreen, setRightPaneFullscreen } = useJSONStore.getState();
          if (isRightPaneFullscreen) {
            e.preventDefault();
            e.stopPropagation();
            setRightPaneFullscreen(false);
            return;
          }
        }
        if (matchesShortcut(hotkeys.bold || "Ctrl+Shift+B")) {
          e.preventDefault();
          e.stopPropagation();
          insertFormatting("**", "**");
          return;
        }
        if (matchesShortcut(hotkeys.italic || "Ctrl+Shift+K")) {
          e.preventDefault();
          e.stopPropagation();
          insertFormatting("*", "*");
          return;
        }
        if (matchesShortcut(hotkeys.strikethrough || "Ctrl+Shift+X")) {
          e.preventDefault();
          e.stopPropagation();
          insertFormatting("~~", "~~");
          return;
        }
        if (matchesShortcut(hotkeys.underline || "Ctrl+Shift+U")) {
          e.preventDefault();
          e.stopPropagation();
          insertFormatting("<u>", "</u>");
          return;
        }
        if (matchesShortcut(hotkeys.code || "Ctrl+Shift+C")) {
          e.preventDefault();
          e.stopPropagation();
          insertFormatting("`", "`");
          return;
        }
        if (matchesShortcut(hotkeys.blockquote || "Ctrl+Shift+Q")) {
          e.preventDefault();
          e.stopPropagation();
          applyLineFormatting("> ");
          return;
        }
        if (matchesShortcut(hotkeys.checklist || "Ctrl+Shift+L")) {
          e.preventDefault();
          e.stopPropagation();
          applyLineFormatting("- [ ] ");
          return;
        }

        // Automatische Aufzählung bei Enter
        if (state.markdownAutoNumbering) {
          const model = editor.getModel();
          const pos = editor.getPosition();
          if (model && pos) {
            const lineContent = model.getLineContent(pos.lineNumber);

            if (e.browserEvent.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.altKey) {
              const olMatch = lineContent.match(/^(\s*)(\d+)\.\s*(.*)$/);
              const ulMatch = lineContent.match(/^(\s*)([-*+])\s*(.*)$/);

              if (olMatch) {
                const [_, indent, numStr, textContent] = olMatch;
                const num = parseInt(numStr, 10);
                const isAutoGenerated = autoNumberRef.current && autoNumberRef.current.lineNumber === pos.lineNumber;

                // If line after numbered list prefix is empty:
                // Only clear prefix if it was auto-generated (second Enter) or for num > 1 (exiting list)
                if (textContent.trim() === "" && (isAutoGenerated || num > 1)) {
                  e.preventDefault();
                  e.stopPropagation();
                  const range = new monacoRef.current.Range(pos.lineNumber, 1, pos.lineNumber, lineContent.length + 1);
                  editor.executeEdits("markdown-auto-num-clear", [{
                    range,
                    text: "",
                    forceMoveMarkers: true
                  }]);
                  autoNumberRef.current = null;
                  return;
                }

                // Neuer Zeilenumbruch mit nächster Zahl
                if (pos.column > indent.length + numStr.length + 1) {
                  e.preventDefault();
                  e.stopPropagation();
                  const nextNum = num + 1;
                  const nextPrefix = `\n${indent}${nextNum}. `;

                  const edits: any[] = [{
                    range: new monacoRef.current.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
                    text: nextPrefix,
                    forceMoveMarkers: true
                  }];

                  // Check subsequent lines for renumbering collisions at the same indentation level
                  const lineCount = model.getLineCount();
                  let expectedCollision = nextNum;
                  for (let currLine = pos.lineNumber + 1; currLine <= lineCount; currLine++) {
                    const currContent = model.getLineContent(currLine);
                    const match = currContent.match(/^(\s*)(\d+)\.\s*(.*)$/);
                    if (!match) break;
                    const currIndent = match[1];
                    const currNum = parseInt(match[2], 10);

                    // Must match the exact indentation level
                    if (currIndent !== indent) break;

                    // If subsequent line has the collision number, bump it to next number
                    if (currNum === expectedCollision) {
                      const numStartCol = currIndent.length + 1;
                      const numEndCol = numStartCol + match[2].length;
                      edits.push({
                        range: new monacoRef.current.Range(currLine, numStartCol, currLine, numEndCol),
                        text: String(currNum + 1),
                        forceMoveMarkers: false
                      });
                      expectedCollision = currNum + 1;
                    } else {
                      // Sequence broken or gap (e.g. 3 or 4 already below 2), no further collision
                      break;
                    }
                  }

                  editor.executeEdits("markdown-auto-num", edits);
                  const nextPos = { lineNumber: pos.lineNumber + 1, column: nextPrefix.length };
                  editor.setPosition(nextPos);
                  autoNumberRef.current = {
                    lineNumber: pos.lineNumber + 1,
                    prefix: `${indent}${nextNum}. `
                  };
                  return;
                }
              } else if (ulMatch) {
                const [_, indent, bullet, textContent] = ulMatch;

                // If line after bullet prefix is empty -> second Enter clears prefix
                if (textContent.trim() === "") {
                  e.preventDefault();
                  e.stopPropagation();
                  const range = new monacoRef.current.Range(pos.lineNumber, 1, pos.lineNumber, lineContent.length + 1);
                  editor.executeEdits("markdown-auto-num-clear", [{
                    range,
                    text: "",
                    forceMoveMarkers: true
                  }]);
                  autoNumberRef.current = null;
                  return;
                }

                // Neuer Zeilenumbruch mit gleichem Unterpunkt-Symbol und Leerzeichen
                if (pos.column > indent.length + bullet.length) {
                  e.preventDefault();
                  e.stopPropagation();
                  const nextPrefix = `\n${indent}${bullet} `;
                  const range = new monacoRef.current.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column);
                  editor.executeEdits("markdown-auto-num", [{
                    range,
                    text: nextPrefix,
                    forceMoveMarkers: true
                  }]);
                  const nextPos = { lineNumber: pos.lineNumber + 1, column: nextPrefix.length };
                  editor.setPosition(nextPos);
                  autoNumberRef.current = {
                    lineNumber: pos.lineNumber + 1,
                    prefix: `${indent}${bullet} `
                  };
                  return;
                }
              }
            } else if (e.browserEvent.key === "Tab" && !e.ctrlKey && !e.altKey) {
              const emptyUlMatch = lineContent.match(/^(\s*)([-*+])\s*$/);
              const emptyOlMatch = lineContent.match(/^(\s*)(\d+)\.\s*$/);

              if (emptyUlMatch) {
                e.preventDefault();
                e.stopPropagation();
                const [_, indent, bullet] = emptyUlMatch;
                if (!e.shiftKey) {
                  // Tab: indent 2 spaces
                  const newIndent = indent + "  ";
                  const newLineContent = `${newIndent}${bullet} `;
                  const range = new monacoRef.current.Range(pos.lineNumber, 1, pos.lineNumber, lineContent.length + 1);
                  editor.executeEdits("markdown-indent-bullet", [{
                    range,
                    text: newLineContent,
                    forceMoveMarkers: true
                  }]);
                  editor.setPosition({
                    lineNumber: pos.lineNumber,
                    column: newLineContent.length + 1
                  });
                  if (autoNumberRef.current && autoNumberRef.current.lineNumber === pos.lineNumber) {
                    autoNumberRef.current.prefix = newLineContent;
                  }
                } else if (indent.length >= 2) {
                  // Shift + Tab: outdent 2 spaces
                  const newIndent = indent.slice(2);
                  const newLineContent = `${newIndent}${bullet} `;
                  const range = new monacoRef.current.Range(pos.lineNumber, 1, pos.lineNumber, lineContent.length + 1);
                  editor.executeEdits("markdown-outdent-bullet", [{
                    range,
                    text: newLineContent,
                    forceMoveMarkers: true
                  }]);
                  editor.setPosition({
                    lineNumber: pos.lineNumber,
                    column: newLineContent.length + 1
                  });
                  if (autoNumberRef.current && autoNumberRef.current.lineNumber === pos.lineNumber) {
                    autoNumberRef.current.prefix = newLineContent;
                  }
                }
                return;
              } else if (emptyOlMatch) {
                e.preventDefault();
                e.stopPropagation();
                const [_, indent, numStr] = emptyOlMatch;
                if (!e.shiftKey) {
                  // Tab: indent 2 spaces
                  const newIndent = indent + "  ";
                  const newLineContent = `${newIndent}${numStr}. `;
                  const range = new monacoRef.current.Range(pos.lineNumber, 1, pos.lineNumber, lineContent.length + 1);
                  editor.executeEdits("markdown-indent-num", [{
                    range,
                    text: newLineContent,
                    forceMoveMarkers: true
                  }]);
                  editor.setPosition({
                    lineNumber: pos.lineNumber,
                    column: newLineContent.length + 1
                  });
                  if (autoNumberRef.current && autoNumberRef.current.lineNumber === pos.lineNumber) {
                    autoNumberRef.current.prefix = newLineContent;
                  }
                } else if (indent.length >= 2) {
                  // Shift + Tab: outdent 2 spaces
                  const newIndent = indent.slice(2);
                  const newLineContent = `${newIndent}${numStr}. `;
                  const range = new monacoRef.current.Range(pos.lineNumber, 1, pos.lineNumber, lineContent.length + 1);
                  editor.executeEdits("markdown-outdent-num", [{
                    range,
                    text: newLineContent,
                    forceMoveMarkers: true
                  }]);
                  editor.setPosition({
                    lineNumber: pos.lineNumber,
                    column: newLineContent.length + 1
                  });
                  if (autoNumberRef.current && autoNumberRef.current.lineNumber === pos.lineNumber) {
                    autoNumberRef.current.prefix = newLineContent;
                  }
                }
                return;
              }
            } else if (e.browserEvent.key === "Backspace" && !e.shiftKey && !e.ctrlKey && !e.altKey) {
              if (autoNumberRef.current && autoNumberRef.current.lineNumber === pos.lineNumber) {
                const prefix = autoNumberRef.current.prefix;
                if (lineContent === prefix && pos.column === prefix.length + 1) {
                  e.preventDefault();
                  e.stopPropagation();
                  const range = new monacoRef.current.Range(pos.lineNumber, 1, pos.lineNumber, lineContent.length + 1);
                  editor.executeEdits("markdown-auto-num-backspace", [{
                    range,
                    text: "",
                    forceMoveMarkers: true
                  }]);
                  autoNumberRef.current = null;
                  return;
                }
              }
            } else if (e.browserEvent.key !== "Shift" && e.browserEvent.key !== "Control" && e.browserEvent.key !== "Alt") {
              autoNumberRef.current = null;
            }
          }
        }
      }

      if (matchesShortcut(hotkeys.newFile || "Ctrl+N")) {
        e.preventDefault();
        e.stopPropagation();
        addJsonTab(null, "", mode);
        return;
      }
      if (matchesShortcut(hotkeys.openFile || "Ctrl+O")) {
        e.preventDefault();
        e.stopPropagation();
        handleOpenJsonFile();
        return;
      }
      if (matchesShortcut(hotkeys.save || "Ctrl+S")) {
        e.preventDefault();
        e.stopPropagation();
        saveJsonTab();
        return;
      }
      if (matchesShortcut(hotkeys.saveAll || "Ctrl+Shift+S")) {
        e.preventDefault();
        e.stopPropagation();
        saveAll();
        return;
      }
      if (matchesShortcut(hotkeys.saveAs || "Ctrl+Alt+S")) {
        e.preventDefault();
        e.stopPropagation();
        saveJsonTab(null, null, true);
        return;
      }

      // Wrap selection on typing certain characters
      const selection = editor.getSelection();
      if (!selection || selection.isEmpty()) return;

      const model = editor.getModel();
      if (!model) return;

      let wrapCharBefore = "";
      let wrapCharAfter = "";

      if (e.browserEvent.key === "`") {
        wrapCharBefore = "`";
        wrapCharAfter = "`";
      } else if (e.browserEvent.key === "*") {
        wrapCharBefore = "*";
        wrapCharAfter = "*";
      } else if (e.browserEvent.key === "_") {
        wrapCharBefore = "_";
        wrapCharAfter = "_";
      } else if (e.browserEvent.key === "~") {
        wrapCharBefore = "~";
        wrapCharAfter = "~";
      } else if (e.browserEvent.key === "\"") {
        wrapCharBefore = "\"";
        wrapCharAfter = "\"";
      } else if (e.browserEvent.key === "'") {
        wrapCharBefore = "'";
        wrapCharAfter = "'";
      } else if (e.browserEvent.key === "(") {
        wrapCharBefore = "(";
        wrapCharAfter = ")";
      } else if (e.browserEvent.key === "{") {
        wrapCharBefore = "{";
        wrapCharAfter = "}";
      } else if (e.browserEvent.key === "[") {
        wrapCharBefore = "[";
        wrapCharAfter = "]";
      }

      if (wrapCharBefore) {
        e.preventDefault();
        e.stopPropagation();
        
        const selectedText = model.getValueInRange(selection);
        const replacement = wrapCharBefore + selectedText + wrapCharAfter;
        const range = new monaco.Range(
          selection.startLineNumber,
          selection.startColumn,
          selection.endLineNumber,
          selection.endColumn
        );
        
        editor.executeEdits("wrap-selection", [{
          range,
          text: replacement,
          forceMoveMarkers: true
        }]);
        
        editor.setSelection(new monaco.Selection(
          selection.startLineNumber,
          selection.startColumn + wrapCharBefore.length,
          selection.endLineNumber,
          selection.endColumn + wrapCharBefore.length
        ));
      }
    });

    if (mode === "json") {
      const effectiveDialect = schemaValue
        ? (jsonSchemaDialect === "auto" ? detectJsonSchemaDialect(schemaValue) : jsonSchemaDialect)
        : "draft-07";
      const isMonacoDraftCompatible = effectiveDialect !== "jtd";
      const monacoSchema =
        schemaValue && effectiveDialect === "draft-04"
          ? normalizeDraft04Schema(schemaValue, true)
          : schemaValue;
      monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
        validate: true,
        enableSchemaRequest: false,
        schemaRequest: "ignore",
        schemas: isSchemaEnabled && monacoSchema && isMonacoDraftCompatible
          ? [
              {
                uri: "fileditor://active-json-schema.json",
                fileMatch: ["inmemory://fileditor/main/*"],
                schema: monacoSchema
              }
            ]
          : []
      });
    }
  };

  const activeSchemaTab = schemaTabs.find((st) => st.id === activeSchemaTabId);
  const detectedJsonDialect = schemaValue ? detectJsonSchemaDialect(schemaValue) : "draft-07";
  const detectedXmlDialect = detectXmlSchemaDialect(schemaString || "");

  const activeTxtBtnStyle: React.CSSProperties = {
    backgroundColor: "rgba(var(--color-primary-accent-rgb), 0.18)",
    color: "var(--color-primary-accent)",
    borderColor: "rgba(var(--color-primary-accent-rgb), 0.45)"
  };

  return (
    <div ref={leftPaneRef} className="w-full h-full flex flex-col bg-hero-bg select-none relative">
      {/* Main Editor Panel */}
      <div className="flex-1 flex flex-col min-h-[120px] border-b border-hero-border">

        {/* Editor Area or Startup Page */}
        {activeJsonTabId ? (
          <div className="flex-1 min-h-0 relative flex flex-col">
            {/* FORMATTING TOOLBAR FOR MARKDOWN */}
            {mode === "markdown" && (
              <div className="h-8 bg-[#141b27] border-b border-hero-border flex items-center px-2 space-x-0.5 shrink-0 select-none overflow-x-auto scrollbar-none">
                <Tooltip title={t("editor.bold")}>
                  <Button type="text" size="small" icon={<Bold size={13} />} onClick={() => insertFormatting("**", "**")} className="text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center h-6 w-6 p-0" />
                </Tooltip>
                <Tooltip title={t("editor.italic")}>
                  <Button type="text" size="small" icon={<Italic size={13} />} onClick={() => insertFormatting("*", "*")} className="text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center h-6 w-6 p-0" />
                </Tooltip>
                <Tooltip title={t("editor.strikethrough")}>
                  <Button type="text" size="small" icon={<Strikethrough size={13} />} onClick={() => insertFormatting("~~", "~~")} className="text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center h-6 w-6 p-0" />
                </Tooltip>
                <Tooltip title={t("editor.underline")}>
                  <Button type="text" size="small" icon={<Underline size={13} />} onClick={() => insertFormatting("<u>", "</u>")} className="text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center h-6 w-6 p-0" />
                </Tooltip>
                <div className="h-4 w-[1px] bg-slate-850 mx-1"></div>
                <Tooltip title={t("editor.h1")}>
                  <Button type="text" size="small" icon={<Heading1 size={13} />} onClick={() => applyLineFormatting("# ")} className="text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center h-6 w-6 p-0" />
                </Tooltip>
                <Tooltip title={t("editor.h2")}>
                  <Button type="text" size="small" icon={<Heading2 size={13} />} onClick={() => applyLineFormatting("## ")} className="text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center h-6 w-6 p-0" />
                </Tooltip>
                <Tooltip title={t("editor.h3")}>
                  <Button type="text" size="small" icon={<Heading3 size={13} />} onClick={() => applyLineFormatting("### ")} className="text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center h-6 w-6 p-0" />
                </Tooltip>
                <div className="h-4 w-[1px] bg-slate-855 mx-1"></div>
                <Tooltip title={t("editor.bulletList")}>
                  <Button type="text" size="small" icon={<List size={13} />} onClick={() => applyLineFormatting("- ")} className="text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center h-6 w-6 p-0" />
                </Tooltip>
                <Tooltip title={t("editor.orderedList")}>
                  <Button type="text" size="small" icon={<ListOrdered size={13} />} onClick={() => applyLineFormatting("1. ")} className="text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center h-6 w-6 p-0" />
                </Tooltip>
                <Tooltip title={t("editor.taskList")}>
                  <Button type="text" size="small" icon={<CheckSquare size={13} />} onClick={() => applyLineFormatting("- [ ] ")} className="text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center h-6 w-6 p-0" />
                </Tooltip>
                <div className="h-4 w-[1px] bg-slate-855 mx-1"></div>
                <Tooltip title={t("editor.quote")}>
                  <Button type="text" size="small" icon={<Quote size={13} />} onClick={() => applyLineFormatting("> ")} className="text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center h-6 w-6 p-0" />
                </Tooltip>
                <Tooltip title={t("editor.codeBlock")}>
                  <Button type="text" size="small" icon={<Code2 size={13} />} onClick={() => insertFormatting("```\n", "\n```")} className="text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center h-6 w-6 p-0" />
                </Tooltip>
                <Tooltip title={t("editor.table")}>
                  <Button type="text" size="small" icon={<Table size={13} />} onClick={() => insertFormatting(t("leftPane.tableTemplate"))} className="text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center h-6 w-6 p-0" />
                </Tooltip>
                <div className="h-4 w-[1px] bg-slate-855 mx-1"></div>
                <LinkInsertPopover
                  open={linkPopoverOpen}
                  onOpenChange={handleOpenLinkPopover}
                  initialDisplayText={selectedEditorText}
                  onInsertLink={(label, urlOrPath) => {
                    if (!editorRef.current || !monacoRef.current) return;
                    const editor = editorRef.current;
                    const selection = editor.getSelection();
                    const model = editor.getModel();
                    if (!model || !selection) return;

                    const linkSnippet = `[${label}](${urlOrPath})`;
                    const range = new monacoRef.current.Range(
                      selection.startLineNumber,
                      selection.startColumn,
                      selection.endLineNumber,
                      selection.endColumn
                    );

                    editor.executeEdits("markdown-insert-link", [{
                      range,
                      text: linkSnippet,
                      forceMoveMarkers: true
                    }]);

                    editor.focus();
                    const newCol = selection.startColumn + linkSnippet.length;
                    editor.setSelection(new monacoRef.current.Selection(
                      selection.startLineNumber,
                      newCol,
                      selection.startLineNumber,
                      newCol
                    ));
                  }}
                >
                  <Tooltip title={t("editor.insertLink")}>
                    <Button type="text" size="small" icon={<Link2 size={13} />} className="text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center h-6 w-6 p-0" />
                  </Tooltip>
                </LinkInsertPopover>
                <Tooltip title={t("editor.insertImage")}>
                  <Button type="text" size="small" icon={<Image size={13} />} onClick={() => insertFormatting("![Alt Text](", ")")} className="text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center h-6 w-6 p-0" />
                </Tooltip>
              </div>
            )}
            {/* FORMATTING TOOLBAR FOR TEXT MODE */}
            {mode === "txt" && (
              <div className="h-8 bg-[#141b27] border-b border-hero-border flex items-center px-2 space-x-1 shrink-0 select-none overflow-x-auto scrollbar-none">
                <ClickableTooltip title={t("leftPane.txtWrapTooltip")}>
                  <Button
                    type="text"
                    size="small"
                    icon={<WrapText size={13} />}
                    onClick={() => setTxtWordWrap(!txtWordWrap)}
                    className={`flex items-center justify-center h-6 px-2 text-xs font-mono rounded ${
                      txtWordWrap ? "border" : "text-slate-400 hover:text-white hover:bg-slate-800"
                    }`}
                    style={txtWordWrap ? activeTxtBtnStyle : undefined}
                  >
                    <span className="ml-1 text-[11px]">{t("leftPane.txtWrap")}</span>
                  </Button>
                </ClickableTooltip>

                <ClickableTooltip title={t("leftPane.txtLinesTooltip")}>
                  <Button
                    type="text"
                    size="small"
                    icon={<Hash size={13} />}
                    onClick={() => setTxtLineNumbers(!txtLineNumbers)}
                    className={`flex items-center justify-center h-6 px-2 text-xs font-mono rounded ${
                      txtLineNumbers ? "border" : "text-slate-400 hover:text-white hover:bg-slate-800"
                    }`}
                    style={txtLineNumbers ? activeTxtBtnStyle : undefined}
                  >
                    <span className="ml-1 text-[11px]">{t("leftPane.txtLines")}</span>
                  </Button>
                </ClickableTooltip>

                <ClickableTooltip title={t("leftPane.txtWhitespaceTooltip")}>
                  <Button
                    type="text"
                    size="small"
                    icon={<Pilcrow size={13} />}
                    onClick={() => setTxtShowWhitespace(!txtShowWhitespace)}
                    className={`flex items-center justify-center h-6 px-2 text-xs font-mono rounded ${
                      txtShowWhitespace ? "border" : "text-slate-400 hover:text-white hover:bg-slate-800"
                    }`}
                    style={txtShowWhitespace ? activeTxtBtnStyle : undefined}
                  >
                    <span className="ml-1 text-[11px]">{t("leftPane.txtWhitespace")}</span>
                  </Button>
                </ClickableTooltip>

                <ClickableTooltip title={t("leftPane.txtMinimapTooltip")}>
                  <Button
                    type="text"
                    size="small"
                    icon={<Map size={13} />}
                    onClick={() => setTxtMinimap(!txtMinimap)}
                    className={`flex items-center justify-center h-6 px-2 text-xs font-mono rounded ${
                      txtMinimap ? "border" : "text-slate-400 hover:text-white hover:bg-slate-800"
                    }`}
                    style={txtMinimap ? activeTxtBtnStyle : undefined}
                  >
                    <span className="ml-1 text-[11px]">Minimap</span>
                  </Button>
                </ClickableTooltip>

                <div className="h-4 w-[1px] bg-slate-850 mx-1"></div>

                <Dropdown
                  menu={{
                    items: [
                      { key: "sort-asc", label: t("leftPane.txtSortAsc"), icon: <SortAsc size={13} /> },
                      { key: "sort-desc", label: t("leftPane.txtSortDesc"), icon: <SortDesc size={13} /> },
                      { key: "sort-num", label: t("leftPane.txtSortNum"), icon: <Hash size={13} /> },
                      { type: "divider" },
                      { key: "unique", label: t("leftPane.txtUniqueLines"), icon: <Scissors size={13} /> },
                      { key: "trim-empty", label: t("leftPane.txtTrimEmpty"), icon: <X size={13} /> }
                    ],
                    onClick: ({ key }) => handleLineOperation(key)
                  }}
                  trigger={["click"]}
                >
                  <ClickableTooltip title={t("leftPane.txtLineOps")}>
                    <Button type="text" size="small" icon={<Layers size={13} />} className="text-slate-400 hover:text-white hover:bg-slate-800 flex items-center gap-1 h-6 px-2 text-xs font-mono">
                      <span>{t("leftPane.txtLines")}</span>
                      <ChevronDown size={11} />
                    </Button>
                  </ClickableTooltip>
                </Dropdown>

                <ClickableTooltip title={t("editor.search")}>
                  <Button
                    type="text"
                    size="small"
                    icon={<Search size={13} />}
                    onClick={() => {
                      if (editorRef.current) {
                        editorRef.current.trigger("keyboard", "actions.find", {});
                      }
                    }}
                    className="text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center h-6 w-6 p-0"
                  />
                </ClickableTooltip>
              </div>
            )}
            <div className="flex-1 min-h-0 relative">
              <Editor
                height="100%"
                path={
                  mode === "json"
                    ? `inmemory://fileditor/main/${activeJsonTabId || "doc"}.json`
                    : mode === "xml"
                    ? `inmemory://fileditor/main/${activeJsonTabId || "doc"}.xml`
                    : undefined
                }
                language={mode === "json" ? "json" : mode === "xml" ? "xml" : mode === "txt" ? "plaintext" : "markdown"}
                theme="hero-dark"
                beforeMount={handleBeforeMount}
                value={jsonString}
                onChange={(value) => setJsonString(value || "")}
                onMount={handleEditorDidMount}
                options={{
                  minimap: { enabled: mode === "txt" ? txtMinimap : false },
                  fontSize: 13,
                  fontFamily: "JetBrains Mono, monospace",
                  lineNumbers: mode === "txt" ? (txtLineNumbers ? "on" : "off") : "on",
                  tabSize: 2,
                  automaticLayout: true,
                  wordWrap: mode === "txt" ? (txtWordWrap ? "on" : "off") : "on",
                  renderWhitespace: mode === "txt" ? (txtShowWhitespace ? "all" : "none") : "none",
                  padding: { top: 8 },
                  mouseWheelZoom: true,
                  unicodeHighlight: {
                    ambiguousCharacters: false,
                    invisibleCharacters: false,
                    nonBasicASCII: false,
                    includeComments: false,
                    includeStrings: false
                  }
                }}
              />

              {/* JumpUp Button */}
              {showJumpUp && (
                <button
                  onClick={() => {
                    if (editorRef.current) {
                      editorRef.current.setScrollTop(0);
                    }
                  }}
                  className="absolute bottom-6 right-6 z-30 w-8 h-8 rounded-full text-white shadow-lg backdrop-blur flex items-center justify-center transition-all cursor-pointer border hover:scale-110 active:scale-95"
                  style={{
                    backgroundColor: "rgba(var(--color-primary-accent-rgb), 0.85)",
                    borderColor: "rgba(var(--color-primary-accent-rgb), 0.45)"
                  }}
                  title={t("editor.jumpUp")}
                >
                  <ChevronUp size={16} />
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-[#090d16] text-slate-400 p-8 select-none">
            <div className="max-w-md w-full space-y-5 text-center">
              <div className="flex justify-center" style={{ color: "var(--color-primary-accent)" }}>
                {mode === "json" ? (
                  <FileJson size={44} className="animate-pulse" />
                ) : mode === "xml" ? (
                  <FileCode size={44} className="animate-pulse" />
                ) : (
                  <FileText size={44} className="animate-pulse" />
                )}
              </div>
              <div>
                <h2 className="text-md font-bold text-white tracking-wide">
                  {mode === "json"
                    ? t("leftPane.jsonSourceTitle")
                    : mode === "xml"
                    ? t("leftPane.xmlSourceTitle")
                    : mode === "txt"
                    ? t("leftPane.txtSourceTitle")
                    : t("leftPane.markdownSourceTitle")}
                </h2>
                <p className="text-xs text-slate-500 mt-1">{t("leftPane.emptyPrompt")}</p>
              </div>
              
              <div className="grid grid-cols-2 gap-3 mt-4">
                <Button 
                  type="dashed"
                  icon={<Plus size={14} />} 
                  onClick={() => addJsonTab()}
                  className="h-16 flex flex-col items-center justify-center border-slate-850 bg-slate-950/20 text-xs text-slate-300 hover:text-white rounded-lg transition-all duration-150"
                >
                  <span className="mt-1">{t("leftPane.newFile")}</span>
                </Button>
                <Button 
                  type="dashed"
                  icon={<FolderOpen size={14} />} 
                  onClick={handleOpenJsonFile}
                  className="h-16 flex flex-col items-center justify-center border-slate-850 bg-slate-950/20 text-xs text-slate-300 hover:text-white rounded-lg transition-all duration-150"
                >
                  <span className="mt-1">{t("leftPane.openFile")}</span>
                </Button>
              </div>

              {recentJsonFiles.length > 0 && (
                <div className="text-left mt-6 pt-5 border-t border-slate-900">
                  <span className="text-[10px] uppercase font-mono tracking-wider font-semibold text-slate-500">{t("leftPane.recentlyOpened")}</span>
                  <div className="space-y-1 mt-2 max-h-40 overflow-y-auto pr-1">
                    {recentJsonFiles.map((p) => (
                      <div 
                        key={p}
                        onClick={() => openJsonFile(p)}
                        className="flex items-center space-x-2 p-1.5 hover:bg-slate-900/60 border border-transparent hover:border-slate-850 rounded cursor-pointer transition-all duration-150 group"
                      >
                        <span className="text-xs font-mono text-slate-400 group-hover:text-white truncate flex-1">{p}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Vertical Splitter Handle when Schema Panel is expanded */}
      {(mode === "json" || mode === "xml") && showSchema && (
        <div
          onMouseDown={handleSchemaResizeMouseDown}
          onDoubleClick={() => {
            setSchemaHeight(280);
            try {
              localStorage.setItem("fileditor_schema_panel_height", "280");
            } catch {}
          }}
          title={t("leftPane.resizeSchemaTooltip")}
          className={`splitter-bar h-1.5 w-full cursor-row-resize shrink-0 flex items-center justify-center transition-colors border-t border-hero-border ${
            isResizingSchema ? "bg-[var(--color-primary-accent)]" : "bg-hero-panel hover:bg-[var(--color-primary-accent)]/70"
          }`}
        >
          <div className="w-10 h-0.5 rounded-full bg-slate-600/80 pointer-events-none" />
        </div>
      )}

      {/* Collapsible & Resizable Schema-Editor Panel (JSON & XML) */}
      {(mode === "json" || mode === "xml") && (
        <div
          style={showSchema ? { height: `${schemaHeight}px` } : undefined}
          className={`flex flex-col shrink-0 ${showSchema ? "" : "h-9"} ${
            isResizingSchema ? "" : "transition-[height] duration-200"
          } border-b border-hero-border min-h-0`}
        >
        {/* Toggle bar for Schema */}
        <div
          onClick={() => setShowSchema(!showSchema)}
          className="h-9 bg-hero-panel px-4 flex items-center justify-between border-b border-hero-border cursor-pointer hover:bg-hero-hover select-none shrink-0 gap-2"
        >
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono flex items-center space-x-2 min-w-0 truncate">
            <span className="shrink-0">{mode === "json" ? "JSON Schema" : "XML Schema"}</span>
            {activeSchemaTab && (
              <span className="text-[10px] normal-case font-mono text-slate-400 bg-slate-900/80 border border-slate-800 px-1.5 py-0.5 rounded truncate max-w-[200px]">
                {activeSchemaTab.title}
              </span>
            )}
            {schemaString.trim() && isSchemaEnabled && (
              <span
                className="text-[10px] border px-1.5 py-0.5 rounded shrink-0"
                style={{
                  backgroundColor: "rgba(var(--color-primary-accent-rgb), 0.14)",
                  color: "var(--color-primary-accent)",
                  borderColor: "rgba(var(--color-primary-accent-rgb), 0.4)"
                }}
              >
                {t("leftPane.schemaActive")}
              </span>
            )}
            {schemaString.trim() && !isSchemaEnabled && (
              <span className="text-[10px] bg-slate-900 text-slate-500 border border-slate-800 px-1.5 py-0.5 rounded shrink-0">
                {t("leftPane.schemaDisabled")}
              </span>
            )}
          </span>
          
          <div className="flex items-center space-x-2.5 shrink-0">
            <div onClick={(e) => e.stopPropagation()} className="flex items-center">
              {mode === "json" ? (
                <Select
                  size="small"
                  value={jsonSchemaDialect}
                  onChange={(val) => setSchemaDialect(val as JsonSchemaDialect)}
                  className="w-56 sm:w-64 font-mono text-[11px]"
                  popupMatchSelectWidth={false}
                  options={[
                    { value: "auto", label: `Auto (${getJsonSchemaDialectLabel(detectedJsonDialect)})` },
                    { value: "draft-04", label: "Draft-04" },
                    { value: "draft-06", label: "Draft-06" },
                    { value: "draft-07", label: "Draft-07" },
                    { value: "2019-09", label: "Draft 2019-09" },
                    { value: "2020-12", label: "Draft 2020-12" },
                    { value: "jtd", label: "JTD (RFC 8927)" }
                  ]}
                />
              ) : (
                <Select
                  size="small"
                  value={xmlSchemaDialect}
                  onChange={(val) => setSchemaDialect(val as XmlSchemaDialect)}
                  className="w-56 sm:w-64 font-mono text-[11px]"
                  popupMatchSelectWidth={false}
                  options={[
                    { value: "auto", label: `Auto (${getXmlSchemaDialectLabel(detectedXmlDialect, schemaString)})` },
                    { value: "xsd", label: "XSD 1.0 / 1.1" },
                    { value: "dtd", label: "DTD" },
                    { value: "rng", label: "RelaxNG (.rng)" },
                    { value: "sch", label: "Schematron (.sch)" }
                  ]}
                />
              )}
            </div>
            <div onClick={(e) => e.stopPropagation()} className="flex items-center space-x-1.5">
              <span className="text-[10px] text-slate-500 font-mono select-none hidden sm:inline">{t("leftPane.schemaValidate")}</span>
              <Switch 
                size="small" 
                checked={isSchemaEnabled} 
                onChange={setSchemaEnabled} 
              />
            </div>
            <div className="text-slate-400 ml-1">
              {showSchema ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            </div>
          </div>
        </div>
        
        {/* Schema Monaco-Editor with its own tabs + Drag & Drop target */}
        {showSchema && (
          <div
            id="fileditor-schema-drop-zone"
            ref={schemaPanelRef}
            onDragOver={(e) => {
              if (e.dataTransfer?.types?.includes("Files")) {
                e.preventDefault();
                e.stopPropagation();
                setIsDraggingSchemaOver(true);
              }
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setIsDraggingSchemaOver(false);
              }
            }}
            onDrop={async (e) => {
              const files = e.dataTransfer?.files;
              if (files && files.length > 0) {
                e.preventDefault();
                e.stopPropagation();
                setIsDraggingSchemaOver(false);
                const file = files[0] as File & { path?: string };
                if (file.path) {
                  await openSchemaFile(file.path);
                  setSchemaEnabled(true);
                  message.success(t("leftPane.schemaLoadedSuccess", { name: file.name }));
                } else {
                  try {
                    const text = await file.text();
                    addSchemaTab(null, text);
                    setSchemaEnabled(true);
                    message.success(t("leftPane.schemaLoadedSuccess", { name: file.name }));
                  } catch {}
                }
              }
            }}
            className="flex-1 min-h-0 flex flex-col bg-hero-bg relative"
          >
            {isDraggingSchemaOver && (
              <div
                className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-2 backdrop-blur-sm border-2 border-dashed rounded pointer-events-none"
                style={{
                  backgroundColor: "rgba(9, 13, 22, 0.85)",
                  borderColor: "var(--color-primary-accent)"
                }}
              >
                <Upload size={22} style={{ color: "var(--color-primary-accent)" }} />
                <span className="text-xs font-mono font-semibold text-white px-4 text-center">
                  {t("leftPane.schemaDropHint")}
                </span>
              </div>
            )}

            <GlobalTabBar isSchema={true} />

            {/* Monaco Editor or Schema Welcome Dashboard */}
            {activeSchemaTabId ? (
              <div className="flex-1 min-h-0">
                <Editor
                  height="100%"
                  path={
                    mode === "json"
                      ? `inmemory://fileditor/schema/${activeSchemaTabId || "schema"}.json`
                      : `inmemory://fileditor/schema/${activeSchemaTabId || "schema"}.xml`
                  }
                  language={mode === "json" ? "json" : "xml"}
                  theme="hero-dark"
                  beforeMount={handleBeforeMount}
                  value={schemaString}
                  onChange={(value) => setSchemaString(value || "")}
                  onMount={(schemaEditor) => {
                    schemaEditor.onDidFocusEditorWidget(() => {
                      (window as any).__FILEDITOR_SCHEMA_FOCUSED__ = true;
                    });
                    schemaEditor.onDidBlurEditorWidget(() => {
                      (window as any).__FILEDITOR_SCHEMA_FOCUSED__ = false;
                    });
                    schemaEditor.onKeyDown((e: any) => {
                      const isCtrl = e.ctrlKey || e.metaKey;
                      const key = e.browserEvent.key.toLowerCase();
                      if (isCtrl && e.altKey && key === "s") {
                        e.preventDefault();
                        e.stopPropagation();
                        e.browserEvent.stopPropagation();
                        saveSchemaTab(null, null, true);
                      } else if (isCtrl && !e.shiftKey && key === "s") {
                        e.preventDefault();
                        e.stopPropagation();
                        e.browserEvent.stopPropagation();
                        saveSchemaTab();
                      }
                    });
                  }}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    fontFamily: "JetBrains Mono, monospace",
                    lineNumbers: "on",
                    tabSize: 2,
                    automaticLayout: true,
                    wordWrap: "on",
                    padding: { top: 8 },
                    mouseWheelZoom: true
                  }}
                />
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center bg-[#090d16] text-slate-400 p-4 select-none">
                <div className="max-w-md w-full text-center space-y-2">
                  <h3 className="text-xs font-bold text-white tracking-wide">
                    {mode === "json" ? t("leftPane.schemaJsonTitle") : t("leftPane.schemaXmlTitle")}
                  </h3>
                  <p className="text-[10px] text-slate-500">{t("leftPane.schemaEmptyPrompt")}</p>
                  <div className="flex justify-center space-x-2 pt-2">
                    <Button size="small" type="dashed" icon={<Plus size={11} />} onClick={() => addSchemaTab()} className="border-slate-850 bg-slate-950/20 text-[10px] text-slate-300">
                      {t("leftPane.schemaNew")}
                    </Button>
                    <Button size="small" type="dashed" icon={<FolderOpen size={11} />} onClick={handleOpenSchemaFile} className="border-slate-850 bg-slate-950/20 text-[10px] text-slate-300">
                      {t("leftPane.schemaOpen")}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {/* Validation Error Footer */}
      {(mode === "json" || mode === "xml") && (
        <div className={`shrink-0 transition-all duration-150 ${validationErrors.length > 0 ? "h-36" : "h-9"} border-t border-hero-border bg-hero-panel flex flex-col min-h-0`}>
        {/* Footer Header */}
        <div className={`h-9 px-4 flex items-center space-x-2 border-b border-hero-border select-none shrink-0 ${isValid ? "bg-emerald-950/20 text-emerald-400" : "bg-rose-950/20 text-rose-400"}`}>
          {isValid ? (
            <>
              <CheckCircle size={14} />
              <span className="text-xs font-semibold uppercase tracking-wider font-mono">{t("leftPane.noErrors")}</span>
            </>
          ) : (
            <>
              <AlertTriangle size={14} className="animate-pulse" />
              <span className="text-xs font-semibold uppercase tracking-wider font-mono">
                {t("leftPane.errorsFound", { count: validationErrors.length })}
              </span>
            </>
          )}
        </div>
        
        {/* Error list */}
        <div className="flex-1 overflow-y-auto px-4 py-2 font-mono text-xs space-y-1">
          {validationErrors.length === 0 ? (
            <div className="text-slate-500 italic py-1">
              {mode === "json" 
                ? t("leftPane.validJsonDoc")
                : t("leftPane.validXmlDoc")}
            </div>
          ) : (
            validationErrors.map((err, idx) => (
              <div key={idx} className="flex items-start space-x-2 py-0.5 border-b border-slate-800/40 last:border-0">
                <span className="text-rose-500 font-semibold shrink-0 select-none">[{err.path}]:</span>
                <span className="text-slate-300">{err.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
      )}
    </div>
  );
};

// Version 3.1