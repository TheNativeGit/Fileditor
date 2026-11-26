import { create } from "zustand";
import { logger } from "../utils/logger";
import { useFileStore } from "./useFileStore";

let updateTaskTimer: any = null;

export type ToDoIndicator = "checkbox" | "star" | "exclamation" | "question" | "lightbulb";

export interface TaskFormatting {
  headingLevel?: 0 | 1 | 2 | 3 | 4; // 0 = Normal, 1 = H1 (Title), 2 = H2 (Subtitle), 3 = H3, 4 = H4
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  fontSize?: number; // Default 13
  link?: { text: string; url: string } | null;
}

export interface ToDoTask {
  id: string;
  text: string;
  completed: boolean;
  indent: number; // 0, 1, 2, 3...
  indicators: ToDoIndicator[];
  formatting: TaskFormatting;
  tags: string[]; // e.g. ["#PLAN", "#WORK"] (all uppercase)
  images?: string[]; // Data URLs / Tauri image paths
  collapsed?: boolean;
  originalCompleted?: boolean;
}

export interface ToDoList {
  id: string;
  title: string;
  tasks: ToDoTask[];
  createdAt?: number;
}

export const PRESET_TAG_COLORS = [
  { name: "Smaragdgrün", color: "#10b981" },
  { name: "Rubinrot", color: "#ef4444" },
  { name: "Bernstein", color: "#f59e0b" },
  { name: "Himmelblau", color: "#06b6d4" },
  { name: "Violett", color: "#a855f7" },
  { name: "Magenta", color: "#ec4899" },
  { name: "Indigo", color: "#6366f1" },
  { name: "Türkis", color: "#14b8a6" }
];

/**
 * Berechnet alle effektiven Tags für eine Aufgabe unter Berücksichtigung der
 * Einrückungshierarchie (Aufgaben erben Hashtags von übergeordneten Titelzeilen).
 */
export const getEffectiveTaskTags = (task: ToDoTask, tasksInList: ToDoTask[]): string[] => {
  const taskIdx = tasksInList.findIndex((t) => t.id === task.id);
  if (taskIdx === -1) return (task.tags || []).map((t) => t.toUpperCase());

  const tagSet = new Set<string>((task.tags || []).map((t) => t.toUpperCase()));
  let currentIndent = task.indent || 0;

  for (let i = taskIdx - 1; i >= 0; i--) {
    const prevTask = tasksInList[i];
    const prevIndent = prevTask.indent || 0;

    if (prevIndent < currentIndent) {
      (prevTask.tags || []).forEach((t) => tagSet.add(t.toUpperCase()));
      currentIndent = prevIndent;
      if (currentIndent === 0) break;
    }
  }

  return Array.from(tagSet);
};

interface ToDoStore {
  todoPluginEnabled: boolean;
  lists: ToDoList[];
  activeListId: string;
  hashtagColors: Record<string, string>;
  searchQuery: string;
  statusFilter: "all" | "open" | "completed";
  selectedTags: string[];
  history: ToDoList[][];
  historyIndex: number;
  fileHistories: Record<string, { history: ToDoList[][]; historyIndex: number }>;

  setTodoPluginEnabled: (enabled: boolean) => void;
  initFileHistory: (fileId: string, initialLists: ToDoList[]) => void;
  setActiveListId: (id: string) => void;
  createList: (title?: string) => string;
  renameList: (id: string, newTitle: string) => void;
  deleteList: (id: string) => void;
  reorderLists: (fromIndex: number, toIndex: number, skipHistory?: boolean) => void;

  addTask: (afterTaskId?: string | null, customProps?: Partial<ToDoTask>) => string;
  updateTask: (taskId: string, updates: Partial<ToDoTask>) => void;
  deleteTask: (taskId: string) => void;
  toggleTaskCompleted: (taskId: string) => void;
  toggleTaskIndicator: (taskId: string, indicator: ToDoIndicator) => void;
  indentTask: (taskId: string) => void;
  outdentTask: (taskId: string) => void;
  todoCascadingIndent: boolean;
  setTodoCascadingIndent: (enabled: boolean) => void;

  setHashtagColor: (tag: string, color: string | null) => void;
  setSearchQuery: (query: string) => void;
  setStatusFilter: (filter: "all" | "open" | "completed") => void;
  toggleSelectTag: (tag: string) => void;
  clearTagFilter: () => void;

  exportActiveList: () => string;
  importListJson: (jsonStr: string) => boolean;

  pushHistoryState: () => void;
  undo: () => void;
  redo: () => void;
}

const DEFAULT_LISTS: ToDoList[] = [
  {
    id: "default_list_1",
    title: "Meine Aufgaben",
    tasks: [
      {
        id: "task_1",
        text: "Projektplanung abschließen #PLAN",
        completed: false,
        indent: 0,
        indicators: ["checkbox", "star"],
        formatting: { headingLevel: 1, bold: true },
        tags: ["#PLAN"]
      },
      {
        id: "task_2",
        text: "Architekturkonzept durchgehen #WICHTIG",
        completed: false,
        indent: 1,
        indicators: ["checkbox", "exclamation"],
        formatting: { headingLevel: 0 },
        tags: ["#WICHTIG"]
      },
      {
        id: "task_3",
        text: "Design-Feedback auswerten #IDEE",
        completed: true,
        indent: 1,
        indicators: ["checkbox", "lightbulb"],
        formatting: { headingLevel: 0, strikethrough: true },
        tags: ["#IDEE"]
      }
    ]
  }
];

const STORAGE_KEYS = {
  enabled: "fileditor_todo_plugin_enabled",
  lists: "fileditor_todo_lists",
  activeId: "fileditor_todo_active_list_id",
  hashtagColors: "fileditor_todo_hashtag_colors"
};

export const useToDoStore = create<ToDoStore>((set, get) => {
  // Load persisted state
  let initialEnabled = true;
  let initialLists = DEFAULT_LISTS;
  let initialActiveId = DEFAULT_LISTS[0].id;
  let initialColors: Record<string, string> = {};

  try {
    const savedEnabled = localStorage.getItem(STORAGE_KEYS.enabled);
    if (savedEnabled !== null) initialEnabled = JSON.parse(savedEnabled);

    const savedLists = localStorage.getItem(STORAGE_KEYS.lists);
    if (savedLists) {
      const parsed = JSON.parse(savedLists);
      if (Array.isArray(parsed) && parsed.length > 0) {
        initialLists = parsed.map(l => ({
          id: l.id || `list_${Math.random()}`,
          title: l.title || "Liste",
          tasks: Array.isArray(l.tasks) ? l.tasks : []
        }));
      }
    }

    const savedActiveId = localStorage.getItem(STORAGE_KEYS.activeId);
    if (savedActiveId && initialLists.some(l => l.id === savedActiveId)) {
      initialActiveId = savedActiveId;
    } else if (initialLists.length > 0) {
      initialActiveId = initialLists[0].id;
    }

    const savedColors = localStorage.getItem(STORAGE_KEYS.hashtagColors);
    if (savedColors) {
      const parsedColors = JSON.parse(savedColors);
      // Migrate legacy hardcoded default colors so categories follow global Accent Color unless customized
      const isLegacyDefault =
        Object.keys(parsedColors).length <= 3 &&
        parsedColors["#PLAN"] === "#a855f7";
      initialColors = isLegacyDefault ? {} : parsedColors;
    }

    logger.info("ToDoStore", `Loaded ${initialLists.length} ToDo lists successfully.`);
  } catch (e: any) {
    logger.error("ToDoStore", "Error loading persisted ToDo state from localStorage", e?.message || String(e));
  }

  const syncWithFileStore = (lists: ToDoList[]) => {
    try {
      const fileStore = useFileStore.getState();
      const activeTabId = fileStore.activeJsonTabId;
      if (activeTabId) {
        const activeTab = fileStore.jsonTabs.find(t => t.id === activeTabId);
        if (activeTab) {
          let currentParsed: any = {};
          try {
            currentParsed = JSON.parse(activeTab.content);
          } catch(e) {}
          const newDoc = {
            ...currentParsed,
            lists
          };
          const newContent = JSON.stringify(newDoc, null, 2);
          if (activeTab.content !== newContent) {
            fileStore.updateTabContent(activeTabId, newContent);
          }
        }
      }
    } catch(e) {}
  };

  const saveState = (lists: ToDoList[], activeId: string) => {
    localStorage.setItem(STORAGE_KEYS.lists, JSON.stringify(lists));
    localStorage.setItem(STORAGE_KEYS.activeId, activeId);
    syncWithFileStore(lists);
  };

  return {
    todoPluginEnabled: initialEnabled,
    todoCascadingIndent: localStorage.getItem("fileditor_todo_cascading_indent") !== "false",
    lists: initialLists,
    activeListId: initialActiveId,
    hashtagColors: initialColors,
    searchQuery: "",
    statusFilter: "all",
    selectedTags: [],
    history: [initialLists],
    historyIndex: 0,
    fileHistories: { default: { history: [JSON.parse(JSON.stringify(initialLists))], historyIndex: 0 } },

    setTodoPluginEnabled: (enabled) => {
      set({ todoPluginEnabled: enabled });
      localStorage.setItem(STORAGE_KEYS.enabled, JSON.stringify(enabled));
    },

    setTodoCascadingIndent: (enabled) => {
      set({ todoCascadingIndent: enabled });
      localStorage.setItem("fileditor_todo_cascading_indent", JSON.stringify(enabled));
    },

    initFileHistory: (fileId, initialLists) => {
      const { fileHistories } = get();
      if (!fileHistories[fileId] || fileHistories[fileId].history.length === 0) {
        const cloned = JSON.parse(JSON.stringify(initialLists));
        set({
          fileHistories: {
            ...fileHistories,
            [fileId]: { history: [cloned], historyIndex: 0 }
          },
          history: [cloned],
          historyIndex: 0
        });
      }
    },

    setActiveListId: (id) => {
      set({ activeListId: id });
      localStorage.setItem(STORAGE_KEYS.activeId, id);
    },

    createList: (title = "Neue Liste") => {
      const { lists } = get();
      const newId = `list_${Date.now()}`;
      const newList: ToDoList = {
        id: newId,
        title,
        tasks: [
          {
            id: `task_${Date.now()}`,
            text: "",
            completed: false,
            indent: 0,
            indicators: ["checkbox"],
            formatting: { headingLevel: 0 },
            tags: []
          }
        ]
      };
      const updated = [...lists, newList];
      set({ lists: updated, activeListId: newId });
      saveState(updated, newId);
      get().pushHistoryState();
      return newId;
    },

    renameList: (id, newTitle) => {
      const { lists, activeListId } = get();
      const updated = lists.map(l => l.id === id ? { ...l, title: newTitle } : l);
      set({ lists: updated });
      saveState(updated, activeListId);
      get().pushHistoryState();
    },

    deleteList: (id) => {
      const { lists, activeListId } = get();
      if (lists.length <= 1) return; // Mindestens eine Liste behalten
      const updated = lists.filter(l => l.id !== id);
      const newActiveId = activeListId === id ? updated[0].id : activeListId;
      set({ lists: updated, activeListId: newActiveId });
      saveState(updated, newActiveId);
      get().pushHistoryState();
    },

    reorderLists: (fromIndex: number, toIndex: number, skipHistory = false) => {
      const { lists, activeListId } = get();
      if (fromIndex < 0 || fromIndex >= lists.length || toIndex < 0 || toIndex >= lists.length) return;
      const updated = [...lists];
      const [removed] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, removed);
      set({ lists: updated });
      saveState(updated, activeListId);
      if (!skipHistory) {
        get().pushHistoryState();
      }
    },

    addTask: (afterTaskId = null, customProps = {}) => {
      const { lists, activeListId } = get();
      const newTaskId = `task_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

      const updated = lists.map(l => {
        if (l.id !== activeListId) return l;

        const tasks = [...l.tasks];
        let insertIdx = tasks.length;
        let inheritIndent = 0;
        let inheritIndicators: ToDoIndicator[] = ["checkbox"];

        if (afterTaskId) {
          const prevIdx = tasks.findIndex(t => t.id === afterTaskId);
          if (prevIdx !== -1) {
            insertIdx = prevIdx + 1;
            inheritIndent = tasks[prevIdx].indent;
            inheritIndicators = [...tasks[prevIdx].indicators];
          }
        }

        const newTask: ToDoTask = {
          id: newTaskId,
          text: "",
          completed: false,
          indent: inheritIndent,
          indicators: inheritIndicators,
          formatting: { headingLevel: 0 },
          tags: [],
          ...customProps
        };

        tasks.splice(insertIdx, 0, newTask);
        return { ...l, tasks };
      });

      set({ lists: updated });
      saveState(updated, activeListId);
      get().pushHistoryState();
      return newTaskId;
    },

    updateTask: (taskId, updates) => {
      const { lists, activeListId } = get();
      const updated = lists.map(l => {
        if (l.id !== activeListId) return l;
        const tasks = l.tasks.map(t => {
          if (t.id !== taskId) return t;

          let newTags = updates.tags || t.tags;
          // Auto extract #HASHTAGS from text if text was updated
          if (updates.text !== undefined) {
            const rawTags = (updates.text.match(/#[a-zA-Z0-9_äöüÄÖÜß]+/g) || []);
            newTags = Array.from(new Set(rawTags.map(tag => tag.toUpperCase())));
          }

          return {
            ...t,
            ...updates,
            tags: newTags
          };
        });
        return { ...l, tasks };
      });

      set({ lists: updated });
      saveState(updated, activeListId);

      // Debounce history push for typing
      if (updateTaskTimer) clearTimeout(updateTaskTimer);
      updateTaskTimer = setTimeout(() => {
        get().pushHistoryState();
      }, 400);
    },

    deleteTask: (taskId) => {
      const { lists, activeListId } = get();
      const updated = lists.map(l => {
        if (l.id !== activeListId) return l;
        return { ...l, tasks: l.tasks.filter(t => t.id !== taskId) };
      });
      set({ lists: updated });
      saveState(updated, activeListId);
      get().pushHistoryState();
    },

    toggleTaskCompleted: (taskId) => {
      const { lists, activeListId } = get();
      const fileStore = useFileStore.getState();
      const autoCompleteChildren = fileStore.todoAutoCompleteChildren;
      const autoCollapseParent = fileStore.todoAutoCollapseParentOnComplete;

      const updated = lists.map(l => {
        if (l.id !== activeListId) return l;
        const taskIdx = l.tasks.findIndex(t => t.id === taskId);
        if (taskIdx === -1) return l;

        const targetTask = l.tasks[taskIdx];
        const nextCompleted = !targetTask.completed;
        const targetIndent = targetTask.indent || 0;

        const newTasks = [...l.tasks];
        newTasks[taskIdx] = {
          ...targetTask,
          completed: nextCompleted,
          collapsed: (nextCompleted && autoCollapseParent) ? true : targetTask.collapsed,
          formatting: {
            ...targetTask.formatting,
            strikethrough: nextCompleted
          }
        };

        if (autoCompleteChildren) {
          for (let i = taskIdx + 1; i < newTasks.length; i++) {
            const child = newTasks[i];
            if ((child.indent || 0) <= targetIndent) break;

            if (nextCompleted) {
              newTasks[i] = {
                ...child,
                originalCompleted: child.originalCompleted !== undefined ? child.originalCompleted : child.completed,
                completed: true,
                formatting: {
                  ...child.formatting,
                  strikethrough: true
                }
              };
            } else {
              const prevStatus = child.originalCompleted ?? false;
              newTasks[i] = {
                ...child,
                completed: prevStatus,
                originalCompleted: undefined,
                formatting: {
                  ...child.formatting,
                  strikethrough: prevStatus
                }
              };
            }
          }
        }

        return { ...l, tasks: newTasks };
      });

      set({ lists: updated });
      saveState(updated, activeListId);
      get().pushHistoryState();
    },

    toggleTaskIndicator: (taskId, indicator) => {
      const { lists, activeListId } = get();
      const updated = lists.map(l => {
        if (l.id !== activeListId) return l;
        const tasks = l.tasks.map(t => {
          if (t.id !== taskId) return t;
          const exists = t.indicators.includes(indicator);
          const newIndicators = exists 
            ? t.indicators.filter(i => i !== indicator)
            : [...t.indicators, indicator];
          return { ...t, indicators: newIndicators };
        });
        return { ...l, tasks };
      });
      set({ lists: updated });
      saveState(updated, activeListId);
      get().pushHistoryState();
    },

    indentTask: (taskId) => {
      const { lists, activeListId, todoCascadingIndent } = get();
      const updated = lists.map(l => {
        if (l.id !== activeListId) return l;
        const taskIdx = l.tasks.findIndex(t => t.id === taskId);
        if (taskIdx === -1) return l;

        const target = l.tasks[taskIdx];
        const targetIndent = target.indent || 0;
        if (targetIndent >= 5) return l;

        const newTasks = [...l.tasks];
        newTasks[taskIdx] = { ...target, indent: targetIndent + 1 };

        if (todoCascadingIndent) {
          for (let i = taskIdx + 1; i < newTasks.length; i++) {
            const child = newTasks[i];
            if ((child.indent || 0) <= targetIndent) break;
            newTasks[i] = { ...child, indent: Math.min((child.indent || 0) + 1, 5) };
          }
        }

        return { ...l, tasks: newTasks };
      });
      set({ lists: updated });
      saveState(updated, activeListId);
      get().pushHistoryState();
    },

    outdentTask: (taskId) => {
      const { lists, activeListId, todoCascadingIndent } = get();
      const updated = lists.map(l => {
        if (l.id !== activeListId) return l;
        const taskIdx = l.tasks.findIndex(t => t.id === taskId);
        if (taskIdx === -1) return l;

        const target = l.tasks[taskIdx];
        const targetIndent = target.indent || 0;
        if (targetIndent <= 0) return l;

        const newTasks = [...l.tasks];
        newTasks[taskIdx] = { ...target, indent: targetIndent - 1 };

        if (todoCascadingIndent) {
          for (let i = taskIdx + 1; i < newTasks.length; i++) {
            const child = newTasks[i];
            if ((child.indent || 0) <= targetIndent) break;
            newTasks[i] = { ...child, indent: Math.max((child.indent || 0) - 1, 0) };
          }
        }

        return { ...l, tasks: newTasks };
      });
      set({ lists: updated });
      saveState(updated, activeListId);
      get().pushHistoryState();
    },

    setHashtagColor: (tag, color) => {
      const upperTag = tag.toUpperCase();
      const { hashtagColors } = get();
      const updated = { ...hashtagColors };
      if (!color) {
        delete updated[upperTag];
      } else {
        updated[upperTag] = color;
      }
      set({ hashtagColors: updated });
      localStorage.setItem(STORAGE_KEYS.hashtagColors, JSON.stringify(updated));
    },

    setSearchQuery: (query) => set({ searchQuery: query }),
    setStatusFilter: (filter) => set({ statusFilter: filter }),

    toggleSelectTag: (tag) => {
      const upperTag = tag.toUpperCase();
      const { selectedTags } = get();
      const exists = selectedTags.includes(upperTag);
      const updated = exists 
        ? selectedTags.filter(t => t !== upperTag)
        : [...selectedTags, upperTag];
      set({ selectedTags: updated });
    },

    clearTagFilter: () => set({ selectedTags: [] }),

    exportActiveList: () => {
      const { lists, activeListId } = get();
      const list = lists.find(l => l.id === activeListId);
      if (!list) return "";
      return JSON.stringify(list, null, 2);
    },

    importListJson: (jsonStr) => {
      try {
        const parsed = JSON.parse(jsonStr);
        if (parsed && Array.isArray(parsed.tasks)) {
          const { lists } = get();
          const newId = `list_${Date.now()}`;
          const importedList: ToDoList = {
            id: newId,
            title: parsed.title || "Importierte Liste",
            tasks: parsed.tasks
          };
          const updated = [...lists, importedList];
          set({ lists: updated, activeListId: newId });
          saveState(updated, newId);
          get().pushHistoryState();
          return true;
        }
      } catch (e) {
        console.error("Import Fehler:", e);
      }
      return false;
    },

    pushHistoryState: () => {
      const activeFileId = useFileStore.getState().activeJsonTabId || "default";
      const { lists, fileHistories } = get();
      const currentEntry = fileHistories[activeFileId] || {
        history: [JSON.parse(JSON.stringify(lists))],
        historyIndex: 0
      };

      const newHistory = currentEntry.history.slice(0, currentEntry.historyIndex + 1);
      newHistory.push(JSON.parse(JSON.stringify(lists)));
      if (newHistory.length > 50) newHistory.shift();
      const newIndex = newHistory.length - 1;

      set({
        fileHistories: {
          ...fileHistories,
          [activeFileId]: { history: newHistory, historyIndex: newIndex }
        },
        history: newHistory,
        historyIndex: newIndex
      });
    },

    undo: () => {
      if (updateTaskTimer) {
        clearTimeout(updateTaskTimer);
        updateTaskTimer = null;
        get().pushHistoryState();
      }

      const activeFileId = useFileStore.getState().activeJsonTabId || "default";
      const { fileHistories, activeListId } = get();
      const currentEntry = fileHistories[activeFileId];
      if (!currentEntry || currentEntry.historyIndex <= 0) {
        return;
      }

      const newIndex = currentEntry.historyIndex - 1;
      const prevLists = currentEntry.history[newIndex];

      set({
        lists: prevLists,
        fileHistories: {
          ...fileHistories,
          [activeFileId]: { ...currentEntry, historyIndex: newIndex }
        },
        history: currentEntry.history,
        historyIndex: newIndex
      });

      saveState(prevLists, activeListId);
    },

    redo: () => {
      const activeFileId = useFileStore.getState().activeJsonTabId || "default";
      const { fileHistories, activeListId } = get();
      const currentEntry = fileHistories[activeFileId];
      if (!currentEntry || currentEntry.historyIndex >= currentEntry.history.length - 1) {
        return;
      }

      const newIndex = currentEntry.historyIndex + 1;
      const nextLists = currentEntry.history[newIndex];

      set({
        lists: nextLists,
        fileHistories: {
          ...fileHistories,
          [activeFileId]: { ...currentEntry, historyIndex: newIndex }
        },
        history: currentEntry.history,
        historyIndex: newIndex
      });

      saveState(nextLists, activeListId);
    }
  };
});
