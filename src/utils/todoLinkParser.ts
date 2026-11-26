import { Tab } from "../store/useFileStore";
import { logger } from "./logger";

export interface ParsedLink {
  label: string;
  targetPath: string;
  raw: string;
  isWikiLink: boolean;
}

/**
 * Normalizes a file path, removes URI encoding (%20 etc.), file:// prefixes
 * and backslashes, standardizing drive letters to uppercase.
 *
 * @param p - Der zu bereinigende Eingabepfad.
 * @returns Der bereinigte, einheitliche Pfadstring mit Vorwärts-Slashes.
 */
export const normalizeFilePath = (p: string): string => {
  if (!p) return "";
  let clean = p.trim();
  try {
    clean = decodeURIComponent(clean);
  } catch (e) {}
  clean = clean.replace(/^file:\/\/\/?/i, "").replace(/\\/g, "/").trim();
  // Capitalize Windows drive letter (e.g., c:/ -> C:/)
  if (/^[a-zA-Z]:\//.test(clean)) {
    clean = clean.charAt(0).toUpperCase() + clean.slice(1);
  }
  return clean;
};

/**
 * Checks whether a path corresponds to a known text/code document format that can be edited in Fileditor.
 *
 * @param path - The file path or name.
 * @returns True if the extension is an editable text/code format.
 */
export const isTextDocumentPath = (path: string): boolean => {
  if (!path) return false;
  const ext = path.split(".").pop()?.toLowerCase();
  if (!ext) return true;
  return [
    "json", "xml", "md", "markdown", "todo", "txt", "text", "log",
    "cs", "js", "ts", "jsx", "tsx", "py", "rs", "cpp", "c", "h", "hpp",
    "java", "html", "css", "scss", "less", "yaml", "yml", "ini", "toml",
    "sh", "bash", "bat", "cmd", "ps1", "sql", "php", "go", "rb", "lua"
  ].includes(ext);
};

/**
 * Checks whether a path corresponds to a binary/media format that should be opened in the default application.
 *
 * @param path - The file path or name.
 * @returns True if the extension is binary/media.
 */
export const isBinaryDocumentPath = (path: string): boolean => {
  if (!path) return false;
  const ext = path.split(".").pop()?.toLowerCase();
  if (!ext) return false;
  return [
    "png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico", "tiff",
    "pdf", "mp4", "webm", "avi", "mov", "mkv", "mp3", "wav", "flac", "ogg",
    "zip", "rar", "7z", "tar", "gz", "exe", "msi", "dll", "bin",
    "docx", "xlsx", "pptx", "odt", "ods", "odp"
  ].includes(ext);
};

/**
 * Checks whether a path is a linkable document path.
 * In Fileditor v0.11.1+, all document types are linkable.
 *
 * @param path - The file path or name.
 * @returns True if the path is non-empty.
 */
export const isSupportedDocumentPath = (path: string): boolean => {
  if (!path) return false;
  const clean = path.trim();
  return clean.length > 0 && !clean.startsWith("#");
};

/**
 * Extracts all Markdown links [label](target) and WikiLinks [[target]] from a text string.
 *
 * @param content - Der zu analysierende Text.
 * @returns Array aller gefundenen verlinkten Elemente mit Label, Ziel und Roh-Text.
 */
export const parseDocumentLinks = (content: string): ParsedLink[] => {
  const links: ParsedLink[] = [];
  if (!content) return links;

  // 1. Match Markdown Links: [Label](path_or_url)
  const mdLinkRegex = /\[([^\]]+)\]\(((?:[^()]+|\([^()]*\))+)\)/g;
  let match: RegExpExecArray | null;

  while ((match = mdLinkRegex.exec(content)) !== null) {
    const label = match[1];
    const targetPath = match[2];
    links.push({
      label,
      targetPath,
      raw: match[0],
      isWikiLink: false
    });
  }

  // 2. Match WikiLinks: [[Filename_or_path]] or [[path|Label]]
  const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
  while ((match = wikiLinkRegex.exec(content)) !== null) {
    const rawInner = match[1];
    let label = rawInner;
    let targetPath = rawInner;

    if (rawInner.includes("|")) {
      const parts = rawInner.split("|");
      targetPath = parts[0].trim();
      label = parts[1].trim();
    }

    links.push({
      label,
      targetPath,
      raw: match[0],
      isWikiLink: true
    });
  }

  return links;
};

/**
 * Resolves a target link to an open editor tab or file system path.
 * Considers relative paths relative to active tab directory as well as Web URLs.
 *
 * @param targetPath - Das im Link angegebene Ziel (URL, relativer oder absoluter Pfad).
 * @param openTabs - Liste aller aktuell im Editor geöffneten Tabs.
 * @param activeTabPath - Der Pfad des aktuell aktiven Dokuments zur Relativpfad-Auflösung.
 * @returns Objekt mit tabId (falls offen), bereinigtem Pfad und Typschaltern.
 */
export const resolveLinkToTabOrPath = (
  targetPath: string,
  openTabs: Tab[],
  activeTabPath?: string | null
): { tabId: string | null; cleanPath: string; isSupported: boolean; isWebUrl: boolean } => {
  const isWebUrl = /^https?:\/\//i.test(targetPath.trim());
  if (isWebUrl) {
    logger.info("todoLinkParser", `Resolved link as Web URL: ${targetPath.trim()}`);
    return {
      tabId: null,
      cleanPath: targetPath.trim(),
      isSupported: true,
      isWebUrl: true
    };
  }

  let cleanPath = normalizeFilePath(targetPath);

  // If targetPath is relative and activeTabPath exists, attempt combining with activeTab directory
  if (activeTabPath && !cleanPath.includes(":/") && !cleanPath.startsWith("/")) {
    const activeNorm = normalizeFilePath(activeTabPath);
    const parentDir = activeNorm.split("/").slice(0, -1).join("/");
    if (parentDir) {
      const combined = `${parentDir}/${cleanPath}`;
      logger.info("todoLinkParser", `Relative path "${cleanPath}" combined with active dir "${parentDir}" -> "${combined}"`);

      const matchingCombinedTab = openTabs.find(t => t.path && normalizeFilePath(t.path) === combined);
      if (matchingCombinedTab) {
        logger.info("todoLinkParser", `Found matching open tab by combined path: tabId="${matchingCombinedTab.id}", title="${matchingCombinedTab.title}"`);
        return {
          tabId: matchingCombinedTab.id,
          cleanPath: combined,
          isSupported: true,
          isWebUrl: false
        };
      }
      cleanPath = combined;
    }
  }

  const lowerTarget = cleanPath.toLowerCase();

  // Try matching open tabs by exact normalized path or title
  const matchingTab = openTabs.find(t => {
    if (t.path && normalizeFilePath(t.path).toLowerCase() === lowerTarget) {
      return true;
    }
    const tabTitleLower = t.title.toLowerCase();
    if (tabTitleLower === lowerTarget || tabTitleLower.replace(/\.[^/.]+$/, "") === lowerTarget) {
      return true;
    }
    // Match by basename of targetPath
    const targetBaseName = cleanPath.split("/").pop()?.toLowerCase();
    if (targetBaseName && (tabTitleLower === targetBaseName || tabTitleLower.replace(/\.[^/.]+$/, "") === targetBaseName)) {
      return true;
    }
    return false;
  });

  if (matchingTab) {
    logger.info("todoLinkParser", `Found matching open tab: tabId="${matchingTab.id}", title="${matchingTab.title}", targetPath="${targetPath}"`);
  } else {
    logger.info("todoLinkParser", `No open tab match found for targetPath="${targetPath}", cleanPath="${cleanPath}". Will attempt disk open.`);
  }

  const isSupported = isSupportedDocumentPath(cleanPath) || !!matchingTab;

  return {
    tabId: matchingTab ? matchingTab.id : null,
    cleanPath: matchingTab?.path ? normalizeFilePath(matchingTab.path) : cleanPath,
    isSupported,
    isWebUrl: false
  };
};
