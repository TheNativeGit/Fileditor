import { message } from "antd";
import { t } from "../i18n";
import { logger } from "./logger";
import { isBinaryDocumentPath } from "./todoLinkParser";
import { invokeTauri, invokeTauriSafe, isTauriEnv } from "./tauriBridge";

export interface OpenFileOptions {
  forceDefaultApp?: boolean;
  revealInExplorer?: boolean;
  label?: string;
}

export const openArbitraryFile = async (
  filePath: string,
  openEditorTab?: (path: string) => Promise<void> | void,
  options: OpenFileOptions = {}
): Promise<boolean> => {
  if (!filePath || !filePath.trim()) {
    logger.warn("fileLinkOpener", "Cannot open empty file path");
    return false;
  }

  const cleanPath = filePath.trim();

  if (isTauriEnv()) {
    const exists = await invokeTauriSafe<boolean>("file_exists", { path: cleanPath });
    if (!exists) {
      logger.warn("fileLinkOpener", `Target file does not exist: "${cleanPath}"`);
      message.error(t("fileLink.notFound", { path: cleanPath }) || `File not found: ${cleanPath}`);
      return false;
    }
  }

  if (options.revealInExplorer) {
    logger.info("fileLinkOpener", `Revealing in Explorer: "${cleanPath}"`);
    await invokeTauriSafe("show_in_explorer", { path: cleanPath });
    return true;
  }

  const isBinary = isBinaryDocumentPath(cleanPath);
  if (isBinary || options.forceDefaultApp) {
    logger.info("fileLinkOpener", `Launching in default app (binary=${isBinary}): "${cleanPath}"`);
    if (isTauriEnv()) {
      try {
        await invokeTauri("open_file_with_default_app", { path: cleanPath });
      } catch (err: any) {
        const msgStr = String(err?.message || err || "");
        if (msgStr.includes("BLOCKED_EXECUTABLE")) {
          message.warning(t("fileLink.blockedExecutable"));
          await invokeTauriSafe("show_in_explorer", { path: cleanPath });
        } else {
          message.error(t("fileLink.openFailed", { path: cleanPath }));
        }
        return false;
      }
    } else {
      window.open(cleanPath, "_blank", "noopener,noreferrer");
    }
    return true;
  }

  if (openEditorTab) {
    try {
      logger.info("fileLinkOpener", `Opening text file in Fileditor: "${cleanPath}"`);
      await openEditorTab(cleanPath);
      return true;
    } catch (err) {
      logger.warn("fileLinkOpener", `Failed opening "${cleanPath}" in editor, falling back to default app: ${err}`);
    }
  }

  try {
    await invokeTauri("open_file_with_default_app", { path: cleanPath });
    return true;
  } catch (err: any) {
    const msgStr = String(err?.message || err || "");
    if (msgStr.includes("BLOCKED_EXECUTABLE")) {
      message.warning(t("fileLink.blockedExecutable"));
    }
    await invokeTauriSafe("show_in_explorer", { path: cleanPath });
    return false;
  }
};
