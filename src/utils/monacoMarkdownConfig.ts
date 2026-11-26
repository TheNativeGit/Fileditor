import { AccentTheme } from "../store/useFileStore";

/**
 * Patched Monarch tokens provider for Markdown that strictly restricts
 * inline code (`code`) to a single line, preventing unclosed backticks
 * from leaking across lines and inverting editor syntax highlighting.
 */
export const customMarkdownLanguage = {
  defaultToken: "",
  tokenPostfix: ".md",

  // Escape patterns
  control: /[\\`*_[\]{}()#+\-.!]/,
  noncontrol: /[^\\`*_[\]{}()#+\-.!]/,
  escapes: /\\(?:@control)/,
  jsescapes: /\\(?:[btnfr\\"']|[0-7][0-7]?|[0-3][0-7]{2})/,

  empty: [
    "area", "base", "basefont", "br", "col", "frame", "hr", "img",
    "input", "isindex", "link", "meta", "param"
  ],

  tokenizer: {
    root: [
      // Markdown tables
      [/^\s*\|/, "@rematch", "@table_header"],
      // Headers (with #)
      [/^(\s{0,3})(#+)((?:[^\\#\r\n]|@escapes)+)((?:#+)?)/, ["white", "keyword", "keyword", "keyword"]],
      // Headers (with = or -)
      [/^\s*(=+|-+)\s*$/, "keyword"],
      // Headers (with ***)
      [/^\s*((\*[ ]?)+)\s*$/, "meta.separator"],
      // Quotes
      [/^\s*>+/, "comment"],
      // Lists (starting with * or number)
      [/^\s*([*\-+:]|\d+\.)\s/, "keyword"],
      // Indented code block (4 spaces or tab)
      [/^(\t|[ ]{4})[^ ].*$/, "string"],
      // Code block (3 tilde)
      [/^\s*~~~\s*((?:\w|[\/\-#])+)?\s*$/, { token: "string", next: "@codeblock" }],
      // Github style code blocks with backticks and language / title
      [
        /^\s*```\s*((?:\w|[\/\-#])+).*$/,
        { token: "string", next: "@codeblockgh", nextEmbedded: "$1" }
      ],
      // Github style code blocks with backticks but no language
      [/^\s*```\s*$/, { token: "string", next: "@codeblock" }],
      // Markup within lines
      { include: "@linecontent" }
    ],

    table_header: [
      { include: "@table_common" },
      [/[^\|]+/, "keyword.table.header"]
    ],

    table_body: [
      { include: "@table_common" },
      { include: "@linecontent" }
    ],

    table_common: [
      [/\s*[-:]+\s*/, { token: "keyword", switchTo: "table_body" }],
      [/^\s*\|/, "keyword.table.left"],
      [/^\s*[^\|]/, "@rematch", "@pop"],
      [/^\s*$/, "@rematch", "@pop"],
      [
        /\|/,
        {
          cases: {
            "@eos": "keyword.table.right",
            "@default": "keyword.table.middle"
          }
        }
      ]
    ],

    codeblock: [
      [/^\s*~~~\s*$/, { token: "string", next: "@pop" }],
      [/^\s*```\s*$/, { token: "string", next: "@pop" }],
      [/.*$/, "variable.source"]
    ],

    codeblockgh: [
      [/^\s*```\s*$/, { token: "string", next: "@pop", nextEmbedded: "@pop" }],
      [/[^`]+/, "variable.source"]
    ],

    linecontent: [
      // Escapes
      [/&\w+;/, "string.escape"],
      [/@escapes/, "escape"],

      // Bold & Italic
      [/\b__([^\\_\r\n]|@escapes|_(?!_))+__\b/, "strong"],
      [/\*\*([^\\*\r\n]|@escapes|\*(?!\*))+\*\*/, "strong"],
      [/\b_[^\\_\r\n]+_\b/, "emphasis"],
      [/\*([^\\*\r\n]|@escapes)+\*/, "emphasis"],

      // Strict single-line inline code: MUST NOT contain \r or \n
      [/`([^\\`\r\n]|@escapes)+`/, "variable"],

      // Links & Images
      [/\{+[^}]+\}+/, "string.target"],
      [/(!?\[)((?:[^\]\\\r\n]|@escapes)*)(\]\([^\)\r\n]+\))/, ["string.link", "", "string.link"]],
      [/(!?\[)((?:[^\]\\\r\n]|@escapes)*)(\])/, "string.link"],

      // HTML passthrough
      { include: "html" }
    ],

    html: [
      [/<(\w+)\/>/, "tag"],
      [
        /<(\w+)(\-|\w)*/,
        {
          cases: {
            "@empty": { token: "tag", next: "@tag.$1" },
            "@default": { token: "tag", next: "@tag.$1" }
          }
        }
      ],
      [/<\/(\w+)(\-|\w)*\s*>/, { token: "tag" }],
      [/<!--/, "comment", "@comment"]
    ],

    comment: [
      [/[^<\-]+/, "comment.content"],
      [/-->/, "comment", "@pop"],
      [/<!--/, "comment.content.invalid"],
      [/[<\-]/, "comment.content"]
    ],

    tag: [
      [/[ \t\r\n]+/, "white"],
      [
        /(type)(\s*=\s*)(")([^"]+)(")/,
        [
          "attribute.name.html",
          "delimiter.html",
          "string.html",
          { token: "string.html", switchTo: "@tag.$S2.$4" },
          "string.html"
        ]
      ],
      [
        /(type)(\s*=\s*)(')([^']+)(')/,
        [
          "attribute.name.html",
          "delimiter.html",
          "string.html",
          { token: "string.html", switchTo: "@tag.$S2.$4" },
          "string.html"
        ]
      ],
      [/(\w+)(\s*=\s*)("[^"]*"|'[^']*')/, ["attribute.name.html", "delimiter.html", "string.html"]],
      [/\w+/, "attribute.name.html"],
      [/\/>/, "tag", "@pop"],
      [
        />/,
        {
          cases: {
            "$S2==style": {
              token: "tag",
              switchTo: "embeddedStyle",
              nextEmbedded: "text/css"
            },
            "$S2==script": {
              cases: {
                $S3: {
                  token: "tag",
                  switchTo: "embeddedScript",
                  nextEmbedded: "$S3"
                },
                "@default": {
                  token: "tag",
                  switchTo: "embeddedScript",
                  nextEmbedded: "text/javascript"
                }
              }
            },
            "@default": { token: "tag", next: "@pop" }
          }
        }
      ]
    ],

    embeddedStyle: [
      [/[^<]+/, ""],
      [/<\/style\s*>/, { token: "@rematch", next: "@pop", nextEmbedded: "@pop" }],
      [/</, ""]
    ],

    embeddedScript: [
      [/[^<]+/, ""],
      [/<\/script\s*>/, { token: "@rematch", next: "@pop", nextEmbedded: "@pop" }],
      [/</, ""]
    ]
  }
};

/**
 * Defines or updates the Monaco theme with user-configured accent colors.
 *
 * @param monaco The Monaco API instance.
 * @param theme The active AccentTheme configuration.
 */
export function updateMonacoAccentTheme(monaco: any, theme: AccentTheme): void {
  if (!monaco || !monaco.editor) return;

  const sanitizeHex = (hex: string, fallback: string) => {
    if (!hex) return fallback;
    return hex.replace(/^#/, "");
  };

  const primaryHex = sanitizeHex(theme.primaryAccent, "a855f7");
  const headingHex = sanitizeHex(theme.editorHeading, "a78bfa");
  const linkHex = sanitizeHex(theme.editorLink, "10b981");
  const codeHex = sanitizeHex(theme.editorInlineCode, "3b82f6");

  monaco.editor.defineTheme("hero-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "string", foreground: linkHex },
      { token: "string.link", foreground: linkHex },
      { token: "string.target", foreground: linkHex },
      { token: "variable", foreground: codeHex },
      { token: "number", foreground: codeHex },
      { token: "keyword", foreground: headingHex },
      { token: "keyword.md", foreground: headingHex },
      { token: "delimiter", foreground: "64748b" },
      { token: "comment", foreground: "64748b" }
    ],
    colors: {
      "editor.background": "#0f1626",
      "editor.lineHighlightBackground": "#141c2c",
      "editorLineNumber.foreground": "#475569",
      "editorLineNumber.activeForeground": "#94a3b8",
      "editor.selectionBackground": "#1e293b",
      "editorCursor.foreground": `#${primaryHex}`
    }
  });

  monaco.editor.setTheme("hero-dark");
}

/**
 * Configures the Monaco editor environment for Markdown.
 * Applies the single-line backtick tokenizer and registers the markdown link provider.
 *
 * @param monaco The Monaco API instance.
 * @param theme The current AccentTheme.
 */
export function configureMonacoMarkdown(monaco: any, theme: AccentTheme): void {
  if (!monaco || !monaco.languages) return;

  // Apply patched Monarch tokenizer for markdown
  try {
    monaco.languages.setMonarchTokensProvider("markdown", customMarkdownLanguage);
  } catch (err) {
    console.warn("Failed to set custom markdown tokenizer:", err);
  }

  // Register link provider for markdown [text](target)
  try {
    if (!(monaco as any)._markdownLinkProviderRegistered) {
      monaco.languages.registerLinkProvider("markdown", {
        provideLinks(model: any) {
          const links: any[] = [];
          const lineCount = model.getLineCount();
          for (let i = 1; i <= lineCount; i++) {
            const line = model.getLineContent(i);
            const regex = /\[([^\]]+)\]\(([^)]+)\)/g;
            let match;
            while ((match = regex.exec(line)) !== null) {
              const startCol = match.index + 1;
              const endCol = startCol + match[0].length;
              const target = match[2];
              links.push({
                range: new monaco.Range(i, startCol, i, endCol),
                url: target
              });
            }
          }
          return { links };
        }
      });
      (monaco as any)._markdownLinkProviderRegistered = true;
    }
  } catch (err) {
    console.warn("Failed to register markdown link provider:", err);
  }

  updateMonacoAccentTheme(monaco, theme);
}
