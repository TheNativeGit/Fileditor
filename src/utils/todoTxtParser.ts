import { ToDoList, ToDoTask } from "../store/useToDoStore";

export const parseTodoTxtContent = (rawContent: string, listTitle: string): ToDoList[] => {
  const lines = rawContent.split(/\r?\n/);
  const tasks: ToDoTask[] = [];

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

  lines.forEach((rawLine, index) => {
    const trimmed = rawLine.trim();
    if (!trimmed) return;

    let remaining = trimmed;
    let completed = false;
    let priority: string | null = null;
    let completionDate: string | null = null;
    let creationDate: string | null = null;

    // 1. STATUS
    if (remaining.startsWith("x ")) {
      completed = true;
      remaining = remaining.substring(2).trim();
    }

    // 2. PRIORITÄT (z. B. "(A) ")
    const prioMatch = remaining.match(/^\(([A-Z])\)\s+/);
    if (prioMatch) {
      priority = prioMatch[1];
      remaining = remaining.substring(prioMatch[0].length).trim();
    }

    // 3. DATUMS-ERKENNUNG (YYYY-MM-DD) am Anfang nach Prio/Status
    const tokens = remaining.split(/\s+/);
    const datesFound: string[] = [];

    while (tokens.length > 0 && dateRegex.test(tokens[0])) {
      datesFound.push(tokens.shift()!);
    }
    remaining = tokens.join(" ");

    if (completed) {
      if (datesFound.length >= 1) completionDate = datesFound[0];
      if (datesFound.length >= 2) creationDate = datesFound[1];
    } else {
      if (datesFound.length >= 1) creationDate = datesFound[0];
    }

    // 4. TEXT & TAGS EXTRAKTION
    const projects: string[] = [];
    const contexts: string[] = [];
    const metadata: Record<string, string> = {};

    const words = remaining.split(/\s+/);
    words.forEach(w => {
      if (w.startsWith("+") && w.length > 1) {
        projects.push(w.substring(1));
      } else if (w.startsWith("@") && w.length > 1) {
        contexts.push(w.substring(1));
      } else if (w.includes(":") && !w.startsWith("http://") && !w.startsWith("https://")) {
        const [key, val] = w.split(":");
        if (key && val) {
          metadata[key] = val;
        }
      }
    });

    const taskId = `task_${Date.now()}_${index}_${Math.random().toString(36).substring(2, 5)}`;

    tasks.push({
      id: taskId,
      text: remaining,
      completed,
      indent: 0,
      tags: [],
      indicators: ["checkbox"],
      formatting: {}
    });
  });

  const listId = `list_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;

  return [
    {
      id: listId,
      title: listTitle || "Meine Aufgaben",
      tasks,
      createdAt: Date.now()
    }
  ];
};
