import DOMPurify from "dompurify";
import { useFileStore } from "../store/useFileStore";
import { normalizeFilePath } from "./todoLinkParser";
import { convertLocalFileSrc } from "./tauriBridge";

const escapeHtml = (str: string): string =>
  str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const sanitizeHtmlOutput = (dirtyHtml: string): string => {
  return DOMPurify.sanitize(dirtyHtml, {
    ADD_TAGS: [
      "details",
      "summary",
      "input",
      "svg",
      "path",
      "circle",
      "line",
      "ins",
      "del",
      "sub",
      "sup"
    ],
    ADD_ATTR: [
      "data-line",
      "data-col",
      "target",
      "rel",
      "open",
      "checked",
      "type",
      "viewBox",
      "fill",
      "stroke",
      "stroke-width",
      "stroke-linecap",
      "stroke-linejoin",
      "d",
      "cx",
      "cy",
      "r",
      "x1",
      "y1",
      "x2",
      "y2",
      "rowspan",
      "colspan"
    ],
    ALLOW_DATA_ATTR: true,
    ALLOW_UNKNOWN_PROTOCOLS: true,
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "meta", "link", "base"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "onmouseenter", "onmouseleave"]
  });
};

const convertTauriPath = (path: string): string => {
  if (/^(javascript|vbscript):/i.test(path.trim())) {
    return "";
  }
  if (/^(https?|data|file):/i.test(path)) {
    if (path.startsWith("file:///")) {
      const rawPath = path.substring(8);
      return convertLocalFileSrc(rawPath);
    }
    return path;
  }

  if (/^[a-zA-Z]:[/\\]/i.test(path) || path.startsWith("/") || path.includes("\\") || path.includes("/")) {
    return convertLocalFileSrc(path);
  }
  return path;
};

function highlightCode(code: string, lang: string): string {
  lang = lang.toLowerCase();
  if (!lang || lang === "text" || lang === "plaintext" || lang === "plain") {
    return code;
  }

  const placeholders: { [key: string]: string } = {};
  let placeholderCount = 0;

  const addPlaceholder = (content: string, klass: string) => {
    const id = `___TOKEN_ID_${placeholderCount++}___`;
    placeholders[id] = `<span class="${klass}">${content}</span>`;
    return id;
  };

  let workingCode = code;

  if (lang === "html" || lang === "xml" || lang === "svg" || lang === "xhtml") {
    workingCode = workingCode.replace(/(&lt;!--[\s\S]*?--&gt;)/g, (_, match) => addPlaceholder(match, "text-slate-500 italic"));
  } else if (lang === "python" || lang === "py" || lang === "ruby" || lang === "rb" || lang === "bash" || lang === "sh" || lang === "yaml" || lang === "yml") {
    workingCode = workingCode.replace(/(#[^\n]*)/g, (_, match) => addPlaceholder(match, "text-slate-500 italic"));
  } else if (lang === "sql") {
    workingCode = workingCode.replace(/(--[^\n]*)/g, (_, match) => addPlaceholder(match, "text-slate-500 italic"));
  } else {
    workingCode = workingCode.replace(/(\/\/[^\n]*)/g, (_, match) => addPlaceholder(match, "text-slate-500 italic"));
    workingCode = workingCode.replace(/(\/\*[\s\S]*?\*\/)/g, (_, match) => addPlaceholder(match, "text-slate-500 italic"));
  }

  workingCode = workingCode.replace(/("(\\.|[^"\\])*")/g, (_, match) => addPlaceholder(match, "text-emerald-400"));
  workingCode = workingCode.replace(/('(\\.|[^'\\])*')/g, (_, match) => addPlaceholder(match, "text-emerald-400"));
  workingCode = workingCode.replace(/(`(\\.|[^`\\])*`)/g, (_, match) => addPlaceholder(match, "text-emerald-400"));

  let keywords: string[] = [];
  if (lang === "js" || lang === "javascript" || lang === "ts" || lang === "typescript" || lang === "json") {
    keywords = ["const", "let", "var", "function", "class", "return", "if", "else", "for", "while", "do", "switch", "case", "break", "continue", "import", "export", "from", "default", "new", "this", "typeof", "instanceof", "in", "of", "async", "await", "yield", "try", "catch", "finally", "throw", "null", "undefined", "true", "false", "extends", "implements", "interface", "type", "readonly", "private", "public", "protected", "static", "package", "super", "get", "set"];
  } else if (lang === "csharp" || lang === "cs") {
    keywords = ["using", "namespace", "class", "struct", "interface", "enum", "delegate", "public", "private", "protected", "internal", "static", "readonly", "volatile", "virtual", "override", "abstract", "sealed", "partial", "void", "int", "uint", "long", "ulong", "short", "ushort", "byte", "sbyte", "char", "float", "double", "decimal", "bool", "string", "object", "dynamic", "var", "return", "if", "else", "switch", "case", "break", "continue", "for", "foreach", "while", "do", "new", "this", "base", "null", "true", "false", "try", "catch", "finally", "throw", "async", "await", "get", "set", "value", "out", "ref", "in"];
  } else if (lang === "java") {
    keywords = ["package", "import", "class", "interface", "enum", "extends", "implements", "public", "private", "protected", "static", "final", "abstract", "synchronized", "volatile", "transient", "native", "void", "int", "long", "short", "byte", "char", "float", "double", "boolean", "return", "if", "else", "switch", "case", "default", "break", "continue", "for", "while", "do", "new", "this", "super", "null", "true", "false", "try", "catch", "finally", "throw", "throws", "instanceof"];
  } else if (lang === "cpp" || lang === "c" || lang === "h" || lang === "hpp") {
    keywords = ["include", "define", "ifdef", "ifndef", "endif", "namespace", "using", "class", "struct", "union", "enum", "public", "private", "protected", "virtual", "override", "final", "inline", "static", "const", "constexpr", "volatile", "mutable", "friend", "typename", "template", "void", "int", "long", "short", "char", "float", "double", "bool", "signed", "unsigned", "auto", "return", "if", "else", "switch", "case", "default", "break", "continue", "for", "while", "do", "new", "delete", "this", "nullptr", "true", "false", "try", "catch", "throw", "sizeof", "typedef"];
  } else if (lang === "python" || lang === "py") {
    keywords = ["def", "class", "return", "if", "elif", "else", "for", "while", "break", "continue", "import", "from", "as", "global", "nonlocal", "lambda", "pass", "try", "except", "finally", "raise", "assert", "with", "yield", "in", "is", "and", "or", "not", "None", "True", "False", "del"];
  } else if (lang === "rust" || lang === "rs") {
    keywords = ["fn", "let", "mut", "pub", "use", "mod", "struct", "enum", "impl", "trait", "type", "const", "static", "return", "if", "else", "match", "loop", "while", "for", "break", "continue", "in", "as", "self", "Self", "unsafe", "where", "move", "dyn", "ref", "true", "false", "Some", "None", "Ok", "Err"];
  } else if (lang === "go") {
    keywords = ["package", "import", "func", "var", "const", "type", "struct", "interface", "map", "chan", "go", "select", "case", "default", "return", "if", "else", "switch", "fallthrough", "for", "range", "break", "continue", "goto", "defer", "nil", "true", "false"];
  } else if (lang === "sql") {
    keywords = ["select", "insert", "update", "delete", "from", "where", "join", "inner", "left", "right", "outer", "on", "group", "by", "having", "order", "asc", "desc", "into", "values", "set", "create", "table", "alter", "drop", "index", "view", "and", "or", "not", "null", "is", "in", "like", "between", "exists", "primary", "key", "foreign", "references", "default", "unique", "check"];
  } else if (lang === "css") {
    keywords = ["import", "media", "font-face", "keyframes", "supports", "hover", "focus", "active", "before", "after"];
  } else if (lang === "html" || lang === "xml" || lang === "svg" || lang === "xhtml") {
    workingCode = workingCode
      .replace(/(&lt;\/?[a-zA-Z0-9:-]+)/g, (_, match) => addPlaceholder(match, "text-sky-400 font-semibold"))
      .replace(/(\/?&gt;)/g, (_, match) => addPlaceholder(match, "text-sky-400 font-semibold"))
      .replace(/(\s[a-zA-Z0-9:-]+)(==|="|=)/g, (_, name, eq) => addPlaceholder(name, "text-amber-300") + eq);
  }

  if (keywords.length > 0) {
    const keywordRegex = new RegExp(`\\b(${keywords.join("|")})\\b`, "g");
    workingCode = workingCode.replace(keywordRegex, (_, match) => addPlaceholder(match, "text-purple-400 font-semibold"));
  }

  workingCode = workingCode.replace(/\b(\d+(\.\d+)?)\b/g, (_, match) => addPlaceholder(match, "text-blue-400"));

  let previousCode = "";
  while (previousCode !== workingCode) {
    previousCode = workingCode;
    for (const id in placeholders) {
      workingCode = workingCode.replace(id, placeholders[id]);
    }
  }

  return workingCode;
}

export const LATEX_SYMBOLS: Record<string, string> = {
  "rightarrow": "→",
  "to": "→",
  "longrightarrow": "⟶",
  "leftarrow": "←",
  "gets": "←",
  "longleftarrow": "⟵",
  "leftrightarrow": "↔",
  "longleftrightarrow": "⟷",
  "Rightarrow": "⇒",
  "implies": "⇒",
  "Longrightarrow": "⟹",
  "Leftarrow": "⇐",
  "Longleftarrow": "⟸",
  "Leftrightarrow": "⇔",
  "iff": "⇔",
  "Longleftrightarrow": "⟺",
  "uparrow": "↑",
  "downarrow": "↓",
  "updownarrow": "↕",
  "Uparrow": "⇑",
  "Downarrow": "⇓",
  "Updownarrow": "⇕",
  "nearrow": "↗",
  "searrow": "↘",
  "swarrow": "↙",
  "nwarrow": "↖",
  "mapsto": "↦",
  "longmapsto": "⟼",
  "hookrightarrow": "↪",
  "hookleftarrow": "↩",
  "rightharpoonup": "⇀",
  "rightharpoondown": "⇁",
  "leftharpoonup": "↼",
  "leftharpoondown": "⇃",
  "rightleftharpoons": "⇌",
  "approx": "≈",
  "sim": "∼",
  "simeq": "≃",
  "cong": "≅",
  "equiv": "≡",
  "neq": "≠",
  "ne": "≠",
  "le": "≤",
  "leq": "≤",
  "ge": "≥",
  "geq": "≥",
  "ll": "≪",
  "gg": "≫",
  "prec": "≺",
  "succ": "≻",
  "preceq": "⪯",
  "succeq": "⪰",
  "propto": "∝",
  "parallel": "∥",
  "perp": "⊥",
  "doteq": "≐",
  "times": "×",
  "div": "÷",
  "pm": "±",
  "mp": "∓",
  "cdot": "·",
  "circ": "∘",
  "bullet": "•",
  "star": "★",
  "ast": "∗",
  "sqrt": "√",
  "in": "∈",
  "notin": "∉",
  "ni": "∋",
  "subset": "⊂",
  "supset": "⊃",
  "subseteq": "⊆",
  "supseteq": "⊇",
  "cap": "∩",
  "cup": "∪",
  "setminus": "∖",
  "emptyset": "∅",
  "varnothing": "∅",
  "forall": "∀",
  "exists": "∃",
  "nexists": "∄",
  "neg": "¬",
  "lnot": "¬",
  "land": "∧",
  "wedge": "∧",
  "lor": "∨",
  "vee": "∨",
  "top": "⊤",
  "bot": "⊥",
  "infty": "∞",
  "partial": "∂",
  "nabla": "∇",
  "sum": "∑",
  "prod": "∏",
  "coprod": "∐",
  "int": "∫",
  "iint": "∬",
  "iiint": "∭",
  "oint": "∮",
  "dots": "…",
  "ldots": "…",
  "cdots": "⋯",
  "vdots": "⋮",
  "ddots": "⋱",
  "checkmark": "✓",
  "check": "✓",
  "dagger": "†",
  "ddagger": "‡",
  "degree": "°",
  "deg": "°",
  "angle": "∠",
  "prime": "′",
  "hbar": "ℏ",
  "ell": "ℓ",
  "Re": "ℜ",
  "Im": "ℑ",
  "wp": "℘",
  "aleph": "ℵ",
  "diamondsuit": "♦",
  "heartsuit": "♥",
  "clubsuit": "♣",
  "spadesuit": "♠",
  "flat": "♭",
  "natural": "♮",
  "sharp": "♯",
  "alpha": "α",
  "beta": "β",
  "gamma": "γ",
  "delta": "δ",
  "epsilon": "ε",
  "varepsilon": "ε",
  "zeta": "ζ",
  "eta": "η",
  "theta": "θ",
  "vartheta": "ϑ",
  "iota": "ι",
  "kappa": "κ",
  "lambda": "λ",
  "mu": "μ",
  "nu": "ν",
  "xi": "ξ",
  "pi": "π",
  "varpi": "ϖ",
  "rho": "ρ",
  "varrho": "ϱ",
  "sigma": "σ",
  "varsigma": "ς",
  "tau": "τ",
  "upsilon": "υ",
  "phi": "φ",
  "varphi": "ϕ",
  "chi": "χ",
  "psi": "ψ",
  "omega": "ω",
  "Gamma": "Γ",
  "Delta": "Δ",
  "Theta": "Θ",
  "Lambda": "Λ",
  "Xi": "Ξ",
  "Pi": "Π",
  "Sigma": "Σ",
  "Upsilon": "Υ",
  "Phi": "Φ",
  "Psi": "Ψ",
  "Omega": "Ω"
};

export function renderMarkdownToHtml(md: string): string {
  if (!md) return "";

  let mdContent = md;
  const frontmatterRegex = /^---[\r\n]+([\s\S]*?)[\r\n]+---[\r\n]*/;
  const fmMatch = mdContent.match(frontmatterRegex);
  if (fmMatch && (fmMatch[1].includes(":") || fmMatch[1].trim() === "")) {
    mdContent = mdContent.slice(fmMatch[0].length);
  }

  const lines = mdContent.split(/\r?\n/);
  let html = "";
  let inBlockquote = false;
  let inCodeBlock = false;
  let codeContent = "";
  let codeLang = "";
  let codeTitle = "";
  let inDetails = false;
  let inTable = false;
  let tableHeaders: string[] = [];
  let tableRows: { cells: string[]; line: number }[] = [];
  let tableStartLine = 0;
  let inAdmonition = false;

  interface ActiveListLevel {
    type: "ul" | "ol";
    indent: number;
    level: number;
    lastNumber?: number;
  }
  let listLevels: ActiveListLevel[] = [];

  const closeDetails = () => {
    if (inDetails) {
      html += "</div></details>";
      inDetails = false;
    }
  };

  const closeList = () => {
    listLevels = [];
  };

  const closeBlockquote = () => {
    if (inBlockquote) {
      html += "</blockquote>";
      inBlockquote = false;
    }
  };

  const closeTable = () => {
    if (inTable) {
      html += '<div class="overflow-x-auto my-4 border border-slate-800 rounded-lg bg-slate-900/30"><table class="min-w-full divide-y divide-slate-800 text-left text-xs font-mono">';
      if (tableHeaders.length > 0) {
        html += '<thead class="bg-slate-950/50 text-slate-400 font-semibold">';
        html += `<tr data-line="${tableStartLine}">`;
        tableHeaders.forEach((h, hIdx) => {
          html += `<th data-col="${hIdx}" class="px-4 py-2 border-b border-slate-800">${parseInline(h)}</th>`;
        });
        html += '</tr></thead>';
      }
      html += '<tbody class="divide-y divide-slate-800/50 text-slate-350">';

      interface TableGridCell {
        text: string;
        rowspan: number;
        isCovered: boolean;
      }

      const grid: TableGridCell[][] = tableRows.map(row =>
        row.cells.map(cell => ({
          text: cell,
          rowspan: 1,
          isCovered: false
        }))
      );

      const colCount = Math.max(tableHeaders.length, ...grid.map(r => r.length));
      for (let c = 0; c < colCount; c++) {
        let rootRow = 0;
        for (let r = 0; r < grid.length; r++) {
          if (!grid[r] || grid[r][c] === undefined) continue;
          const trimmedCell = grid[r][c].text.trim();
          if ((trimmedCell === "^^" || trimmedCell === "^") && r > 0) {
            grid[rootRow][c].rowspan += 1;
            grid[r][c].isCovered = true;
          } else {
            rootRow = r;
          }
        }
      }

      grid.forEach((row, rIdx) => {
        const rowLine = tableRows[rIdx] ? tableRows[rIdx].line : tableStartLine;
        html += `<tr data-line="${rowLine}" class="hover:bg-slate-900/40 divide-x divide-slate-800/30">`;
        let colIdx = 0;
        row.forEach(cell => {
          if (!cell.isCovered) {
            const rowspanAttr = cell.rowspan > 1 ? ` rowspan="${cell.rowspan}"` : "";
            html += `<td data-col="${colIdx}"${rowspanAttr} class="px-4 py-2.5 align-top border-slate-800/40">${parseInline(cell.text)}</td>`;
          }
          colIdx++;
        });
        html += "</tr>";
      });

      html += "</tbody></table></div>";
      inTable = false;
      tableHeaders = [];
      tableRows = [];
      tableStartLine = 0;
    }
  };

  const parseInline = (text: string): string => {
    const codePlaceholders: string[] = [];

    let t = text.replace(/`([^`\n]+)`/g, (_match, codeText) => {
      const placeholder = `XICODETOKEN${codePlaceholders.length}XICODETOKEN`;
      const escapedCode = escapeHtml(codeText);
      codePlaceholders.push(`<code class="bg-slate-950/60 border border-slate-800/80 px-1 py-0.5 rounded font-mono text-[0.9em] mx-0.5 inline-block vertical-baseline" style="color: var(--color-preview-inline-code, #fb7185);">${escapedCode}</code>`);
      return placeholder;
    });

    t = t
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

    t = t
      .replace(/&lt;u&gt;/gi, "<u>")
      .replace(/&lt;\/u&gt;/gi, "</u>")
      .replace(/&lt;ins&gt;/gi, "<ins>")
      .replace(/&lt;\/ins&gt;/gi, "</ins>")
      .replace(/&lt;br\s*\/?&gt;/gi, "<br/>")
      .replace(/&lt;sub&gt;/gi, "<sub>")
      .replace(/&lt;\/sub&gt;/gi, "</sub>")
      .replace(/&lt;sup&gt;/gi, "<sup>")
      .replace(/&lt;\/sup&gt;/gi, "</sup>");

    try {
      const state = useFileStore.getState();
      if (state && state.dateSupport) {
        t = t.replace(/&lt;t:(\d+):([FfDdTtRsS])&gt;/g, (match, tsStr, type) => {
          const ts = parseInt(tsStr, 10) * 1000;
          const date = new Date(ts);
          if (isNaN(date.getTime())) return match;

          let formatted = "";
          if (type === "t") {
            formatted = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          } else if (type === "T") {
            formatted = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
          } else if (type === "d") {
            formatted = date.toLocaleDateString([], { day: "2-digit", month: "2-digit", year: "numeric" });
          } else if (type === "D") {
            formatted = date.toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" });
          } else if (type === "f") {
            const dStr = date.toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" });
            const tStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            formatted = `${dStr} ${tStr}`;
          } else if (type === "F") {
            const dStr = date.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: "numeric" });
            const tStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            formatted = `${dStr} ${tStr}`;
          } else if (type === "R") {
            const now = Date.now();
            const diffMs = ts - now;
            const diffSec = Math.round(diffMs / 1000);
            const diffMin = Math.round(diffSec / 60);
            const diffHour = Math.round(diffMin / 60);
            const diffDay = Math.round(diffHour / 24);
            const diffMonth = Math.round(diffDay / 30);
            const diffYear = Math.round(diffMonth / 12);

            const isFuture = diffMs > 0;
            const absSec = Math.abs(diffSec);
            const absMin = Math.abs(diffMin);
            const absHour = Math.abs(diffHour);
            const absDay = Math.abs(diffDay);
            const absMonth = Math.abs(diffMonth);
            const absYear = Math.abs(diffYear);

            if (absSec < 60) {
              formatted = isFuture ? `in ${absSec}s` : `${absSec}s ago`;
            } else if (absMin < 60) {
              formatted = isFuture ? `in ${absMin}m` : `${absMin}m ago`;
            } else if (absHour < 24) {
              formatted = isFuture ? `in ${absHour}h` : `${absHour}h ago`;
            } else if (absDay < 30) {
              formatted = isFuture ? `in ${absDay}d` : `${absDay}d ago`;
            } else if (absMonth < 12) {
              formatted = isFuture ? `in ${absMonth}mo` : `${absMonth}mo ago`;
            } else {
              formatted = isFuture ? `in ${absYear}y` : `${absYear}y ago`;
            }
          } else {
            formatted = date.toLocaleString();
          }

          return `<span class="px-1.5 py-0.5 rounded border font-mono text-[0.85em] inline-flex items-center gap-1 shadow-sm select-all" style="background-color: rgba(var(--color-primary-accent-rgb, 168, 85, 247), 0.14); border-color: rgba(var(--color-primary-accent-rgb, 168, 85, 247), 0.35); color: var(--color-primary-accent, #a855f7);" title="Discord Timestamp: &lt;t:${tsStr}:${type}&gt;"><span class="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style="background-color: var(--color-primary-accent, #a855f7);"></span>${escapeHtml(formatted)}</span>`;
        });

        t = t.replace(/@date\((.*?)\)/g, (match, dateStr) => {
          const raw = dateStr.replace(/&quot;/g, '"');
          const date = new Date(raw.trim());
          if (isNaN(date.getTime())) return match;
          const formatted = date.toLocaleString();
          return `<span class="px-1.5 py-0.5 rounded bg-sky-950/45 border border-sky-500/20 text-sky-300 font-mono text-[0.85em] inline-flex items-center gap-1 shadow-sm select-all" title="Date: ${escapeHtml(raw)}"><span class="inline-block w-1.5 h-1.5 rounded-full bg-sky-400"></span>${escapeHtml(formatted)}</span>`;
        });
      }
    } catch (e) {
      console.error("Date parser error:", e);
    }

    const replaceLatexInString = (str: string): string => {
      return str.replace(/\\([a-zA-Z]+)/g, (fullMatch, cmd) => {
        if (LATEX_SYMBOLS[cmd]) {
          return LATEX_SYMBOLS[cmd];
        }
        return fullMatch;
      });
    };

    t = t.replace(/\$\$([\s\S]+?)\$\$/g, (_match, inner) => {
      const resolved = replaceLatexInString(inner).replace(/\\text\{([^}]*)\}/g, "$1");
      return `<span class="font-serif italic px-1 font-medium" style="color: var(--color-primary-accent, #c084fc);">${resolved.trim()}</span>`;
    });

    t = t.replace(/\$([^\$\n]+)\$/g, (match, inner) => {
      if (/\\([a-zA-Z]+)/.test(inner) || LATEX_SYMBOLS[inner.trim()]) {
        const resolved = replaceLatexInString(inner).replace(/\\text\{([^}]*)\}/g, "$1");
        return `<span class="font-serif italic px-0.5 font-medium" style="color: var(--color-primary-accent, #c084fc);">${resolved.trim()}</span>`;
      }
      return match;
    });

    t = t.replace(/\\([a-zA-Z]+)/g, (fullMatch, cmd) => {
      if (LATEX_SYMBOLS[cmd]) {
        return LATEX_SYMBOLS[cmd];
      }
      return fullMatch;
    });

    t = t
      .replace(/-&gt;/g, "&rarr;")
      .replace(/&lt;-/g, "&larr;")
      .replace(/=&gt;/g, "&rArr;")
      .replace(/&lt;=/g, "&lArr;");

    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-bold text-white">$1</strong>');
    t = t.replace(/__([^_]+)__/g, '<strong class="font-bold text-white">$1</strong>');
    t = t.replace(/\*([^*]+)\*/g, '<em class="italic text-slate-250">$1</em>');
    t = t.replace(/_([^_]+)_/g, '<em class="italic text-slate-250">$1</em>');
    t = t.replace(/~~([^~]+)~~/g, '<del class="line-through text-slate-500">$1</del>');

    t = t.replace(/!\[(.*?)\]\((.*?)\)/g, (_match, alt, url) => {
      const decodedUrl = url.replace(/&quot;/g, '"').trim().replace(/^["']|["']$/g, "");
      const resolvedUrl = convertTauriPath(decodedUrl);
      const safeSrc = escapeHtml(resolvedUrl);
      return `<img src="${safeSrc}" alt="${alt}" class="max-w-full h-auto rounded border border-slate-800 my-2 shadow-sm inline-block" />`;
    });

    t = t.replace(/\[(.*?)\]\((.*?)\)/g, (_match, textContent, url) => {
      let cleanUrl = url.replace(/&quot;/g, '"').trim().replace(/^["']|["']$/g, "");
      if (/^(javascript|vbscript|data):/i.test(cleanUrl)) {
        cleanUrl = "#";
      } else {
        cleanUrl = normalizeFilePath(cleanUrl);
      }
      const safeUrl = escapeHtml(cleanUrl);
      return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="hover:underline" style="color: var(--color-preview-link, #c084fc);">${textContent}</a>`;
    });

    t = t.replace(/XICODETOKEN(\d+)XICODETOKEN/g, (_, idx) => codePlaceholders[parseInt(idx, 10)]);

    return t;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      if (inCodeBlock) {
        const safeLang = codeLang.replace(/[^a-zA-Z0-9_+-]/g, "");
        const highlighted = highlightCode(codeContent.trim(), safeLang);
        if (codeTitle) {
          const escapedTitle = escapeHtml(codeTitle);
          html += `<div data-line="${i}" class="my-4 rounded-lg border border-slate-800 bg-[#0d131f] overflow-hidden shadow-md">
            <div class="flex items-center justify-between px-3.5 py-1.5 bg-[#080d16] border-b border-slate-800 text-xs font-mono text-slate-300 select-none">
              <div class="flex items-center gap-2 text-slate-300 font-medium">
                <span class="text-purple-400 font-bold">📄</span>
                <span>${escapedTitle}</span>
              </div>
              <span class="text-[10px] text-slate-500 font-mono uppercase tracking-wider font-semibold">${escapeHtml(safeLang || "text")}</span>
            </div>
            <pre class="p-3.5 overflow-x-auto font-mono text-xs text-slate-200"><code class="language-${safeLang}">${highlighted}</code></pre>
          </div>`;
        } else {
          html += `<pre data-line="${i}" class="bg-slate-900 border border-slate-855 p-3 rounded-lg overflow-x-auto my-3 font-mono text-xs text-slate-200"><code class="language-${safeLang}">${highlighted}</code></pre>`;
        }
        inCodeBlock = false;
        codeContent = "";
        codeLang = "";
        codeTitle = "";
      } else {
        closeList();
        closeBlockquote();
        closeTable();
        closeDetails();
        inCodeBlock = true;
        const info = trimmed.slice(3).trim();
        let title = "";
        const titleMatch = info.match(/\btitle=(?:"([^"]+)"|'([^']+)'|([^\s]+))/i);
        if (titleMatch) {
          title = titleMatch[1] || titleMatch[2] || titleMatch[3] || "";
        }
        codeTitle = title;
        codeLang = info.replace(/\btitle=(?:"[^"]*"|'[^']*'|[^\s]+)/gi, "").trim().split(/\s+/)[0] || "";
      }
      continue;
    }

    if (!inCodeBlock) {
      if (/^<details\b/i.test(trimmed)) {
        closeList();
        closeBlockquote();
        closeTable();
        const isOpen = /\bopen\b/i.test(trimmed);
        html += `<details data-line="${i}" class="docusaurus-details my-3.5"${isOpen ? " open" : ""}>`;
        inDetails = true;
        continue;
      }
      if (/^<\/?details\b/i.test(trimmed) || /^<\\details\b/i.test(trimmed)) {
        closeList();
        closeBlockquote();
        closeTable();
        closeDetails();
        continue;
      }
      if (inDetails && /^<summary\b/i.test(trimmed)) {
        const summaryMatch = trimmed.match(/^<summary\b[^>]*>([\s\S]*?)<\/summary>/i) || trimmed.match(/^<summary\b[^>]*>([\s\S]*?)<\\summary>/i);
        if (summaryMatch) {
          const summaryText = summaryMatch[1];
          html += `<summary>${parseInline(summaryText)}</summary><div class="docusaurus-details-content">`;
        } else {
          const contentAfterTag = trimmed.replace(/^<summary\b[^>]*>/i, "");
          html += `<summary>${parseInline(contentAfterTag)}</summary><div class="docusaurus-details-content">`;
        }
        continue;
      }
      if (inDetails && (/^<\/summary>/i.test(trimmed) || /^<\\summary>/i.test(trimmed))) {
        continue;
      }
    }

    if (!inCodeBlock) {
      if (trimmed === ":::") {
        if (inAdmonition) {
          html += "</div></div>";
          inAdmonition = false;
          continue;
        }
      } else {
        const admonitionMatch = trimmed.match(/^:::(tip|info|note|warning|danger|caution|important)(?:\[(.*?)\])?(?:\s+(.*))?$/i);
        if (admonitionMatch) {
          try {
            const state = useFileStore.getState();
            if (state && state.docusaurusSupport) {
              closeList();
              closeBlockquote();
              closeTable();
              if (inAdmonition) {
                html += "</div></div>";
              }
              inAdmonition = true;
              const type = admonitionMatch[1].toLowerCase();
              const customTitle = escapeHtml(admonitionMatch[2] || admonitionMatch[3] || "");

              if (type === "tip") {
                const title = customTitle || "TIP";
                html += `<div data-line="${i}" class="my-4 p-4 border-l-4 border-emerald-500/60 bg-emerald-950/10 rounded-r-lg text-xs leading-relaxed select-all">
                  <div class="flex items-center gap-1.5 font-bold mb-2 text-emerald-400 select-none">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="shrink-0"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>
                    <span>${title}</span>
                  </div>
                  <div class="text-slate-300 space-y-1">`;
              } else if (type === "info" || type === "note") {
                const title = customTitle || (type === "note" ? "NOTE" : "INFO");
                html += `<div data-line="${i}" class="my-4 p-4 border-l-4 border-blue-500/60 bg-blue-950/10 rounded-r-lg text-xs leading-relaxed select-all">
                  <div class="flex items-center gap-1.5 font-bold mb-2 text-blue-400 select-none">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="shrink-0"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                    <span>${title}</span>
                  </div>
                  <div class="text-slate-300 space-y-1">`;
              } else if (type === "warning" || type === "caution") {
                const title = customTitle || (type === "caution" ? "CAUTION" : "WARNING");
                html += `<div data-line="${i}" class="my-4 p-4 border-l-4 border-amber-500/60 bg-amber-950/10 rounded-r-lg text-xs leading-relaxed select-all">
                  <div class="flex items-center gap-1.5 font-bold mb-2 text-amber-400 select-none">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="shrink-0"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
                    <span>${title}</span>
                  </div>
                  <div class="text-slate-300 space-y-1">`;
              } else if (type === "danger" || type === "important") {
                const title = customTitle || (type === "important" ? "IMPORTANT" : "DANGER");
                html += `<div data-line="${i}" class="my-4 p-4 border-l-4 border-red-500/60 bg-red-950/10 rounded-r-lg text-xs leading-relaxed select-all">
                  <div class="flex items-center gap-1.5 font-bold mb-2 text-red-400 select-none">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="shrink-0"><path d="m12 14 4 6H8L12 14z"/><path d="M12 2v10"/><path d="m17 22-5-6-5 6"/></svg>
                    <span>${title}</span>
                  </div>
                  <div class="text-slate-300 space-y-1">`;
              }
              continue;
            }
          } catch {}
        }
      }
    }

    if (inCodeBlock) {
      const escapedLine = line
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      codeContent += escapedLine + "\n";
      continue;
    }

    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      closeList();
      closeBlockquote();

      const cells = trimmed.split("|").slice(1, -1).map(c => c.trim());

      if (!inTable) {
        const nextLine = lines[i + 1] ? lines[i + 1].trim() : "";
        if (nextLine.startsWith("|") && nextLine.includes("-") && nextLine.endsWith("|")) {
          inTable = true;
          tableHeaders = cells;
          tableStartLine = i;
          i++;
          continue;
        }
      }

      if (inTable) {
        tableRows.push({ cells, line: i });
        continue;
      }
    }

    closeTable();

    if (trimmed.startsWith("#")) {
      closeList();
      closeBlockquote();
      const match = trimmed.match(/^(#{1,6})\s+(.*)$/);
      if (match) {
        const level = match[1].length;
        const text = match[2];
        const inlineHtml = parseInline(text);
        if (level === 1) {
          html += `<h1 data-line="${i}" id="heading-line-${i}" class="text-xl font-bold mt-6 mb-3 border-b border-slate-800 pb-2" style="color: var(--color-preview-heading, #ffffff);">${inlineHtml}</h1>`;
        } else if (level === 2) {
          html += `<h2 data-line="${i}" id="heading-line-${i}" class="text-lg font-bold mt-5 mb-2.5 border-b border-slate-855 pb-1.5" style="color: var(--color-preview-heading, #f1f5f9);">${inlineHtml}</h2>`;
        } else if (level === 3) {
          html += `<h3 data-line="${i}" id="heading-line-${i}" class="text-base font-bold mt-4 mb-2" style="color: var(--color-preview-heading, #e2e8f0);">${inlineHtml}</h3>`;
        } else if (level === 4) {
          html += `<h4 data-line="${i}" id="heading-line-${i}" class="text-sm font-bold text-slate-350 mt-3.5 mb-1.5">${inlineHtml}</h4>`;
        } else {
          html += `<h5 data-line="${i}" id="heading-line-${i}" class="text-xs font-bold text-slate-400 mt-3 mb-1">${inlineHtml}</h5>`;
        }
        continue;
      }
    }

    if (trimmed.startsWith(">")) {
      closeList();
      if (!inBlockquote) {
        html += `<blockquote data-line="${i}" class="border-l-4 px-4 py-2 my-3 rounded-r text-slate-400 italic" style="border-left-color: var(--color-primary-accent, #a855f7); background-color: rgba(var(--color-primary-accent-rgb, 168, 85, 247), 0.08);">`;
        inBlockquote = true;
      }
      const quoteText = trimmed.slice(1).trim();
      html += parseInline(quoteText) + "<br/>";
      continue;
    }
    closeBlockquote();

    if (/^<\/?(table|thead|tbody|tr|th|td)\b/i.test(trimmed)) {
      closeList();
      closeBlockquote();
      closeTable();
      // Sanitized later by DOMPurify so safe HTML tables work while event handlers/scripts are stripped
      html += line;
      continue;
    }

    const indentMatch = line.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[0].length : 0;
    const lineWithoutIndent = line.slice(indent);

    let isUl = false;
    let ulContent = "";
    if (lineWithoutIndent.startsWith("- ") || lineWithoutIndent.startsWith("* ") || lineWithoutIndent.startsWith("+ ")) {
      isUl = true;
      ulContent = lineWithoutIndent.slice(2);
    }

    let isOl = false;
    let olContent = "";
    let olNumber = "";
    const olMatch = lineWithoutIndent.match(/^(\d+)\.\s+(.*)$/);
    if (olMatch) {
      isOl = true;
      olNumber = olMatch[1];
      olContent = olMatch[2];
    }

    if (isOl) {
      closeBlockquote();
      closeTable();
      const currentNumber = parseInt(olNumber, 10);
      let level = 0;

      while (
        listLevels.length > 0 &&
        indent < listLevels[listLevels.length - 1].indent - 1
      ) {
        listLevels.pop();
      }

      if (listLevels.length === 0) {
        level = indent >= 2 ? Math.floor(indent / 2) : 0;
        listLevels.push({ type: "ol", indent, level, lastNumber: currentNumber });
      } else {
        const top = listLevels[listLevels.length - 1];
        if (top.type === "ol") {
          if (indent >= top.indent + 2) {
            level = top.level + 1;
            listLevels.push({ type: "ol", indent, level, lastNumber: currentNumber });
          } else {
            level = top.level;
            top.lastNumber = currentNumber;
          }
        } else {
          const parentOlIdx = currentNumber > 1
            ? listLevels.findIndex(l => l.type === "ol" && l.indent <= indent + 1)
            : -1;
          if (parentOlIdx !== -1) {
            listLevels = listLevels.slice(0, parentOlIdx + 1);
            level = listLevels[parentOlIdx].level;
            listLevels[parentOlIdx].lastNumber = currentNumber;
          } else if (indent >= top.indent + 2) {
            level = top.level + 1;
            listLevels.push({ type: "ol", indent, level, lastNumber: currentNumber });
          } else {
            level = top.level;
            top.type = "ol";
            top.lastNumber = currentNumber;
          }
        }
      }

      const indentPadding = 20 + level * 24;
      const itemText = olContent.trim();
      html += `<div data-line="${i}" class="md-list-item my-1 text-slate-300 font-sans text-[1em] flex items-start leading-relaxed" style="padding-left: ${indentPadding}px"><span class="font-sans text-[1em] text-slate-400 shrink-0 mr-2 font-normal min-w-[1.25rem] text-right leading-relaxed">${olNumber}.</span><span class="flex-1">${parseInline(itemText)}</span></div>`;
      continue;
    }

    if (isUl) {
      closeBlockquote();
      closeTable();
      let level = 0;

      while (
        listLevels.length > 0 &&
        indent < listLevels[listLevels.length - 1].indent - 1
      ) {
        listLevels.pop();
      }

      if (listLevels.length === 0) {
        level = indent >= 2 ? Math.floor(indent / 2) : 0;
        listLevels.push({ type: "ul", indent, level });
      } else {
        const top = listLevels[listLevels.length - 1];
        if (top.type === "ul") {
          if (indent >= top.indent + 2) {
            level = top.level + 1;
            listLevels.push({ type: "ul", indent, level });
          } else {
            level = top.level;
          }
        } else {
          const parentUlIdx = listLevels.findIndex(l => l.type === "ul" && Math.abs(l.indent - indent) <= 1);
          if (parentUlIdx !== -1) {
            listLevels = listLevels.slice(0, parentUlIdx + 1);
            level = listLevels[parentUlIdx].level;
          } else {
            level = top.level + 1;
            listLevels.push({ type: "ul", indent, level });
          }
        }
      }

      const indentPadding = 20 + level * 24;
      const itemText = ulContent.trim();

      if (itemText.startsWith("[ ]")) {
        html += `<div data-line="${i}" class="md-list-item list-none flex items-center gap-2 my-1 leading-relaxed" style="padding-left: ${indentPadding}px"><input type="checkbox" class="preview-checkbox shrink-0 rounded border-slate-700 bg-slate-800 focus:ring-0 focus:ring-offset-0 h-3.5 w-3.5 cursor-pointer" style="accent-color: var(--color-primary-accent, #a855f7);" /> <span class="text-slate-350 font-sans text-[1em]">${parseInline(itemText.slice(3).trim())}</span></div>`;
      } else if (itemText.startsWith("[x]") || itemText.startsWith("[X]")) {
        html += `<div data-line="${i}" class="md-list-item list-none flex items-center gap-2 my-1 leading-relaxed" style="padding-left: ${indentPadding}px"><input type="checkbox" checked class="preview-checkbox shrink-0 rounded border-slate-700 bg-slate-800 focus:ring-0 focus:ring-offset-0 h-3.5 w-3.5 cursor-pointer" style="accent-color: var(--color-primary-accent, #a855f7);" /> <span class="line-through text-slate-500 font-sans text-[1em]">${parseInline(itemText.slice(3).trim())}</span></div>`;
      } else {
        html += `<div data-line="${i}" class="md-list-item my-1 text-slate-300 font-sans text-[1em] flex items-start leading-relaxed" style="padding-left: ${indentPadding}px"><span class="font-sans text-[1.1em] text-slate-400 shrink-0 mr-2 select-none min-w-[1.25rem] text-center leading-none mt-1">•</span><span class="flex-1">${parseInline(itemText)}</span></div>`;
      }
      continue;
    }

    if (trimmed === "---") {
      closeList();
      closeBlockquote();
      closeTable();
      html += `<div data-line="${i}" class="h-4 my-1 select-none"></div>`;
      continue;
    }

    if (!trimmed) {
      closeList();
      continue;
    }

    closeList();
    html += `<p data-line="${i}" class="my-2.5 text-[1em] text-slate-300 font-sans leading-relaxed">${parseInline(trimmed)}</p>`;
  }

  closeList();
  closeBlockquote();
  closeTable();
  closeDetails();
  if (inAdmonition) {
    html += "</div></div>";
  }

  return sanitizeHtmlOutput(html);
}

/**
 * Renders Markdown into pristine, 100% vector-compatible light-mode HTML
 * specially designed for printing and PDF export, sanitized via DOMPurify.
 */
export function renderMarkdownForPrint(md: string): string {
  if (!md) return "";

  let mdContent = md;
  const frontmatterRegex = /^---[\r\n]+([\s\S]*?)[\r\n]+---[\r\n]*/;
  const fmMatch = mdContent.match(frontmatterRegex);
  if (fmMatch && (fmMatch[1].includes(":") || fmMatch[1].trim() === "")) {
    mdContent = mdContent.slice(fmMatch[0].length);
  }

  const lines = mdContent.split(/\r?\n/);
  let html = "";
  let inBlockquote = false;
  let inCodeBlock = false;
  let codeContent = "";
  let codeLang = "";
  let codeTitle = "";
  let inTable = false;
  let tableHeaders: string[] = [];
  let tableRows: string[][] = [];
  let inAdmonition = false;
  let listStack: ("ul" | "ol")[] = [];
  interface PrintListLevel {
    type: "ul" | "ol";
    indent: number;
    level: number;
    lastNumber?: number;
  }
  let printListLevels: PrintListLevel[] = [];

  const closeListTags = () => {
    while (listStack.length > 0) {
      const top = listStack.pop();
      html += top === "ul" ? "</ul>" : "</ol>";
    }
  };

  const closeList = () => {
    closeListTags();
    printListLevels = [];
  };

  const closeBlockquote = () => {
    if (inBlockquote) {
      html += "</blockquote>";
      inBlockquote = false;
    }
  };

  const closeTable = () => {
    if (inTable) {
      html += '<div class="print-table-wrapper"><table class="print-table">';
      if (tableHeaders.length > 0) {
        html += "<thead><tr>";
        for (const h of tableHeaders) {
          html += `<th>${parseInlinePrint(h)}</th>`;
        }
        html += "</tr></thead>";
      }
      html += "<tbody>";
      for (const row of tableRows) {
        html += "<tr>";
        for (const cell of row) {
          html += `<td>${parseInlinePrint(cell)}</td>`;
        }
        html += "</tr>";
      }
      html += "</tbody></table></div>";
      inTable = false;
      tableHeaders = [];
      tableRows = [];
    }
  };

  const parseInlinePrint = (text: string): string => {
    const codePlaceholders: string[] = [];
    let t = text.replace(/`([^`\n]+)`/g, (_, codeText) => {
      const placeholder = `XICODETOKEN${codePlaceholders.length}XICODETOKEN`;
      codePlaceholders.push(`<code class="print-inline-code">${escapeHtml(codeText)}</code>`);
      return placeholder;
    });

    t = t
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

    t = t
      .replace(/&lt;u&gt;/gi, "<u>")
      .replace(/&lt;\/u&gt;/gi, "</u>")
      .replace(/&lt;ins&gt;/gi, "<ins>")
      .replace(/&lt;\/ins&gt;/gi, "</ins>")
      .replace(/&lt;br\s*\/?&gt;/gi, "<br/>")
      .replace(/&lt;sub&gt;/gi, "<sub>")
      .replace(/&lt;\/sub&gt;/gi, "</sub>")
      .replace(/&lt;sup&gt;/gi, "<sup>")
      .replace(/&lt;\/sup&gt;/gi, "</sup>");

    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong class="print-bold">$1</strong>');
    t = t.replace(/__([^_]+)__/g, '<strong class="print-bold">$1</strong>');
    t = t.replace(/\*([^*]+)\*/g, '<em class="print-italic">$1</em>');
    t = t.replace(/_([^_]+)_/g, '<em class="italic">$1</em>');
    t = t.replace(/~~([^~]+)~~/g, '<del class="print-del">$1</del>');

    t = t.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => {
      const rawUrl = url.replace(/&quot;/g, '"').trim();
      const safeUrl = escapeHtml(convertTauriPath(rawUrl));
      return `<img src="${safeUrl}" alt="${alt}" style="max-width: 100%; height: auto; margin: 6pt 0; display: block;" />`;
    });

    t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label) => {
      return `<span class="print-link">${label}</span>`;
    });

    codePlaceholders.forEach((codeHtml, idx) => {
      t = t.replace(`XICODETOKEN${idx}XICODETOKEN`, codeHtml);
    });

    return t;
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (trimmed.startsWith("```")) {
      if (inCodeBlock) {
        const escaped = escapeHtml(codeContent);
        const safeHeader = escapeHtml(codeTitle || codeLang || "Code");
        html += `<div class="print-code-block"><div class="print-code-header"><span>${safeHeader}</span></div><pre class="print-pre"><code>${escaped}</code></pre></div>`;
        inCodeBlock = false;
        codeContent = "";
        codeLang = "";
        codeTitle = "";
      } else {
        closeList();
        closeBlockquote();
        closeTable();
        inCodeBlock = true;
        const rest = trimmed.slice(3).trim();
        const parts = rest.split(/\s+/);
        codeLang = parts[0] || "text";
        codeTitle = parts.slice(1).join(" ");
      }
      continue;
    }

    if (inCodeBlock) {
      codeContent += (codeContent ? "\n" : "") + rawLine;
      continue;
    }

    if (trimmed.startsWith(":::")) {
      if (inAdmonition) {
        html += "</div></div>";
        inAdmonition = false;
      } else {
        closeList();
        closeBlockquote();
        closeTable();
        const typeMatch = trimmed.slice(3).trim().split(/\s+/);
        const admType = (typeMatch[0]?.toLowerCase() || "note").replace(/[^a-z]/g, "");
        const admTitle = escapeHtml(typeMatch.slice(1).join(" ") || admType.toUpperCase());
        html += `<div class="print-admonition print-admonition-${admType}"><div class="print-admonition-title">${admTitle}</div><div class="print-admonition-content">`;
        inAdmonition = true;
      }
      continue;
    }

    const alertMatch = trimmed.match(/^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i);
    if (alertMatch) {
      closeList();
      closeBlockquote();
      closeTable();
      const alertType = alertMatch[1].toLowerCase();
      html += `<div class="print-admonition print-admonition-${alertType}"><div class="print-admonition-title">${alertMatch[1].toUpperCase()}</div><div class="print-admonition-content">`;
      inAdmonition = true;
      continue;
    }

    if (trimmed.startsWith(">")) {
      closeList();
      closeTable();
      const quoteText = trimmed.replace(/^>\s*/, "");
      if (!inBlockquote) {
        html += '<blockquote class="print-blockquote">';
        inBlockquote = true;
      }
      html += `<p class="print-p">${parseInlinePrint(quoteText)}</p>`;
      continue;
    } else if (inBlockquote) {
      closeBlockquote();
    }

    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      closeList();
      closeBlockquote();
      const cells = trimmed
        .slice(1, -1)
        .split("|")
        .map((c) => c.trim());

      const isSeparator = cells.every((c) => /^:?-+:?$/.test(c));
      if (isSeparator) {
        continue;
      }

      if (!inTable) {
        inTable = true;
        tableHeaders = cells;
      } else {
        tableRows.push(cells);
      }
      continue;
    } else if (inTable) {
      closeTable();
    }

    if (trimmed.startsWith("#")) {
      closeList();
      closeBlockquote();
      closeTable();
      const hMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
      if (hMatch) {
        const level = hMatch[1].length;
        const hText = parseInlinePrint(hMatch[2]);
        html += `<h${level} class="print-h${level}">${hText}</h${level}>`;
        continue;
      }
    }

    if (/^(\*{3,}|-{3,}|_{3,})$/.test(trimmed)) {
      closeList();
      closeBlockquote();
      closeTable();
      html += '<hr class="print-hr" />';
      continue;
    }

    const ulMatch = rawLine.match(/^(\s*)([-*])\s+(.*)$/);
    if (ulMatch) {
      closeBlockquote();
      closeTable();
      const rawIndent = ulMatch[1].length;
      let level = 0;

      while (
        printListLevels.length > 0 &&
        rawIndent < printListLevels[printListLevels.length - 1].indent - 1
      ) {
        printListLevels.pop();
      }

      if (printListLevels.length === 0) {
        level = rawIndent >= 2 ? Math.floor(rawIndent / 2) : 0;
        printListLevels.push({ type: "ul", indent: rawIndent, level });
      } else {
        const top = printListLevels[printListLevels.length - 1];
        if (top.type === "ul") {
          if (rawIndent >= top.indent + 2) {
            level = top.level + 1;
            printListLevels.push({ type: "ul", indent: rawIndent, level });
          } else {
            level = top.level;
          }
        } else {
          const parentUlIdx = printListLevels.findIndex(l => l.type === "ul" && Math.abs(l.indent - rawIndent) <= 1);
          if (parentUlIdx !== -1) {
            printListLevels = printListLevels.slice(0, parentUlIdx + 1);
            level = printListLevels[parentUlIdx].level;
          } else {
            level = top.level + 1;
            printListLevels.push({ type: "ul", indent: rawIndent, level });
          }
        }
      }

      if (listStack[listStack.length - 1] !== "ul") {
        closeListTags();
        html += '<ul class="print-ul">';
        listStack.push("ul");
      }
      const itemContent = ulMatch[3];
      const indentStyle = level > 0 ? ` style="margin-left: ${level * 16}pt;"` : "";
      if (itemContent.startsWith("[ ] ")) {
        html += `<li class="print-task-item"${indentStyle}><span class="print-checkbox"></span><span>${parseInlinePrint(itemContent.slice(4))}</span></li>`;
      } else if (itemContent.startsWith("[x] ") || itemContent.startsWith("[X] ")) {
        html += `<li class="print-task-item"${indentStyle}><span class="print-checkbox checked"></span><span style="text-decoration: line-through; color: #94a3b8;">${parseInlinePrint(itemContent.slice(4))}</span></li>`;
      } else {
        html += `<li class="print-li"${indentStyle}>${parseInlinePrint(itemContent)}</li>`;
      }
      continue;
    }

    const olMatch = rawLine.match(/^(\s*)(\d+)\.\s+(.*)$/);
    if (olMatch) {
      closeBlockquote();
      closeTable();
      const rawIndent = olMatch[1].length;
      const currentNumber = parseInt(olMatch[2], 10);
      let level = 0;

      while (
        printListLevels.length > 0 &&
        rawIndent < printListLevels[printListLevels.length - 1].indent - 1
      ) {
        printListLevels.pop();
      }

      if (printListLevels.length === 0) {
        level = rawIndent >= 2 ? Math.floor(rawIndent / 2) : 0;
        printListLevels.push({ type: "ol", indent: rawIndent, level, lastNumber: currentNumber });
      } else {
        const top = printListLevels[printListLevels.length - 1];
        if (top.type === "ol") {
          if (rawIndent >= top.indent + 2) {
            level = top.level + 1;
            printListLevels.push({ type: "ol", indent: rawIndent, level, lastNumber: currentNumber });
          } else {
            level = top.level;
            top.lastNumber = currentNumber;
          }
        } else {
          const parentOlIdx = currentNumber > 1
            ? printListLevels.findIndex(l => l.type === "ol" && l.indent <= rawIndent + 1)
            : -1;
          if (parentOlIdx !== -1) {
            printListLevels = printListLevels.slice(0, parentOlIdx + 1);
            level = printListLevels[parentOlIdx].level;
            printListLevels[parentOlIdx].lastNumber = currentNumber;
          } else if (rawIndent >= top.indent + 2) {
            level = top.level + 1;
            printListLevels.push({ type: "ol", indent: rawIndent, level, lastNumber: currentNumber });
          } else {
            level = top.level;
            top.type = "ol";
            top.lastNumber = currentNumber;
          }
        }
      }

      if (listStack[listStack.length - 1] !== "ol") {
        closeListTags();
        html += '<ol class="print-ol">';
        listStack.push("ol");
      }
      const indentStyle = level > 0 ? ` style="margin-left: ${level * 16}pt;"` : "";
      html += `<li class="print-li"${indentStyle}>${parseInlinePrint(olMatch[3])}</li>`;
      continue;
    }

    if (!trimmed) {
      closeList();
      continue;
    }

    closeList();
    html += `<p class="print-p">${parseInlinePrint(trimmed)}</p>`;
  }

  closeList();
  closeBlockquote();
  closeTable();
  if (inAdmonition) {
    html += "</div></div>";
  }

  return sanitizeHtmlOutput(html);
}
