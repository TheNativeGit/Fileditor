import { invoke, convertFileSrc, isTauri as checkIsTauri } from "@tauri-apps/api/core";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";

/**
 * Returns true when running inside the native Tauri desktop runtime.
 */
export const isTauriEnv = (): boolean => {
  try {
    return checkIsTauri();
  } catch {
    return false;
  }
};

/**
 * Safely invokes a backend Rust Tauri command, returning null outside Tauri or on failure.
 */
export const invokeTauri = async <T = any>(
  cmd: string,
  args: Record<string, unknown> = {}
): Promise<T | null> => {
  if (!isTauriEnv()) return null;
  try {
    return await invoke<T>(cmd, args);
  } catch (err) {
    console.error(`[tauriBridge] invoke("${cmd}") failed:`, err);
    throw err;
  }
};

/**
 * Safely invokes a backend Rust Tauri command, swallowing errors and returning null.
 */
export const invokeTauriSafe = async <T = any>(
  cmd: string,
  args: Record<string, unknown> = {}
): Promise<T | null> => {
  if (!isTauriEnv()) return null;
  try {
    return await invoke<T>(cmd, args);
  } catch {
    return null;
  }
};

/**
 * Subscribes to a Tauri event when running in Tauri.
 */
export const listenTauri = async <T = any>(
  event: string,
  handler: (payload: T) => void
): Promise<UnlistenFn | null> => {
  if (!isTauriEnv()) return null;
  try {
    return await listen<T>(event, (evt) => handler(evt.payload));
  } catch {
    return null;
  }
};

/**
 * Emits a Tauri event across windows when running in Tauri.
 */
export const emitTauri = async (event: string, payload?: unknown): Promise<void> => {
  if (!isTauriEnv()) return;
  try {
    await emit(event, payload);
  } catch {
    // Ignore outside active window listener
  }
};

/**
 * Converts a local filesystem path into a safe Tauri asset:// URL.
 */
export const convertLocalFileSrc = (filePath: string): string => {
  if (!isTauriEnv()) return filePath;
  try {
    return convertFileSrc(filePath);
  } catch {
    return filePath;
  }
};

/**
 * Closes the current native Tauri window (falling back to window.close in browsers).
 */
export const closeCurrentNativeWindow = async (): Promise<void> => {
  if (isTauriEnv()) {
    try {
      await getCurrentWindow().close();
      return;
    } catch {
      // Fallback
    }
  }
  window.close();
};

export interface NativeDragDropPayload {
  type: "enter" | "over" | "drop" | "leave";
  paths?: string[];
  position?: { x: number; y: number };
}

/**
 * Listens for OS file drag-and-drop events on the current Tauri Webview.
 */
export const listenNativeFileDrop = async (
  callback: (payload: NativeDragDropPayload) => void
): Promise<UnlistenFn | null> => {
  if (!isTauriEnv()) return null;
  try {
    return await getCurrentWebview().onDragDropEvent((event) => {
      const p = event.payload as any;
      callback({
        type: p.type,
        paths: p.paths,
        position: p.position
      });
    });
  } catch {
    return null;
  }
};
