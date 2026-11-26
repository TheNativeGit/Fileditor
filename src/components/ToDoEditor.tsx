import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import { 
  Button, 
  Input, 
  Tooltip, 
  Dropdown, 
  Select, 
  Checkbox,
  message 
} from "antd";
import { 
  CheckSquare, 
  Square, 
  Star, 
  AlertCircle, 
  HelpCircle, 
  Lightbulb, 
  Plus, 
  Trash2, 
  ChevronRight, 
  ChevronDown,
  ChevronLeft, 
  Search, 
  Tag, 
  FileUp, 
  Bold, 
  Italic, 
  Underline, 
  Strikethrough, 
  Heading1, 
  Heading2, 
  Heading3, 
  Heading4, 
  Link as LinkIcon, 
  Edit2,
  Check,
  GripVertical,
  ChevronUp
} from "lucide-react";
import { useToDoStore, ToDoTask, PRESET_TAG_COLORS, getEffectiveTaskTags } from "../store/useToDoStore";
import { useFileStore, Tab } from "../store/useFileStore";
import { resolveLinkToTabOrPath } from "../utils/todoLinkParser";
import { openArbitraryFile } from "../utils/fileLinkOpener";
import { LinkInsertPopover } from "./LinkInsertPopover";
import { logger } from "../utils/logger";
import { useTranslation } from "../i18n";
import { invokeTauriSafe, isTauriEnv } from "../utils/tauriBridge";

interface PointerListDragSession {
  listId: string;
  initialIndex: number;
  currentIndex: number;
  startX: number;
  startY: number;
  lastClientX: number;
  lastClientY: number;
  grabOffsetInList: number;
  started: boolean;
}

export const ToDoEditor: React.FC = () => {
  const { t } = useTranslation();
  const {
    jsonTabs,
    activeJsonTabId,
    updateTabContent,
    updateTabTitle,
    accentTheme,
    todoHideCompleted
  } = useFileStore();
  const activeTab = jsonTabs.find(t => t.id === activeJsonTabId);

  const {
    lists,
    activeListId,
    hashtagColors,
    searchQuery,
    statusFilter,
    selectedTags,
    setActiveListId,
    createList,
    renameList,
    deleteList,
    reorderLists,
    pushHistoryState,
    addTask,
    updateTask,
    deleteTask,
    toggleTaskCompleted,
    toggleTaskIndicator,
    indentTask,
    outdentTask,
    setHashtagColor,
    setSearchQuery,
    setStatusFilter,
    toggleSelectTag,
    clearTagFilter
  } = useToDoStore();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editingTitleText, setEditingTitleText] = useState("");
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  // Active list title fixed header inline editing state
  const [isEditingActiveListTitle, setIsEditingActiveListTitle] = useState(false);
  const [activeListTitleText, setActiveListTitleText] = useState("");

  // Sidebar List Pointer Drag & Drop (FLIP Animation)
  const [draggedListId, setDraggedListId] = useState<string | null>(null);
  const listsContainerRef = useRef<HTMLDivElement>(null);
  const listNodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const listFlipSnapshotRef = useRef<Map<string, number>>(new Map());
  const listDragSessionRef = useRef<PointerListDragSession | null>(null);
  const suppressListClickRef = useRef<boolean>(false);
  const listsListRef = useRef<any[]>([]);
  const listScrollRafRef = useRef<number | null>(null);

  useEffect(() => {
    listsListRef.current = lists;
  }, [lists]);

  const startDragList = (listId: string, idx: number, clientX: number, clientY: number) => {
    const container = listsContainerRef.current;
    const el = listNodeRefs.current.get(listId);
    if (!container || !el) return;

    const containerRect = container.getBoundingClientRect();
    const grabOffsetInList = clientY - containerRect.top + container.scrollTop - el.offsetTop;

    listDragSessionRef.current = {
      listId,
      initialIndex: idx,
      currentIndex: idx,
      startX: clientX,
      startY: clientY,
      lastClientX: clientX,
      lastClientY: clientY,
      grabOffsetInList,
      started: false
    };
  };

  const applyDraggedListTransform = (session: PointerListDragSession) => {
    const container = listsContainerRef.current;
    const dragEl = listNodeRefs.current.get(session.listId);
    if (!container || !dragEl) return;

    const containerRect = container.getBoundingClientRect();
    const desiredTop = session.lastClientY - containerRect.top + container.scrollTop - session.grabOffsetInList;
    const dy = desiredTop - dragEl.offsetTop;

    dragEl.style.transition = "none";
    dragEl.style.transform = `translate3d(0, ${dy}px, 0) scale(1.02)`;
    dragEl.style.zIndex = "40";
  };

  const evaluateListSwapAtPointer = (session: PointerListDragSession) => {
    const container = listsContainerRef.current;
    const dragEl = listNodeRefs.current.get(session.listId);
    if (!container || !dragEl) return;

    const currentLists = useToDoStore.getState().lists;
    const currentIdx = currentLists.findIndex((l) => l.id === session.listId);
    if (currentIdx === -1) return;
    session.currentIndex = currentIdx;

    const dragRect = dragEl.getBoundingClientRect();
    const dragCenter = dragRect.top + dragRect.height * 0.5;

    let targetIdx = currentIdx;

    // Check downwards crossings
    for (let i = currentIdx + 1; i < currentLists.length; i++) {
      const neighbor = listNodeRefs.current.get(currentLists[i].id);
      if (!neighbor) break;
      const neighborRect = neighbor.getBoundingClientRect();
      const neighborMid = neighborRect.top + neighborRect.height * 0.5;
      if (dragCenter > neighborMid) {
        targetIdx = i;
      } else {
        break;
      }
    }

    // Check upwards crossings
    if (targetIdx === currentIdx) {
      for (let i = currentIdx - 1; i >= 0; i--) {
        const neighbor = listNodeRefs.current.get(currentLists[i].id);
        if (!neighbor) break;
        const neighborRect = neighbor.getBoundingClientRect();
        const neighborMid = neighborRect.top + neighborRect.height * 0.5;
        if (dragCenter < neighborMid) {
          targetIdx = i;
        } else {
          break;
        }
      }
    }

    if (targetIdx !== currentIdx) {
      const snapshot = new Map<string, number>();
      currentLists.forEach((l) => {
        if (l.id === session.listId) return;
        const el = listNodeRefs.current.get(l.id);
        if (el) {
          snapshot.set(l.id, el.getBoundingClientRect().top);
        }
      });
      listFlipSnapshotRef.current = snapshot;
      session.currentIndex = targetIdx;

      reorderLists(currentIdx, targetIdx, true);
    }
  };

  // FLIP animation for displaced lists gliding smoothly to make room
  useLayoutEffect(() => {
    const session = listDragSessionRef.current;
    if (session?.started) {
      applyDraggedListTransform(session);
    }

    const snapshot = listFlipSnapshotRef.current;
    if (snapshot.size === 0) return;
    listFlipSnapshotRef.current = new Map();

    const animationsToPlay: HTMLDivElement[] = [];

    snapshot.forEach((prevScreenTop, listId) => {
      const el = listNodeRefs.current.get(listId);
      if (!el) return;

      el.style.transition = "none";
      el.style.transform = "none";
      const newScreenTop = el.getBoundingClientRect().top;
      const deltaY = prevScreenTop - newScreenTop;

      if (Math.abs(deltaY) > 0.5) {
        el.style.transform = `translate3d(0, ${deltaY}px, 0) scale(0.98)`;
        animationsToPlay.push(el);
      }
    });

    if (animationsToPlay.length > 0) {
      void document.body.offsetHeight;
      requestAnimationFrame(() => {
        animationsToPlay.forEach((el) => {
          el.style.transition = "transform 240ms cubic-bezier(0.22, 1, 0.36, 1)";
          el.style.transform = "translate3d(0, 0, 0) scale(1)";
        });
      });
    }
  }, [lists]);

  // Global pointer handlers for 60/120fps smooth list dragging
  useEffect(() => {
    const stopListAutoScroll = () => {
      if (listScrollRafRef.current !== null) {
        cancelAnimationFrame(listScrollRafRef.current);
        listScrollRafRef.current = null;
      }
    };

    const startOrUpdateListAutoScroll = () => {
      if (listScrollRafRef.current !== null) return;
      const tick = () => {
        const session = listDragSessionRef.current;
        const container = listsContainerRef.current;
        if (!session || !session.started || !container) {
          listScrollRafRef.current = null;
          return;
        }
        const rect = container.getBoundingClientRect();
        const edgeZone = 28;
        let speed = 0;
        if (session.lastClientY < rect.top + edgeZone) {
          speed = -Math.ceil(((rect.top + edgeZone - session.lastClientY) / edgeZone) * 6);
        } else if (session.lastClientY > rect.bottom - edgeZone) {
          speed = Math.ceil(((session.lastClientY - (rect.bottom - edgeZone)) / edgeZone) * 6);
        }
        if (speed !== 0) {
          const prevScroll = container.scrollTop;
          container.scrollTop += speed;
          if (container.scrollTop !== prevScroll) {
            applyDraggedListTransform(session);
            evaluateListSwapAtPointer(session);
          }
          listScrollRafRef.current = requestAnimationFrame(tick);
        } else {
          listScrollRafRef.current = null;
        }
      };
      listScrollRafRef.current = requestAnimationFrame(tick);
    };

    const handleGlobalMouseMove = (e: MouseEvent) => {
      const session = listDragSessionRef.current;
      if (!session) return;

      session.lastClientX = e.clientX;
      session.lastClientY = e.clientY;

      if (!session.started) {
        const dist = Math.hypot(e.clientX - session.startX, e.clientY - session.startY);
        if (dist < 4) return;

        session.started = true;
        suppressListClickRef.current = true;
        setDraggedListId(session.listId);
      }

      applyDraggedListTransform(session);
      evaluateListSwapAtPointer(session);
      startOrUpdateListAutoScroll();
    };

    const handleGlobalMouseUp = () => {
      stopListAutoScroll();
      const session = listDragSessionRef.current;
      if (!session) return;
      const wasStarted = session.started;
      const hasReordered = session.currentIndex !== session.initialIndex;
      listDragSessionRef.current = null;

      if (!wasStarted) {
        return;
      }

      const dragEl = listNodeRefs.current.get(session.listId);
      if (dragEl) {
        dragEl.style.transition = "transform 200ms cubic-bezier(0.22, 1, 0.36, 1)";
        dragEl.style.transform = "translate3d(0, 0, 0) scale(1)";
        const cleanupEl = dragEl;
        setTimeout(() => {
          if (listDragSessionRef.current?.listId !== session.listId) {
            cleanupEl.style.transition = "";
            cleanupEl.style.transform = "";
            cleanupEl.style.zIndex = "";
          }
        }, 210);
      }

      setDraggedListId(null);
      if (hasReordered) {
        pushHistoryState();
      }
    };

    window.addEventListener("mousemove", handleGlobalMouseMove);
    window.addEventListener("mouseup", handleGlobalMouseUp);

    return () => {
      stopListAutoScroll();
      window.removeEventListener("mousemove", handleGlobalMouseMove);
      window.removeEventListener("mouseup", handleGlobalMouseUp);
    };
  }, [pushHistoryState]);

  // File title inline editing state
  const [isEditingFileTitle, setIsEditingFileTitle] = useState(false);
  const [fileTitleText, setFileTitleText] = useState("");

  // Link popover state
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<{ taskId: string; raw: string; label: string; targetPath: string } | null>(null);

  // Autocomplete state (#hashtag & [[wikilink)
  const [autocompleteTaskId, setAutocompleteTaskId] = useState<string | null>(null);
  const [autocompleteType, setAutocompleteType] = useState<"hashtag" | "wikilink" | null>(null);
  const [autocompleteQuery, setAutocompleteQuery] = useState("");
  const [autocompleteSelectedIndex, setAutocompleteSelectedIndex] = useState(0);

  const handleTaskPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>, taskId: string) => {
    const pastedText = e.clipboardData.getData("text");
    if (pastedText.includes("\n")) {
      e.preventDefault();
      const lines = pastedText.split(/\r?\n/).filter(l => l.trim().length > 0);
      if (lines.length > 0) {
        updateTask(taskId, { text: lines[0] });
        const currentList = lists.find(l => l.tasks.some(t => t.id === taskId)) || activeList;
        const currentTask = currentList?.tasks.find(t => t.id === taskId);
        let lastId = taskId;
        if (currentTask?.collapsed && currentList) {
          const taskIdx = currentList.tasks.findIndex(t => t.id === taskId);
          if (taskIdx !== -1) {
            lastId = findLastDescendant(currentList.tasks, taskIdx).id;
          }
        }
        for (let i = 1; i < lines.length; i++) {
          lastId = addTask(lastId, {
            indent: currentTask?.indent || 0,
            indicators: currentTask?.indicators?.includes("checkbox") ? ["checkbox"] : []
          });
          updateTask(lastId, { text: lines[i] });
        }
        setActiveTaskId(lastId);
        restoreFocus(lastId);
      }
    }
  };

  const handleTaskDrop = (e: React.DragEvent<HTMLTextAreaElement>, taskId: string) => {
    const droppedText = e.dataTransfer.getData("text");
    if (droppedText) {
      e.preventDefault();
      updateTask(taskId, { text: droppedText });
    }
  };

  // Synchronize active .todo tab content with useToDoStore on tab switch or store change
  useEffect(() => {
    if (!activeTab || (activeTab.type !== "todo" && !activeTab.id.startsWith("todo_"))) return;
    if (!activeTab.content) return;

    try {
      const parsed = JSON.parse(activeTab.content);
      if (parsed && Array.isArray(parsed.lists) && parsed.lists.length > 0) {
        useToDoStore.getState().initFileHistory(activeTab.id, parsed.lists);
        useToDoStore.setState({
          lists: parsed.lists,
          activeListId: parsed.activeListId && parsed.lists.some((l: any) => l.id === parsed.activeListId) ? parsed.activeListId : parsed.lists[0].id,
          hashtagColors: parsed.hashtagColors || {}
        });
      }
    } catch (e) {
      // If content is not JSON yet, ignore
    }
  }, [activeTab?.id]);

  // Keep active tab content in useFileStore updated whenever lists or activeListId changes
  useEffect(() => {
    if (!activeTab || (activeTab.type !== "todo" && !activeTab.id.startsWith("todo_"))) return;
    const documentData = {
      fileTitle: activeTab.title.replace(/\.todo$/i, ""),
      activeListId,
      lists,
      hashtagColors
    };
    const jsonStr = JSON.stringify(documentData, null, 2);
    if (jsonStr !== activeTab.content) {
      updateTabContent(activeTab.id, jsonStr);
    }
  }, [lists, activeListId, hashtagColors, activeTab?.id]);

  const activeList = lists.find(l => l.id === activeListId) || lists[0];
  const activeTask = activeList ? activeList.tasks.find(t => t.id === activeTaskId) || null : null;
  const fileTitle = activeTab ? activeTab.title.replace(/\.todo$/i, "") : t("todo.title");

  // Search All Lists state
  const [searchAllLists, setSearchAllLists] = useState(false);
  const [showJumpUp, setShowJumpUp] = useState(false);
  const taskListScrollRef = useRef<HTMLDivElement>(null);

  // Smooth 2-line mouse wheel scrolling inside multi-line task textareas
  useEffect(() => {
    if (!activeTaskId) return;
    const el = document.getElementById(`todo_input_${activeTaskId}`);
    if (!(el instanceof HTMLTextAreaElement)) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;

      const maxScrollTop = el.scrollHeight - el.clientHeight;
      if (maxScrollTop <= 1) return;

      const goingDown = e.deltaY > 0;
      const atTop = el.scrollTop <= 0;
      const atBottom = el.scrollTop >= maxScrollTop - 1;
      if ((goingDown && atBottom) || (!goingDown && atTop)) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      const computed = window.getComputedStyle(el);
      const parsedLineHeight = parseFloat(computed.lineHeight);
      const fontSize = parseFloat(computed.fontSize) || 13;
      const lineHeightPx = Number.isFinite(parsedLineHeight) ? parsedLineHeight : fontSize * 1.45;
      const twoLinesPx = lineHeightPx * 2;

      let deltaPx: number;
      if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) {
        deltaPx = Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 2) * lineHeightPx;
      } else if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
        deltaPx = Math.sign(e.deltaY) * twoLinesPx;
      } else {
        deltaPx = Math.abs(e.deltaY) >= 40
          ? Math.sign(e.deltaY) * twoLinesPx
          : Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), twoLinesPx);
      }

      el.scrollTop = Math.max(0, Math.min(maxScrollTop, el.scrollTop + deltaPx));
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", handleWheel);
    };
  }, [activeTaskId]);

  const hideCompleted = todoHideCompleted && statusFilter !== "completed";

  const toggleTaskCollapse = (taskId: string) => {
    const task = activeList?.tasks.find(t => t.id === taskId);
    if (!task) return;
    updateTask(taskId, { collapsed: !task.collapsed });
  };

  const isParentTask = (tasks: ToDoTask[], index: number): boolean => {
    const current = tasks[index];
    if (!current) return false;
    if (index + 1 < tasks.length) {
      return tasks[index + 1].indent > current.indent;
    }
    return false;
  };

  const findLastDescendant = (tasks: ToDoTask[], taskIdx: number): ToDoTask => {
    const parentTask = tasks[taskIdx];
    if (!parentTask) return parentTask;
    let lastDescendantIdx = taskIdx;
    for (let i = taskIdx + 1; i < tasks.length; i++) {
      if ((tasks[i].indent || 0) > (parentTask.indent || 0)) {
        lastDescendantIdx = i;
      } else {
        break;
      }
    }
    return tasks[lastDescendantIdx];
  };

  const isTaskCollapsed = (tasks: ToDoTask[], index: number): boolean => {
    const current = tasks[index];
    if (!current) return false;
    let minIndent = current.indent;
    for (let j = index - 1; j >= 0; j--) {
      const prev = tasks[j];
      if (prev.indent < minIndent) {
        if (prev.collapsed) {
          return true;
        }
        minIndent = prev.indent;
      }
    }
    return false;
  };

  // Collect all unique hashtags across all tasks
  const allHashtags = Array.from(
    new Set(
      lists.flatMap(l => l.tasks.flatMap(t => t.tags))
    )
  ).map(tag => tag.toUpperCase());

  // Sourced tasks (either active list or all lists in document)
  const sourceTasks = React.useMemo(() => {
    if (searchAllLists) {
      return lists.flatMap(l => l.tasks);
    }
    return activeList ? activeList.tasks : [];
  }, [searchAllLists, lists, activeList]);

  // Filter tasks based on search, status, and tag chips
  const filteredTasks = React.useMemo(() => {
    return sourceTasks.filter(task => {
      if (statusFilter === "open" && task.completed) return false;
      if (statusFilter === "completed" && !task.completed) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!task.text.toLowerCase().includes(q)) return false;
      }

      if (selectedTags.length > 0) {
        const listForTask = lists.find(l => l.tasks.some(t => t.id === task.id)) || activeList;
        const effectiveTags = getEffectiveTaskTags(task, listForTask.tasks);
        const hasAllTags = selectedTags.every(st => effectiveTags.includes(st.toUpperCase()));
        if (!hasAllTags) return false;
      }

      return true;
    });
  }, [sourceTasks, statusFilter, searchQuery, selectedTags, lists, activeList]);

  // Visible tasks: strictly non-collapsed and non-hidden tasks
  const visibleTasks = React.useMemo(() => {
    return filteredTasks.filter((task, idx) => {
      if (isTaskCollapsed(filteredTasks, idx)) return false;
      if (hideCompleted && task.completed) return false;
      return true;
    });
  }, [filteredTasks, hideCompleted]);

  // Summary counts
  const totalCount = activeList ? activeList.tasks.length : 0;
  const completedCount = activeList ? activeList.tasks.filter(t => t.completed).length : 0;
  const openCount = totalCount - completedCount;

  // Autocomplete Suggestions (#hashtag & [[wikilink)
  const autocompleteSuggestions = React.useMemo(() => {
    if (!autocompleteType) return [];

    if (autocompleteType === "hashtag") {
      if (!autocompleteQuery) return allHashtags;
      return allHashtags.filter(tag => tag.toUpperCase().includes(autocompleteQuery));
    } else if (autocompleteType === "wikilink") {
      const q = autocompleteQuery;
      return jsonTabs
        .map(t => t.path || t.title)
        .filter(name => name.toLowerCase().includes(q));
    }

    return [];
  }, [autocompleteType, autocompleteQuery, allHashtags, jsonTabs]);

  const applyAutocompleteItem = (taskId: string, selectedValue: string) => {
    const task = activeList?.tasks.find(t => t.id === taskId);
    if (!task) return;

    if (autocompleteType === "hashtag") {
      const cleanValue = selectedValue.startsWith("#") ? selectedValue : `#${selectedValue}`;
      const newText = task.text.replace(/#([a-zA-Z0-9_äöüÄÖÜß]*)$/, `${cleanValue} `);
      updateTask(taskId, { text: newText });
    } else if (autocompleteType === "wikilink") {
      const newText = task.text.replace(/\[\[([^\]]*)$/, `[${selectedValue}](${selectedValue}) `);
      updateTask(taskId, { text: newText });
    }

    setAutocompleteTaskId(null);
    setAutocompleteType(null);
    restoreFocus(taskId);
  };

  // Handle task text change & hashtag/wikilink auto-complete triggers
  const handleTaskTextChange = (taskId: string, newText: string) => {
    const hashtagMatch = newText.match(/#([a-zA-Z0-9_äöüÄÖÜß]{1,})$/);
    const wikiMatch = newText.match(/\[\[([^\]]*)$/);

    if (hashtagMatch) {
      setAutocompleteTaskId(taskId);
      setAutocompleteType("hashtag");
      setAutocompleteQuery(hashtagMatch[1].toUpperCase());
      setAutocompleteSelectedIndex(0);
    } else if (wikiMatch) {
      setAutocompleteTaskId(taskId);
      setAutocompleteType("wikilink");
      setAutocompleteQuery(wikiMatch[1].toLowerCase());
      setAutocompleteSelectedIndex(0);
    } else {
      setAutocompleteTaskId(null);
      setAutocompleteType(null);
    }

    let formattedText = newText.replace(/#([a-zA-Z0-9_äöüÄÖÜß]+)(\s)/g, (match, tagContent, space) => {
      const upperTag = `#${tagContent.toUpperCase()}`;
      return `${upperTag}${space}`;
    });

    updateTask(taskId, { text: formattedText });
  };

  const restoreFocus = (taskId?: string) => {
    const idToFocus = taskId || activeTaskId;
    if (!idToFocus) return;
    setTimeout(() => {
      const el = document.getElementById(`todo_input_${idToFocus}`);
      if (el) el.focus();
    }, 20);
  };

  // Keyboard navigation & smart Enter & Backspace cursor focus jump
  const handleTaskKeyDown = (e: React.KeyboardEvent, task: ToDoTask) => {
    // Autocomplete Keyboard Navigation (ArrowUp, ArrowDown, Enter, Esc)
    if (autocompleteTaskId === task.id && autocompleteSuggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setAutocompleteSelectedIndex(prev => (prev + 1) % autocompleteSuggestions.length);
        return;
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setAutocompleteSelectedIndex(prev => (prev - 1 + autocompleteSuggestions.length) % autocompleteSuggestions.length);
        return;
      } else if (e.key === "Enter") {
        e.preventDefault();
        const selected = autocompleteSuggestions[autocompleteSelectedIndex || 0];
        if (selected) {
          applyAutocompleteItem(task.id, selected);
        }
        return;
      } else if (e.key === "Escape") {
        e.preventDefault();
        setAutocompleteTaskId(null);
        setAutocompleteType(null);
        return;
      }
    }
    // Keyboard Shortcuts: Alt+C, Alt+W, Alt+K, Alt+F, Alt+I
    if (e.altKey && !e.ctrlKey && !e.shiftKey) {
      const keyUpper = e.key.toUpperCase();
      if (keyUpper === "C") {
        e.preventDefault();
        const hasCb = task.indicators.includes("checkbox");
        if (!hasCb) {
          updateTask(task.id, { indicators: [...task.indicators, "checkbox"], completed: false });
        } else if (!task.completed) {
          updateTask(task.id, { completed: true });
        } else {
          updateTask(task.id, { indicators: task.indicators.filter(i => i !== "checkbox"), completed: false });
        }
        restoreFocus(task.id);
        return;
      } else if (keyUpper === "W") {
        e.preventDefault();
        toggleTaskIndicator(task.id, "star");
        restoreFocus(task.id);
        return;
      } else if (keyUpper === "K") {
        e.preventDefault();
        toggleTaskIndicator(task.id, "exclamation");
        restoreFocus(task.id);
        return;
      } else if (keyUpper === "F") {
        e.preventDefault();
        toggleTaskIndicator(task.id, "question");
        restoreFocus(task.id);
        return;
      } else if (keyUpper === "I") {
        e.preventDefault();
        toggleTaskIndicator(task.id, "lightbulb");
        restoreFocus(task.id);
        return;
      }
    }

    // Keyboard Shortcuts: Ctrl+B, Ctrl+I, Ctrl+U
    if (e.ctrlKey && !e.altKey) {
      const keyUpper = e.key.toUpperCase();
      if (keyUpper === "B") {
        e.preventDefault();
        toggleFormattingFlag("bold");
        restoreFocus(task.id);
        return;
      } else if (keyUpper === "I") {
        e.preventDefault();
        toggleFormattingFlag("italic");
        restoreFocus(task.id);
        return;
      } else if (keyUpper === "U") {
        e.preventDefault();
        toggleFormattingFlag("underline");
        restoreFocus(task.id);
        return;
      }
    }

    // Shift + Delete or Shift + Backspace: Instantly delete row and jump up (Ctrl+Z restores)
    if (e.shiftKey && (e.key === "Backspace" || e.key === "Delete")) {
      e.preventDefault();
      const currentVisibleIdx = visibleTasks.findIndex(t => t.id === task.id);
      const prevVisibleTask = currentVisibleIdx > 0 ? visibleTasks[currentVisibleIdx - 1] : null;
      if (prevVisibleTask) {
        setActiveTaskId(prevVisibleTask.id);
        deleteTask(task.id);
        setTimeout(() => {
          const prevInput = document.getElementById(`todo_input_${prevVisibleTask.id}`) as HTMLInputElement | HTMLTextAreaElement | null;
          if (prevInput) {
            prevInput.focus();
            try {
              const length = prevInput.value.length;
              prevInput.setSelectionRange(length, length);
            } catch (err) {}
          }
        }, 50);
      } else {
        deleteTask(task.id);
      }
      return;
    }

    // ToDo Undo / Redo
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      useToDoStore.getState().undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
      e.preventDefault();
      e.stopPropagation();
      useToDoStore.getState().redo();
      return;
    }

    if (e.key === "ArrowUp") {
      const target = e.target as HTMLTextAreaElement;
      if (target) {
        const caretPos = target.selectionStart ?? 0;
        const textBeforeCaret = target.value.substring(0, caretPos);
        const isOnFirstLine = !textBeforeCaret.includes("\n");

        if (isOnFirstLine) {
          const currentVisibleIdx = visibleTasks.findIndex(t => t.id === task.id);
          if (currentVisibleIdx > 0) {
            e.preventDefault();
            const prevTask = visibleTasks[currentVisibleIdx - 1];
            setActiveTaskId(prevTask.id);
            setTimeout(() => {
              const prevInput = document.getElementById(`todo_input_${prevTask.id}`) as HTMLTextAreaElement | null;
              if (prevInput) {
                prevInput.focus();
                try {
                  const len = prevInput.value.length;
                  prevInput.setSelectionRange(len, len);
                } catch (err) {}
              }
            }, 30);
          }
        }
      }
    } else if (e.key === "ArrowDown") {
      const target = e.target as HTMLTextAreaElement;
      if (target) {
        const caretPos = target.selectionStart ?? target.value.length;
        const textAfterCaret = target.value.substring(caretPos);
        const isOnLastLine = !textAfterCaret.includes("\n");

        if (isOnLastLine) {
          const currentVisibleIdx = visibleTasks.findIndex(t => t.id === task.id);
          if (currentVisibleIdx >= 0 && currentVisibleIdx < visibleTasks.length - 1) {
            e.preventDefault();
            const nextTask = visibleTasks[currentVisibleIdx + 1];
            setActiveTaskId(nextTask.id);
            setTimeout(() => {
              const nextInput = document.getElementById(`todo_input_${nextTask.id}`) as HTMLTextAreaElement | null;
              if (nextInput) {
                nextInput.focus();
                try {
                  nextInput.setSelectionRange(0, 0);
                } catch (err) {}
              }
            }, 30);
          }
        }
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const hasCheckbox = task.indicators.includes("checkbox");
      if (task.text.trim() === "" && hasCheckbox) {
        // If line is empty with a checkbox, remove checkbox first!
        updateTask(task.id, { indicators: task.indicators.filter(i => i !== "checkbox") });
        restoreFocus(task.id);
        return;
      }

      const target = e.target as HTMLTextAreaElement;
      const caretPos = target ? (target.selectionStart ?? task.text.length) : task.text.length;
      const textBefore = task.text.substring(0, caretPos);
      const textAfter = task.text.substring(caretPos);

      // Update current task text to textBefore
      updateTask(task.id, { text: textBefore });

      // Determine where to insert the new task:
      // When the parent is collapsed, skip over all its hidden children and insert after the last descendant.
      // When the parent is expanded, insert immediately below it as before.
      const currentList = lists.find(l => l.tasks.some(t => t.id === task.id)) || activeList;
      let afterTaskId = task.id;
      if (task.collapsed && currentList) {
        const taskIdx = currentList.tasks.findIndex(t => t.id === task.id);
        if (taskIdx !== -1) {
          afterTaskId = findLastDescendant(currentList.tasks, taskIdx).id;
        }
      }

      // Add new task below current task (or below all its children if collapsed) with textAfter
      const newId = addTask(afterTaskId, {
        indent: task.indent,
        indicators: hasCheckbox ? ["checkbox"] : []
      });
      updateTask(newId, { text: textAfter });
      setActiveTaskId(newId);

      setTimeout(() => {
        const nextInput = document.getElementById(`todo_input_${newId}`) as HTMLTextAreaElement | null;
        if (nextInput) {
          nextInput.focus();
          try {
            nextInput.setSelectionRange(0, 0);
          } catch (err) {}
        }
      }, 50);
    } else if ((e.key === "Backspace" || e.key === "Delete") && task.text === "") {
      e.preventDefault();
      const hasCheckbox = task.indicators.includes("checkbox");

      // 1. Remove checkbox first if present
      if (hasCheckbox) {
        updateTask(task.id, { indicators: task.indicators.filter(i => i !== "checkbox") });
        restoreFocus(task.id);
        return;
      }

      // 2. Outdent 1 tab level per press if indented
      if (task.indent > 0) {
        outdentTask(task.id);
        restoreFocus(task.id);
        return;
      }

      // 3. If line is empty with no checkbox and indent === 0, delete task row and jump up to the visible row above
      const currentVisibleIdx = visibleTasks.findIndex(t => t.id === task.id);
      const prevVisibleTask = currentVisibleIdx > 0 ? visibleTasks[currentVisibleIdx - 1] : null;
      if (prevVisibleTask) {
        setActiveTaskId(prevVisibleTask.id);
        deleteTask(task.id);
        setTimeout(() => {
          const prevInput = document.getElementById(`todo_input_${prevVisibleTask.id}`) as HTMLInputElement | HTMLTextAreaElement | null;
          if (prevInput) {
            prevInput.focus();
            try {
              const length = prevInput.value.length;
              prevInput.setSelectionRange(length, length);
            } catch (err) {}
          }
        }, 50);
      } else {
        deleteTask(task.id);
      }
    } else if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) {
        outdentTask(task.id);
      } else {
        indentTask(task.id);
      }
      restoreFocus(task.id);
    }
  };

  // Formatting Action Helpers for active task
  const applyFormatting = (patch: Partial<ToDoTask['formatting']>) => {
    if (!activeTask) {
      message.info(t("todo.selectRowFirst"));
      return;
    }
    const current = activeTask.formatting || {};
    updateTask(activeTask.id, {
      formatting: { ...current, ...patch }
    });
    restoreFocus(activeTask.id);
  };

  const toggleFormattingFlag = (flag: 'bold' | 'italic' | 'underline' | 'strikethrough') => {
    if (!activeTask) {
      message.info(t("todo.selectRowFirst"));
      return;
    }
    const current = activeTask.formatting || {};
    applyFormatting({ [flag]: !current[flag] });
  };

  const handleInsertLink = (label: string, urlOrPath: string) => {
    if (editingLink) {
      const task = activeList?.tasks.find(t => t.id === editingLink.taskId) || activeTask;
      if (task) {
        const markdownLink = `[${label}](${urlOrPath})`;
        const updatedText = task.text.replace(editingLink.raw, markdownLink);
        updateTask(task.id, { text: updatedText });
        message.success(t("todo.linkUpdated", { label }));
      }
      setEditingLink(null);
      return;
    }

    if (!activeTask) {
      message.info(t("todo.selectRowFirst"));
      return;
    }
    const markdownLink = `[${label}](${urlOrPath})`;
    const updatedText = activeTask.text ? `${activeTask.text} ${markdownLink}` : markdownLink;
    updateTask(activeTask.id, { text: updatedText });
    message.success(t("todo.linkInserted"));
    restoreFocus(activeTask.id);
  };

  const handleOpenLinkTarget = async (
    link: { label: string; targetPath: string },
    activeTabPath?: string | null
  ) => {
    logger.info("ToDoEditor", `handleOpenLinkTarget called: label="${link.label}", targetPath="${link.targetPath}", activeTabPath="${activeTabPath}"`);
    
    const { jsonTabs: currentTabs, setActiveJsonTab: switchTab, openJsonFile: openFile } = useFileStore.getState();

    const { tabId, cleanPath, isWebUrl } = resolveLinkToTabOrPath(
      link.targetPath,
      currentTabs,
      activeTabPath
    );

    if (isWebUrl) {
      if (isTauriEnv()) {
        await invokeTauriSafe("open_external_url", { url: cleanPath });
      } else {
        window.open(cleanPath, "_blank", "noopener,noreferrer");
      }
      message.success(t("markdown.linkOpened", { url: cleanPath }));
      return;
    }

    if (tabId) {
      logger.info("ToDoEditor", `Switching active tab to tabId="${tabId}"`);
      switchTab(tabId);
      return;
    }

    if (cleanPath) {
      logger.info("ToDoEditor", `Opening file from disk path="${cleanPath}"`);
      const existsOnDisk = Boolean(await invokeTauriSafe<boolean>("file_exists", { path: cleanPath }));
      if (existsOnDisk) {
        await openArbitraryFile(cleanPath, openFile);
      } else {
        message.error(t("fileLink.notFound", { path: cleanPath }));
      }
    }
  };

  /**
   * Renders the content of a ToDo task in display mode.
   * Replaces raw `[Label](path)` Markdown links with elegant interactive hyperlink chips,
   * displaying only the label while hiding the raw path syntax.
   *
   * @param text - Der Text der Aufgabe.
   * @param openTabs - Alle aktuell im FileStore geöffneten Tabs.
   * @param activeTabPath - Der Pfad der aktiven ToDo-Datei für Relativpfad-Auflösung.
   * @param onOpenLink - Callback beim Strg+Klick zum Öffnen des Ziels.
   * @param onEditLink - Callback beim Klick zum Bearbeiten des Links.
   * @returns Das formatierte React-Element mit Hyperlinks.
   */
  const renderInlineTokens = (segment: string, keyPrefix: string) => {
    // Highlight #HASHTAGS and `inline code` inside plain text segments
    const tokenRegex = /(`[^`]+`|#[a-zA-Z0-9_äöüÄÖÜß]+)/g;
    const nodes: React.ReactNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;

    while ((m = tokenRegex.exec(segment)) !== null) {
      if (m.index > last) {
        nodes.push(
          <span key={`${keyPrefix}_t_${last}`} className="whitespace-pre-wrap">
            {segment.slice(last, m.index)}
          </span>
        );
      }
      const tok = m[0];
      if (tok.startsWith("`") && tok.endsWith("`") && tok.length >= 2) {
        nodes.push(
          <code
            key={`${keyPrefix}_c_${m.index}`}
            style={{ color: "var(--color-preview-inline-code, #fb7185)" }}
            className="px-1 py-0.5 rounded bg-slate-900/90 border border-slate-800 font-mono text-[0.9em]"
          >
            {tok.slice(1, -1)}
          </code>
        );
      } else {
        const upper = tok.toUpperCase();
        const tagCol = hashtagColors[upper] || accentTheme.primaryAccent;
        nodes.push(
          <span
            key={`${keyPrefix}_h_${m.index}`}
            style={{
              color: tagCol,
              backgroundColor: `${tagCol}1f`,
              borderColor: `${tagCol}55`
            }}
            className="inline-block px-1.5 py-0 rounded-full border font-mono text-[0.85em] font-semibold leading-snug align-baseline"
          >
            {tok}
          </span>
        );
      }
      last = tokenRegex.lastIndex;
    }

    if (last < segment.length) {
      nodes.push(
        <span key={`${keyPrefix}_end`} className="whitespace-pre-wrap">
          {segment.slice(last)}
        </span>
      );
    }
    return nodes;
  };

  const renderFormattedTaskContent = (
    text: string,
    openTabs: Tab[],
    activeTabPath: string | null | undefined,
    onOpenLink: (link: { label: string; targetPath: string }) => void,
    onEditLink: (link: { raw: string; label: string; targetPath: string }) => void
  ) => {
    if (!text) return <span className="text-slate-600 italic">{t("todo.emptyRow")}</span>;

    const mdLinkRegex = /\[([^\]]+)\]\(((?:[^()]+|\([^()]*\))+)\)/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = mdLinkRegex.exec(text)) !== null) {
      const plainSegment = text.substring(lastIndex, match.index);
      if (plainSegment) {
        parts.push(...renderInlineTokens(plainSegment, `seg_${lastIndex}`));
      }

      const label = match[1];
      const targetPath = match[2];
      const raw = match[0];

      const { isSupported } = resolveLinkToTabOrPath(targetPath, openTabs, activeTabPath);

      parts.push(
        <span
          key={`link_${match.index}`}
          onMouseDown={(e) => {
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault();
              e.stopPropagation();
              onOpenLink({ label, targetPath });
            }
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.ctrlKey || e.metaKey) {
              onOpenLink({ label, targetPath });
            } else {
              onEditLink({ raw, label, targetPath });
            }
          }}
          style={
            isSupported
              ? {
                  backgroundColor: "rgba(var(--color-primary-accent-rgb, 168, 85, 247), 0.16)",
                  borderColor: "rgba(var(--color-primary-accent-rgb, 168, 85, 247), 0.55)",
                  color: "var(--color-preview-link, #c084fc)"
                }
              : undefined
          }
          className={`todo-link-button inline-flex items-center gap-1 mx-1 px-1.5 py-0.5 rounded text-xs font-mono border transition-all cursor-pointer select-none ${
            isSupported
              ? "hover:brightness-110"
              : "bg-rose-950/60 border-rose-700/80 text-rose-200 hover:bg-rose-900/80"
          }`}
          title={t("todo.linkTooltip", { path: targetPath })}
        >
          <LinkIcon
            size={11}
            className={isSupported ? "" : "text-rose-400"}
            style={isSupported ? { color: "var(--color-primary-accent, #a855f7)" } : undefined}
          />
          <span className="font-semibold underline underline-offset-2">{label}</span>
        </span>
      );

      lastIndex = mdLinkRegex.lastIndex;
    }

    const remainingText = text.substring(lastIndex);
    if (remainingText) {
      parts.push(...renderInlineTokens(remainingText, `rem_${lastIndex}`));
    }

    return <span className="whitespace-pre-wrap break-words">{parts}</span>;
  };
  const handleExport = async () => {
    if (!activeTab) return;
    const baseName = activeTab.title.replace(/\.(todo|todo\.json)$/i, "");
    const selectedPath = await invokeTauriSafe<string | null>("save_file_dialog", {
      title: t("todo.exportTodo"),
      defaultName: `${baseName}_export.todo`,
      filterName: "ToDo (*.todo)",
      filterExt: "todo"
    });

    if (selectedPath) {
      await invokeTauriSafe("write_file", { path: selectedPath, content: activeTab.content });
      message.success(t("todo.exportedSuccess", { path: selectedPath }));
    }
  };

  // Inline rename file title handler
  const handleSaveFileTitle = () => {
    if (fileTitleText.trim() && activeTab) {
      const cleanName = fileTitleText.trim();
      const fullTitle = cleanName.endsWith(".todo") ? cleanName : `${cleanName}.todo`;
      updateTabTitle(activeTab.id, fullTitle);
    }
    setIsEditingFileTitle(false);
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#090d16] text-slate-200 select-none overflow-hidden font-sans">
      {/* 1. Dedicated Rich Text Formatting Toolbar */}
      <div className="h-10 bg-[#0e1624] border-b border-slate-800/80 px-3 flex items-center justify-between shrink-0 font-sans">
        <div className="flex items-center space-x-1.5 overflow-x-auto scrollbar-none">
          <Button
            type="text"
            size="small"
            icon={sidebarOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-slate-400 hover:text-white shrink-0"
            title={sidebarOpen ? t("todo.collapseSidebar") : t("todo.expandSidebar")}
          />
          <div className="h-4 w-[1px] bg-slate-800 shrink-0" />

          {/* Heading level options */}
          <Tooltip title={t("editor.h1")}>
            <Button
              type="text"
              size="small"
              icon={
                <Heading1
                  size={14}
                  className={activeTask?.formatting?.headingLevel === 1 ? "" : "text-slate-400"}
                  style={activeTask?.formatting?.headingLevel === 1 ? { color: "var(--color-primary-accent)" } : undefined}
                />
              }
              onClick={() => applyFormatting({ headingLevel: activeTask?.formatting?.headingLevel === 1 ? 0 : 1 })}
              className={`h-7 w-7 p-0 hover:bg-slate-800 ${activeTask?.formatting?.headingLevel === 1 ? "bg-slate-800/80" : ""}`}
            />
          </Tooltip>
          <Tooltip title={t("editor.h2")}>
            <Button
              type="text"
              size="small"
              icon={
                <Heading2
                  size={14}
                  className={activeTask?.formatting?.headingLevel === 2 ? "" : "text-slate-400"}
                  style={activeTask?.formatting?.headingLevel === 2 ? { color: "var(--color-primary-accent)" } : undefined}
                />
              }
              onClick={() => applyFormatting({ headingLevel: activeTask?.formatting?.headingLevel === 2 ? 0 : 2 })}
              className={`h-7 w-7 p-0 hover:bg-slate-800 ${activeTask?.formatting?.headingLevel === 2 ? "bg-slate-800/80" : ""}`}
            />
          </Tooltip>
          <Tooltip title={t("editor.h3")}>
            <Button
              type="text"
              size="small"
              icon={
                <Heading3
                  size={14}
                  className={activeTask?.formatting?.headingLevel === 3 ? "" : "text-slate-400"}
                  style={activeTask?.formatting?.headingLevel === 3 ? { color: "var(--color-primary-accent)" } : undefined}
                />
              }
              onClick={() => applyFormatting({ headingLevel: activeTask?.formatting?.headingLevel === 3 ? 0 : 3 })}
              className={`h-7 w-7 p-0 hover:bg-slate-800 ${activeTask?.formatting?.headingLevel === 3 ? "bg-slate-800/80" : ""}`}
            />
          </Tooltip>
          <Tooltip title="H4">
            <Button
              type="text"
              size="small"
              icon={
                <Heading4
                  size={14}
                  className={activeTask?.formatting?.headingLevel === 4 ? "" : "text-slate-400"}
                  style={activeTask?.formatting?.headingLevel === 4 ? { color: "var(--color-primary-accent)" } : undefined}
                />
              }
              onClick={() => applyFormatting({ headingLevel: activeTask?.formatting?.headingLevel === 4 ? 0 : 4 })}
              className={`h-7 w-7 p-0 hover:bg-slate-800 ${activeTask?.formatting?.headingLevel === 4 ? "bg-slate-800/80" : ""}`}
            />
          </Tooltip>

          <div className="h-4 w-[1px] bg-slate-800 shrink-0" />

          {/* Text formatting: Bold, Italic, Underline, Strikethrough */}
          <Tooltip title={t("editor.bold")}>
            <Button
              type="text"
              size="small"
              icon={<Bold size={13} className={activeTask?.formatting?.bold ? "text-emerald-400" : "text-slate-400"} />}
              onClick={() => toggleFormattingFlag('bold')}
              className={`h-7 w-7 p-0 hover:bg-slate-800 ${activeTask?.formatting?.bold ? "bg-slate-800/80" : ""}`}
            />
          </Tooltip>
          <Tooltip title={t("editor.italic")}>
            <Button
              type="text"
              size="small"
              icon={<Italic size={13} className={activeTask?.formatting?.italic ? "text-emerald-400" : "text-slate-400"} />}
              onClick={() => toggleFormattingFlag('italic')}
              className={`h-7 w-7 p-0 hover:bg-slate-800 ${activeTask?.formatting?.italic ? "bg-slate-800/80" : ""}`}
            />
          </Tooltip>
          <Tooltip title={t("editor.underline")}>
            <Button
              type="text"
              size="small"
              icon={<Underline size={13} className={activeTask?.formatting?.underline ? "text-emerald-400" : "text-slate-400"} />}
              onClick={() => toggleFormattingFlag('underline')}
              className={`h-7 w-7 p-0 hover:bg-slate-800 ${activeTask?.formatting?.underline ? "bg-slate-800/80" : ""}`}
            />
          </Tooltip>
          <Tooltip title={t("editor.strikethrough")}>
            <Button
              type="text"
              size="small"
              icon={<Strikethrough size={13} className={activeTask?.formatting?.strikethrough ? "text-emerald-400" : "text-slate-400"} />}
              onClick={() => toggleFormattingFlag('strikethrough')}
              className={`h-7 w-7 p-0 hover:bg-slate-800 ${activeTask?.formatting?.strikethrough ? "bg-slate-800/80" : ""}`}
            />
          </Tooltip>

          <div className="h-4 w-[1px] bg-slate-800 shrink-0" />

          {/* Schriftgröße dropdown */}
          <Select
            size="small"
            value={activeTask?.formatting?.fontSize || 13}
            onChange={(val) => applyFormatting({ fontSize: val })}
            className="w-20 font-mono text-xs"
            options={[
              { value: 11, label: "11px" },
              { value: 13, label: "13px" },
              { value: 16, label: "16px" },
              { value: 20, label: "20px" },
              { value: 24, label: "24px" }
            ]}
          />

          {/* Link / Dateiverlinkung einfügen Popover */}
          <LinkInsertPopover
            open={linkPopoverOpen}
            onOpenChange={(op) => {
              setLinkPopoverOpen(op);
              if (!op) setEditingLink(null);
            }}
            onInsertLink={handleInsertLink}
            initialDisplayText={editingLink?.label}
            initialTarget={editingLink?.targetPath}
          >
            <Tooltip title={t("editor.insertLink")}>
              <Button
                type="text"
                size="small"
                icon={<LinkIcon size={13} className="text-sky-400" />}
                className="h-7 w-7 p-0 hover:bg-slate-800"
              />
            </Tooltip>
          </LinkInsertPopover>

          <div className="h-4 w-[1px] bg-slate-800 shrink-0" />

          {/* Quick Indicator toggles for active task: Checkbox, ⭐, ❗, ❓, 💡 */}
          <Tooltip title="Checkbox (Alt+C)">
            <Button
              type="text"
              size="small"
              icon={<CheckSquare size={13} className={activeTask?.indicators?.includes("checkbox") ? "text-emerald-400" : "text-slate-500"} />}
              onClick={() => {
                if (activeTask) {
                  toggleTaskIndicator(activeTask.id, "checkbox");
                  restoreFocus(activeTask.id);
                }
              }}
              className={`h-7 w-7 p-0 hover:bg-slate-800 ${activeTask?.indicators?.includes("checkbox") ? "bg-slate-800/80" : ""}`}
            />
          </Tooltip>
          <Tooltip title={t("todo.starIndicator")}>
            <Button
              type="text"
              size="small"
              icon={<Star size={13} className={activeTask?.indicators?.includes("star") ? "text-amber-400 fill-amber-400" : "text-slate-500"} />}
              onClick={() => {
                if (activeTask) {
                  toggleTaskIndicator(activeTask.id, "star");
                  restoreFocus(activeTask.id);
                }
              }}
              className={`h-7 w-7 p-0 hover:bg-slate-800 ${activeTask?.indicators?.includes("star") ? "bg-slate-800/80" : ""}`}
            />
          </Tooltip>
          <Tooltip title={t("todo.exclamationIndicator")}>
            <Button
              type="text"
              size="small"
              icon={<AlertCircle size={13} className={activeTask?.indicators?.includes("exclamation") ? "text-rose-400 fill-rose-400" : "text-slate-500"} />}
              onClick={() => {
                if (activeTask) {
                  toggleTaskIndicator(activeTask.id, "exclamation");
                  restoreFocus(activeTask.id);
                }
              }}
              className={`h-7 w-7 p-0 hover:bg-slate-800 ${activeTask?.indicators?.includes("exclamation") ? "bg-slate-800/80" : ""}`}
            />
          </Tooltip>
          <Tooltip title={t("todo.questionIndicator")}>
            <Button
              type="text"
              size="small"
              icon={<HelpCircle size={13} className={activeTask?.indicators?.includes("question") ? "text-sky-400" : "text-slate-500"} />}
              onClick={() => {
                if (activeTask) {
                  toggleTaskIndicator(activeTask.id, "question");
                  restoreFocus(activeTask.id);
                }
              }}
              className={`h-7 w-7 p-0 hover:bg-slate-800 ${activeTask?.indicators?.includes("question") ? "bg-slate-800/80" : ""}`}
            />
          </Tooltip>
          <Tooltip title={t("todo.lightbulbIndicator")}>
            <Button
              type="text"
              size="small"
              icon={<Lightbulb size={13} className={activeTask?.indicators?.includes("lightbulb") ? "text-yellow-400 fill-yellow-400" : "text-slate-500"} />}
              onClick={() => {
                if (activeTask) {
                  toggleTaskIndicator(activeTask.id, "lightbulb");
                  restoreFocus(activeTask.id);
                }
              }}
              className={`h-7 w-7 p-0 hover:bg-slate-800 ${activeTask?.indicators?.includes("lightbulb") ? "bg-slate-800/80" : ""}`}
            />
          </Tooltip>
        </div>

        {/* Export ToDo File (FileUp) */}
        <div className="flex items-center space-x-1 shrink-0">
          <Tooltip title={t("todo.exportTodo")}>
            <Button
              type="text"
              size="small"
              icon={<FileUp size={14} style={{ color: "var(--color-primary-accent)" }} />}
              onClick={handleExport}
              className="hover:bg-slate-800 h-7 w-7 p-0 flex items-center justify-center"
            />
          </Tooltip>
        </div>
      </div>

      {/* 2. Main Workspace Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Notebook / List Sidebar */}
        {sidebarOpen && (
          <div className="w-56 bg-[#0c121e] border-r border-slate-800/80 flex flex-col shrink-0">
            {/* Sidebar Header showing File Name */}
            <div className="p-3 border-b border-slate-800/80 flex items-center justify-between">
              {isEditingFileTitle ? (
                <Input
                  size="small"
                  value={fileTitleText}
                  onChange={(e) => setFileTitleText(e.target.value)}
                  onBlur={handleSaveFileTitle}
                  onPressEnter={handleSaveFileTitle}
                  autoFocus
                  style={{ borderColor: "var(--color-primary-accent)" }}
                  className="text-xs font-mono font-bold bg-slate-900 text-white"
                />
              ) : (
                <div 
                  className="flex items-center justify-between w-full cursor-pointer group pr-1 min-w-0"
                  onClick={() => {
                    setFileTitleText(fileTitle);
                    setIsEditingFileTitle(true);
                  }}
                  title={t("todo.clickToEditTitle")}
                >
                  <span
                    style={{ color: "var(--color-primary-accent)" }}
                    className="text-xs font-bold font-mono tracking-wide group-hover:brightness-110 truncate flex-1"
                  >
                    {fileTitle}
                  </span>
                  <Edit2 
                    size={13} 
                    className="text-slate-400 group-hover:!text-[var(--color-primary-accent)] opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110 shrink-0 ml-1" 
                    onClick={(e) => {
                      e.stopPropagation();
                      setFileTitleText(fileTitle);
                      setIsEditingFileTitle(true);
                    }}
                  />
                </div>
              )}

              <Button
                type="text"
                size="small"
                icon={<Plus size={13} className="text-emerald-400" />}
                onClick={() => {
                  const newId = createList(t("todo.addList"));
                  setEditingListId(newId);
                  setEditingTitleText(t("todo.addList"));
                }}
                className="hover:bg-slate-800 p-1 h-6 w-6 shrink-0"
                title={t("todo.addList")}
              />
            </div>

            {/* List Entries */}
            <div
              ref={listsContainerRef}
              className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin relative select-none"
            >
              {lists.map((list, idx) => {
                const isActive = list.id === activeListId;
                const isEditing = list.id === editingListId;
                const isDragged = draggedListId === list.id;

                return (
                  <div
                    key={list.id}
                    ref={(node) => {
                      if (node) {
                        listNodeRefs.current.set(list.id, node);
                      } else {
                        listNodeRefs.current.delete(list.id);
                      }
                    }}
                    onDragStart={(e) => e.preventDefault()}
                    onMouseDown={(e) => {
                      if (e.button !== 0) return;
                      if (isEditing) return;
                      if ((e.target as HTMLElement).closest("button, input")) return;
                      e.preventDefault();
                      startDragList(list.id, idx, e.clientX, e.clientY);
                    }}
                    onClick={() => {
                      if (suppressListClickRef.current) {
                        suppressListClickRef.current = false;
                        return;
                      }
                      setActiveListId(list.id);
                    }}
                    style={
                      isActive
                        ? {
                            backgroundColor: isDragged
                              ? "rgba(var(--color-primary-accent-rgb, 168, 85, 247), 0.28)"
                              : "rgba(var(--color-primary-accent-rgb, 168, 85, 247), 0.16)",
                            borderColor: "rgba(var(--color-primary-accent-rgb, 168, 85, 247), 0.45)",
                            color: "#ffffff"
                          }
                        : isDragged
                        ? {
                            backgroundColor: "#1e293b",
                            borderColor: "rgba(var(--color-primary-accent-rgb, 168, 85, 247), 0.4)"
                          }
                        : undefined
                    }
                    className={`group px-2.5 py-1.5 rounded-md cursor-pointer flex items-center justify-between text-xs transition-colors border select-none ${
                      isActive
                        ? "font-semibold"
                        : "border-transparent text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                    } ${
                      isDragged
                        ? "z-40 shadow-xl ring-1 ring-[var(--color-primary-accent)]/60 cursor-grabbing relative"
                        : "relative"
                    }`}
                  >
                    <div className="flex items-center space-x-1 flex-1 min-w-0">
                      <div
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          startDragList(list.id, idx, e.clientX, e.clientY);
                        }}
                        className={`p-0.5 -ml-1 mr-0.5 rounded cursor-grab active:cursor-grabbing hover:bg-slate-800 transition-opacity ${
                          isDragged
                            ? "opacity-100 text-[var(--color-primary-accent)] cursor-grabbing"
                            : "opacity-0 group-hover:opacity-100 text-slate-400 hover:text-white"
                        }`}
                        title={t("todo.dragToReorder")}
                      >
                        <GripVertical size={13} className="shrink-0 pointer-events-none" />
                      </div>
                      {isEditing ? (
                        <Input
                          size="small"
                          value={editingTitleText}
                          onChange={(e) => setEditingTitleText(e.target.value)}
                          onBlur={() => {
                            if (editingTitleText.trim()) renameList(list.id, editingTitleText.trim());
                            setEditingListId(null);
                          }}
                          onPressEnter={() => {
                            if (editingTitleText.trim()) renameList(list.id, editingTitleText.trim());
                            setEditingListId(null);
                          }}
                          autoFocus
                          className="text-xs font-mono bg-slate-900 text-white"
                        />
                      ) : (
                        <span className="truncate flex-1 font-mono">{list.title}</span>
                      )}
                    </div>

                    <div className="flex items-center space-x-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      {lists.length > 1 && idx > 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            reorderLists(idx, idx - 1);
                          }}
                          className="text-slate-500 hover:text-slate-300 p-0.5 rounded hover:bg-slate-800"
                          title={t("todo.moveUp")}
                        >
                          <ChevronUp size={11} />
                        </button>
                      )}
                      {lists.length > 1 && idx < lists.length - 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            reorderLists(idx, idx + 1);
                          }}
                          className="text-slate-500 hover:text-slate-300 p-0.5 rounded hover:bg-slate-800"
                          title={t("todo.moveDown")}
                        >
                          <ChevronDown size={11} />
                        </button>
                      )}
                      {!isEditing && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingListId(list.id);
                            setEditingTitleText(list.title);
                          }}
                          className="text-slate-500 hover:text-slate-300 p-0.5 rounded hover:bg-slate-800"
                          title={t("todo.renameList")}
                        >
                          <Edit2 size={11} />
                        </button>
                      )}
                      {lists.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteList(list.id);
                          }}
                          className="text-slate-500 hover:text-rose-400 p-0.5 rounded hover:bg-slate-800"
                          title={t("todo.deleteList")}
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Status Filters */}
            <div className="p-2 border-t border-slate-800/80 space-y-1">
              <div className="text-[10px] uppercase tracking-wider font-mono text-slate-500 px-1 font-semibold">{t("todo.filterHeader")}</div>
              <div className="grid grid-cols-3 gap-1 text-[11px] font-mono">
                <button
                  onClick={() => setStatusFilter("all")}
                  className={`py-1 rounded text-center transition-colors ${statusFilter === "all" ? "bg-slate-800 text-white font-bold" : "text-slate-400 hover:text-slate-200"}`}
                >
                  {t("todo.allFilter")}
                </button>
                <button
                  onClick={() => setStatusFilter("open")}
                  className={`py-1 rounded text-center transition-colors ${statusFilter === "open" ? "bg-amber-950/60 text-amber-300 font-bold border border-amber-800/50" : "text-slate-400 hover:text-slate-200"}`}
                >
                  {t("todo.openFilter")}
                </button>
                <button
                  onClick={() => setStatusFilter("completed")}
                  className={`py-1 rounded text-center transition-colors ${statusFilter === "completed" ? "bg-emerald-950/60 text-emerald-300 font-bold border border-emerald-800/50" : "text-slate-400 hover:text-slate-200"}`}
                >
                  {t("todo.completedFilter")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Right Main Editor Area */}
        <div className="flex-1 flex flex-col bg-[#090d16] overflow-hidden relative">
          {/* 1. Fixed Header: Active ToDo List Title with Inline Editing */}
          <div className="px-6 py-3 border-b border-slate-800/80 bg-[#0c121e] flex items-center justify-between shrink-0">
            {isEditingActiveListTitle ? (
              <Input
                size="small"
                value={activeListTitleText}
                onChange={(e) => setActiveListTitleText(e.target.value)}
                onBlur={() => {
                  if (activeListTitleText.trim() && activeList) renameList(activeList.id, activeListTitleText.trim());
                  setIsEditingActiveListTitle(false);
                }}
                onPressEnter={() => {
                  if (activeListTitleText.trim() && activeList) renameList(activeList.id, activeListTitleText.trim());
                  setIsEditingActiveListTitle(false);
                }}
                autoFocus
                style={{ borderColor: "var(--color-primary-accent)", color: "var(--color-primary-accent)" }}
                className="text-base font-bold font-mono bg-slate-900 max-w-sm"
              />
            ) : (
              <div
                className="flex items-center space-x-2 cursor-pointer group min-w-0"
                onClick={() => {
                  if (activeList) {
                    setActiveListTitleText(activeList.title);
                    setIsEditingActiveListTitle(true);
                  }
                }}
                title={t("todo.clickToEditTitle")}
              >
                <h1 className="text-base font-bold font-mono text-white tracking-wide group-hover:!text-[var(--color-primary-accent)] transition-colors truncate">
                  {activeList?.title || t("todo.title")}
                </h1>
                <Edit2 size={14} className="text-slate-400 group-hover:!text-[var(--color-primary-accent)] opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110 shrink-0" />
              </div>
            )}

            <div className="text-xs font-mono text-slate-500 flex items-center gap-3">
              <span>{t("todo.open")}: <strong className="text-amber-400">{openCount}</strong></span>
              <span>{t("todo.completed")}: <strong className="text-emerald-400">{completedCount}</strong></span>
            </div>
          </div>

          {/* Hashtag Filter Bar */}
          {allHashtags.length > 0 && (
            <div
              onWheel={(e) => {
                if (e.deltaY !== 0) {
                  e.currentTarget.scrollLeft += e.deltaY;
                }
              }}
              className="px-4 py-2 bg-[#0b101c] border-b border-slate-800/60 flex items-center space-x-2 overflow-x-auto scrollbar-none shrink-0"
            >
              <Tag size={12} className="text-slate-500 shrink-0" />
              {allHashtags.map(tag => {
                const isSelected = selectedTags.includes(tag);
                const tagColor = hashtagColors[tag] || accentTheme.primaryAccent;

                return (
                  <Dropdown
                    key={tag}
                    trigger={["contextMenu"]}
                    menu={{
                      items: [
                        {
                          key: "accent",
                          label: (
                            <span className="flex items-center gap-2 text-xs">
                              <span
                                className="w-2.5 h-2.5 rounded-full inline-block"
                                style={{ backgroundColor: accentTheme.primaryAccent }}
                              />
                              {t("todo.accentDefault")}
                            </span>
                          ),
                          onClick: () => setHashtagColor(tag, null)
                        },
                        { type: "divider" as const },
                        ...PRESET_TAG_COLORS.map((preset) => ({
                          key: preset.color,
                          label: (
                            <span className="flex items-center gap-2 text-xs">
                              <span
                                className="w-2.5 h-2.5 rounded-full inline-block"
                                style={{ backgroundColor: preset.color }}
                              />
                              {preset.name}
                            </span>
                          ),
                          onClick: () => setHashtagColor(tag, preset.color)
                        }))
                      ]
                    }}
                  >
                    <button
                      onClick={() => toggleSelectTag(tag)}
                      style={{
                        borderColor: tagColor,
                        color: isSelected ? "#ffffff" : tagColor,
                        backgroundColor: isSelected ? `${tagColor}40` : "transparent"
                      }}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-mono border transition-colors shrink-0 flex items-center gap-1 ${
                        isSelected ? "font-bold shadow-sm" : "opacity-85 hover:opacity-100"
                      }`}
                      title={t("todo.tagChipTooltip")}
                    >
                      {tag}
                    </button>
                  </Dropdown>
                );
              })}

              {selectedTags.length > 0 && (
                <button
                  onClick={clearTagFilter}
                  className="text-[10px] text-rose-400 hover:underline px-1 font-mono shrink-0"
                >
                  {t("todo.resetFilter")}
                </button>
              )}
            </div>
          )}

          {/* Search Bar & Header Controls */}
          <div className="px-4 py-2 border-b border-slate-900 flex items-center justify-between space-x-3 shrink-0">
            <div className="flex items-center gap-3">
              <Input
                prefix={<Search size={13} className="text-slate-500 mr-1" />}
                placeholder={searchAllLists ? t("todo.searchAllPlaceholder") : t("todo.searchPlaceholder")}
                size="small"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                allowClear
                className="bg-[#0e1624] border-slate-800 text-xs font-mono w-64 text-slate-200"
              />
              <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer select-none">
                <Checkbox
                  checked={searchAllLists}
                  onChange={(e) => setSearchAllLists(e.target.checked)}
                />
                <span>{t("todo.searchAllLists")}</span>
              </label>
            </div>

            {!sidebarOpen && statusFilter !== "all" && (
              <button
                onClick={() => setStatusFilter("all")}
                className="text-[11px] font-mono px-2 py-0.5 rounded border border-slate-700 bg-slate-900 text-slate-300 hover:text-white transition-colors"
                title={t("todo.resetFilter")}
              >
                Filter: {statusFilter === "open" ? t("todo.openFilter") : t("todo.completedFilter")} ×
              </button>
            )}
          </div>

          {/* Task Line List */}
          <div 
            ref={taskListScrollRef} 
            onScroll={(e) => setShowJumpUp(e.currentTarget.scrollTop > 80)}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                const newId = addTask(null, { indent: 0, indicators: [], text: "" });
                setActiveTaskId(newId);
                restoreFocus(newId);
              }
            }}
            className="flex-1 overflow-y-auto p-4 space-y-1.5 scrollbar-thin relative flex flex-col cursor-text"
          >
            {filteredTasks.length === 0 ? (
              <div 
                className="h-48 flex flex-col items-center justify-center text-slate-500 text-xs space-y-2 cursor-text"
                onClick={(e) => {
                  if ((e.target as HTMLElement).tagName.toLowerCase() !== "button" && !(e.target as HTMLElement).closest("button")) {
                    const newId = addTask(null, { indent: 0, indicators: [], text: "" });
                    setActiveTaskId(newId);
                    restoreFocus(newId);
                  }
                }}
              >
                <CheckSquare size={32} className="text-slate-700" />
                <p className="font-mono">
                  {searchQuery.trim() || selectedTags.length > 0 || statusFilter !== "all"
                    ? t("todo.noSearchResults")
                    : t("todo.noTasks")}
                </p>
                {!searchQuery.trim() && selectedTags.length === 0 && statusFilter === "all" && (
                  <Button size="small" type="primary" onClick={() => addTask(null, { indent: 0, indicators: [], text: "" })} icon={<Plus size={13} />}>
                    {t("todo.addTask")}
                  </Button>
                )}
              </div>
            ) : (
              (() => {
                const nodes: React.ReactNode[] = [];
                let hiddenCompletedCount = 0;

                filteredTasks.forEach((task, idx) => {
                  // 1. Skip if collapsed by parent fold
                  if (isTaskCollapsed(filteredTasks, idx)) {
                    return;
                  }

                  // 2. Hide completed tasks if option is enabled
                  if (hideCompleted && task.completed) {
                    hiddenCompletedCount++;
                    return;
                  }

                  // Render divider line for previous hidden completed tasks
                  if (hiddenCompletedCount > 0) {
                    const count = hiddenCompletedCount;
                    nodes.push(
                      <div key={`completed_divider_${task.id}`} className="flex items-center my-1 select-none pointer-events-none opacity-60">
                        <div className="flex-1 border-t border-slate-700/80 border-dashed" />
                        <span className="ml-3 text-[11px] font-mono font-semibold text-slate-400">
                          {count}
                        </span>
                      </div>
                    );
                    hiddenCompletedCount = 0;
                  }

                  const isSelected = activeTaskId === task.id;
                  const fmt = task.formatting || {};
                  const isParent = isParentTask(filteredTasks, idx);
                  const isCollapsed = Boolean(task.collapsed);

                  nodes.push(
                    <div
                      key={task.id}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest(".todo-link-button") || (e.target as HTMLElement).closest(".todo-fold-button")) return;
                        setActiveTaskId(task.id);
                      }}
                      style={{
                        paddingLeft: `${task.indent * 24}px`,
                        borderColor: isSelected
                          ? "rgba(var(--color-primary-accent-rgb, 168, 85, 247), 0.45)"
                          : undefined
                      }}
                      className={`group flex items-start space-x-1.5 py-1 px-2 rounded-md transition-colors border ${
                        isSelected ? "bg-[#0e1624]" : "border-transparent hover:bg-[#0c121e]"
                      }`}
                    >
                      {/* Parent Fold Chevron Button */}
                      {isParent ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTaskCollapse(task.id);
                          }}
                          className="todo-fold-button mt-1 text-slate-400 hover:!text-[var(--color-primary-accent)] transition-colors shrink-0 p-0.5"
                          title={isCollapsed ? t("todo.expandTasks") : t("todo.collapseTasks")}
                        >
                          {isCollapsed ? (
                            <ChevronRight size={14} style={{ color: "var(--color-primary-accent)" }} className="font-bold" />
                          ) : (
                            <ChevronDown size={14} className="text-slate-400" />
                          )}
                        </button>
                      ) : (
                        <div className="w-4 shrink-0" />
                      )}

                      {/* Checkbox (Rendered ONLY if task.indicators.includes("checkbox")) */}
                      {task.indicators.includes("checkbox") && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTaskCompleted(task.id);
                          }}
                          className="mt-1 text-slate-400 hover:text-emerald-400 transition-colors shrink-0"
                          title={task.completed ? t("todo.markIncomplete") : t("todo.markCompleted")}
                        >
                          {task.completed ? (
                            <CheckSquare size={16} className="text-emerald-400 fill-emerald-950/40" />
                          ) : (
                            <Square size={16} className="text-slate-500 hover:text-slate-300" />
                          )}
                        </button>
                      )}

                    {/* DYNAMIC INDICATOR ICONS (Only rendered if active for this task!) */}
                    {task.indicators.includes("star") && (
                      <Star size={14} className="mt-1 text-amber-400 fill-amber-400 shrink-0" />
                    )}
                    {task.indicators.includes("exclamation") && (
                      <AlertCircle size={14} className="mt-1 text-rose-400 fill-rose-400 shrink-0" />
                    )}
                    {task.indicators.includes("question") && (
                      <HelpCircle size={14} className="mt-1 text-sky-400 shrink-0" />
                    )}
                    {task.indicators.includes("lightbulb") && (
                      <Lightbulb size={14} className="mt-1 text-yellow-400 fill-yellow-400 shrink-0" />
                    )}

                    {/* Task Input Field */}
                    <div className="flex-1 min-w-0 relative">
                      {isSelected ? (
                        <Input.TextArea
                          id={`todo_input_${task.id}`}
                          value={task.text}
                          onFocus={() => setActiveTaskId(task.id)}
                          onChange={(e) => handleTaskTextChange(task.id, e.target.value)}
                          onKeyDown={(e) => handleTaskKeyDown(e, task)}
                          onPaste={(e) => handleTaskPaste(e, task.id)}
                          onDrop={(e) => handleTaskDrop(e, task.id)}
                          autoSize={{ minRows: 1, maxRows: 16 }}
                          bordered={false}
                          style={{
                            fontSize: `${fmt.fontSize || (fmt.headingLevel === 1 ? 18 : fmt.headingLevel === 2 ? 16 : fmt.headingLevel === 3 ? 14 : 13)}px`,
                            fontWeight: fmt.headingLevel ? "bold" : fmt.bold ? "bold" : "normal",
                            fontStyle: fmt.italic ? "italic" : "normal",
                            lineHeight: 1.45,
                            paddingBottom: "3px",
                            color: task.completed
                              ? undefined
                              : fmt.headingLevel
                              ? "var(--color-preview-heading, #f1f5f9)"
                              : "var(--color-todo-task-text, #e2e8f0)",
                            textDecoration: [
                              fmt.underline ? "underline" : "",
                              fmt.strikethrough || task.completed ? "line-through" : ""
                            ].filter(Boolean).join(" ") || "none"
                          }}
                          className={`w-full p-0 font-sans leading-relaxed resize-none ${
                            task.completed ? "opacity-50 text-slate-500" : ""
                          }`}
                        />
                      ) : (
                        <div
                          id={`todo_input_${task.id}`}
                          onClick={(e) => {
                            if ((e.target as HTMLElement).closest(".todo-link-button")) return;
                            let caretOffset = task.text.length;
                            try {
                              let range: Range | null = null;
                              if ((document as any).caretRangeFromPoint) {
                                range = (document as any).caretRangeFromPoint(e.clientX, e.clientY);
                              } else if ((document as any).caretPositionFromPoint) {
                                const pos = (document as any).caretPositionFromPoint(e.clientX, e.clientY);
                                if (pos) {
                                  range = document.createRange();
                                  range.setStart(pos.offsetNode, pos.offset);
                                  range.collapse(true);
                                }
                              }
                              if (range && e.currentTarget.contains(range.startContainer)) {
                                const preCaretRange = range.cloneRange();
                                preCaretRange.selectNodeContents(e.currentTarget);
                                preCaretRange.setEnd(range.startContainer, range.startOffset);
                                const textLen = preCaretRange.toString().length;
                                if (textLen <= task.text.length) {
                                  caretOffset = textLen;
                                }
                              }
                            } catch (err) {
                              caretOffset = task.text.length;
                            }

                            setActiveTaskId(task.id);
                            setTimeout(() => {
                              const el = document.getElementById(`todo_input_${task.id}`) as HTMLTextAreaElement | null;
                              if (el) {
                                el.focus();
                                try {
                                  const pos = Math.min(caretOffset, el.value.length);
                                  el.setSelectionRange(pos, pos);
                                } catch (err) {}
                              }
                            }, 20);
                          }}
                          style={{
                            fontSize: `${fmt.fontSize || (fmt.headingLevel === 1 ? 18 : fmt.headingLevel === 2 ? 16 : fmt.headingLevel === 3 ? 14 : 13)}px`,
                            fontWeight: fmt.headingLevel ? "bold" : fmt.bold ? "bold" : "normal",
                            fontStyle: fmt.italic ? "italic" : "normal",
                            lineHeight: 1.45,
                            paddingBottom: "3px",
                            color: task.completed
                              ? undefined
                              : fmt.headingLevel
                              ? "var(--color-preview-heading, #f1f5f9)"
                              : "var(--color-todo-task-text, #e2e8f0)",
                            textDecoration: [
                              fmt.underline ? "underline" : "",
                              fmt.strikethrough || task.completed ? "line-through" : ""
                            ].filter(Boolean).join(" ") || "none"
                          }}
                          className={`w-full p-0 font-sans leading-relaxed cursor-text min-h-[24px] ${
                            task.completed ? "opacity-50 text-slate-500" : ""
                          }`}
                        >
                          {renderFormattedTaskContent(
                            task.text,
                            jsonTabs,
                            activeTab?.path,
                            (link) => handleOpenLinkTarget(link, activeTab?.path),
                            (link) => {
                              setEditingLink({ taskId: task.id, raw: link.raw, label: link.label, targetPath: link.targetPath });
                              setLinkPopoverOpen(true);
                            }
                          )}
                        </div>
                      )}

                      {/* Autocomplete Floating Popup (#hashtag & [[wikilink) */}
                      {autocompleteTaskId === task.id && autocompleteSuggestions.length > 0 && (
                        <div
                          style={{ borderColor: "rgba(var(--color-primary-accent-rgb, 168, 85, 247), 0.6)" }}
                          className="absolute left-0 top-full mt-1 z-50 w-64 bg-[#0e1624] border rounded-lg shadow-2xl overflow-hidden p-1 space-y-0.5 font-sans"
                        >
                          <div
                            style={{ color: "var(--color-primary-accent)" }}
                            className="px-2 py-1 text-[10px] font-mono font-semibold uppercase border-b border-slate-800"
                          >
                            {autocompleteType === "hashtag" ? t("todo.tagSuggestions") : t("todo.fileSuggestions")}
                          </div>
                          {autocompleteSuggestions.slice(0, 6).map((item, sIdx) => (
                            <div
                              key={sIdx}
                              onClick={() => applyAutocompleteItem(task.id, item)}
                              style={
                                sIdx === autocompleteSelectedIndex
                                  ? { backgroundColor: "rgba(var(--color-primary-accent-rgb, 168, 85, 247), 0.35)" }
                                  : undefined
                              }
                              className={`px-2.5 py-1.5 rounded cursor-pointer text-xs font-mono flex items-center justify-between transition-colors ${
                                sIdx === autocompleteSelectedIndex ? "text-white font-semibold" : "text-slate-300 hover:bg-slate-800"
                              }`}
                            >
                              <span className="truncate">{item}</span>
                              {sIdx === autocompleteSelectedIndex && (
                                <Check size={12} style={{ color: "var(--color-primary-accent)" }} />
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Display attached images */}
                      {task.images && task.images.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-2">
                          {task.images.map((imgUrl, imgIdx) => (
                            <div key={imgIdx} className="relative group/img">
                              <img
                                src={imgUrl}
                                alt="Attachment"
                                className="h-20 w-auto rounded border border-slate-700 object-cover"
                              />
                              <button
                                onClick={() => {
                                  const updated = task.images?.filter((_, idx) => idx !== imgIdx);
                                  updateTask(task.id, { images: updated });
                                }}
                                className="absolute -top-1 -right-1 bg-rose-900 hover:bg-rose-700 text-white rounded-full p-0.5 opacity-0 group-hover/img:opacity-100 transition-opacity"
                              >
                                <Trash2 size={10} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Action Controls per row */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center space-x-1 shrink-0 pt-0.5">
                      <button
                        onClick={() => deleteTask(task.id)}
                        className="text-slate-500 hover:text-rose-400 p-1"
                        title={t("todo.deleteTask")}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              });

              if (hiddenCompletedCount > 0) {
                const count = hiddenCompletedCount;
                nodes.push(
                  <div key="completed_divider_end" className="flex items-center my-1 select-none pointer-events-none opacity-60">
                    <div className="flex-1 border-t border-slate-700/80 border-dashed" />
                    <span className="ml-3 text-[11px] font-mono font-semibold text-slate-400">
                      {count}
                    </span>
                  </div>
                );
              }

              // Add empty clickable area at the bottom so user can click anywhere below the tasks
              nodes.push(
                <div
                  key="todo-empty-click-area-spacer"
                  className="todo-empty-click-area flex-1 min-h-[140px] cursor-text"
                  onClick={(e) => {
                    e.stopPropagation();
                    const newId = addTask(null, { indent: 0, indicators: [], text: "" });
                    setActiveTaskId(newId);
                    restoreFocus(newId);
                  }}
                />
              );

              return nodes;
            })()
            )}
          </div>

          {/* JumpUp Button */}
          {showJumpUp && (
            <button
              onClick={() => {
                if (taskListScrollRef.current) {
                  taskListScrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
                }
              }}
              style={{
                backgroundColor: "rgba(var(--color-primary-accent-rgb, 168, 85, 247), 0.78)",
                borderColor: "rgba(var(--color-primary-accent-rgb, 168, 85, 247), 0.5)"
              }}
              className="absolute bottom-11 right-6 z-30 w-8 h-8 rounded-full hover:brightness-110 text-white shadow-lg backdrop-blur flex items-center justify-center transition-all cursor-pointer border hover:scale-110 active:scale-95"
              title={t("todo.scrollToTop")}
            >
              <ChevronUp size={16} />
            </button>
          )}

          {/* Sticky Footer Bar */}
          <div className="h-7 bg-[#070b13] border-t border-slate-900 px-4 flex items-center justify-between text-[10px] font-mono text-slate-400 shrink-0">
            <div className="flex items-center space-x-4">
              <span>ToDo's: <strong className="text-amber-400">{openCount}</strong> {t("todo.open")}</span>
              <span><strong className="text-emerald-400">{completedCount}</strong> {t("todo.completed")}</span>
              <span><strong style={{ color: "var(--color-primary-accent)" }}>{totalCount}</strong> {t("todo.total")}</span>
            </div>
            <div>
              Format: <span className="text-emerald-400 font-bold">{t("todo.format")}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
