import { useEffect, useRef } from "react";
import { Modal } from "antd";
import { useFileStore } from "../store/useFileStore";
import { useI18nStore } from "../i18n";
import { invokeTauriSafe } from "../utils/tauriBridge";

export const useExternalFileWatch = (isInitializing: boolean = false) => {
  const activeJsonTabId = useFileStore((state) => state.activeJsonTabId);
  const activeSchemaTabId = useFileStore((state) => state.activeSchemaTabId);

  const isCheckingRef = useRef(false);
  const isModalOpenRef = useRef(false);

  const checkActiveTab = async (targetTabId: string | null, isSchema: boolean = false) => {
    if (!targetTabId || isInitializing) return;
    if (isModalOpenRef.current || isCheckingRef.current) return;

    isCheckingRef.current = true;
    try {
      const state = useFileStore.getState();
      const tab = isSchema
        ? state.schemaTabs.find((t) => t.id === targetTabId)
        : state.jsonTabs.find((t) => t.id === targetTabId);

      if (!tab || !tab.path) return;

      // 1. Check if file still exists on disk
      const exists = await invokeTauriSafe<boolean>("file_exists", { path: tab.path });

      // If Tauri bridge call failed or is unavailable (non-boolean), do not take any destructive action!
      if (typeof exists !== "boolean") return;

      // Verify the tab is still in focus
      const currentActiveId = isSchema
        ? useFileStore.getState().activeSchemaTabId
        : useFileStore.getState().activeJsonTabId;
      if (currentActiveId !== targetTabId) return;

      const t = useI18nStore.getState().t;

      if (exists === false) {
        isModalOpenRef.current = true;
        Modal.confirm({
          title: isSchema ? t("externalWatch.schemaMovedTitle") : t("externalWatch.fileMovedTitle"),
          content: t("externalWatch.movedDesc", { title: tab.title, path: tab.path }),
          okText: t("externalWatch.keepAsNew"),
          cancelText: t("tabs.discard"),
          centered: true,
          onOk: () => {
            isModalOpenRef.current = false;
            if (isSchema) {
              const updated = useFileStore.getState().schemaTabs.map((tItem) =>
                tItem.id === targetTabId ? { ...tItem, path: null, lastModifiedTime: null } : tItem
              );
              useFileStore.setState({ schemaTabs: updated });
            } else {
              const updated = useFileStore.getState().jsonTabs.map((tItem) =>
                tItem.id === targetTabId ? { ...tItem, path: null, lastSavedContent: "", lastModifiedTime: null } : tItem
              );
              useFileStore.setState({ jsonTabs: updated });
            }
          },
          onCancel: () => {
            isModalOpenRef.current = false;
            if (isSchema) {
              useFileStore.getState().closeSchemaTab(targetTabId);
            } else {
              useFileStore.getState().closeJsonTab(targetTabId);
            }
          }
        });
        return;
      }

      // 2. Check modified time
      const modTime = await invokeTauriSafe<number>("get_file_modified_time", { path: tab.path });
      if (typeof modTime !== "number" || isNaN(modTime)) return;

      // Re-verify tab is still active
      if (
        (isSchema ? useFileStore.getState().activeSchemaTabId : useFileStore.getState().activeJsonTabId) !==
        targetTabId
      ) {
        return;
      }

      if (tab.lastModifiedTime && modTime > tab.lastModifiedTime) {
        const newContent = await invokeTauriSafe<string>("read_file", { path: tab.path });
        if (typeof newContent !== "string") return;

        if (
          (isSchema ? useFileStore.getState().activeSchemaTabId : useFileStore.getState().activeJsonTabId) !==
          targetTabId
        ) {
          return;
        }

        if (newContent !== tab.content) {
          isModalOpenRef.current = true;
          Modal.confirm({
            title: isSchema ? t("externalWatch.schemaChangedTitle") : t("externalWatch.fileChangedTitle"),
            content: isSchema
              ? t("externalWatch.schemaChangedDesc", { title: tab.title })
              : t("externalWatch.fileChangedDesc", { title: tab.title }),
            okText: t("externalWatch.reloadBtn"),
            cancelText: t("externalWatch.keepCopyBtn"),
            centered: true,
            onOk: () => {
              isModalOpenRef.current = false;
              if (isSchema) {
                const updated = useFileStore.getState().schemaTabs.map((t) =>
                  t.id === targetTabId
                    ? { ...t, content: newContent, lastSavedContent: newContent, lastModifiedTime: modTime }
                    : t
                );
                useFileStore.setState({ schemaTabs: updated });
                if (useFileStore.getState().activeSchemaTabId === targetTabId) {
                  useFileStore.getState().setSchemaString(newContent, false);
                }
              } else {
                const updated = useFileStore.getState().jsonTabs.map((t) =>
                  t.id === targetTabId
                    ? { ...t, content: newContent, lastSavedContent: newContent, lastModifiedTime: modTime }
                    : t
                );
                useFileStore.setState({ jsonTabs: updated });
                if (useFileStore.getState().activeJsonTabId === targetTabId) {
                  useFileStore.getState().setJsonString(newContent, false);
                }
              }
            },
            onCancel: () => {
              isModalOpenRef.current = false;
              if (isSchema) {
                const updated = useFileStore.getState().schemaTabs.map((t) =>
                  t.id === targetTabId ? { ...t, lastModifiedTime: modTime } : t
                );
                useFileStore.setState({ schemaTabs: updated });
              } else {
                const updated = useFileStore.getState().jsonTabs.map((t) =>
                  t.id === targetTabId ? { ...t, lastModifiedTime: modTime } : t
                );
                useFileStore.setState({ jsonTabs: updated });
              }
            }
          });
        } else {
          // Content is identical, update lastModifiedTime to avoid unnecessary reads
          if (isSchema) {
            const updated = useFileStore.getState().schemaTabs.map((t) =>
              t.id === targetTabId ? { ...t, lastModifiedTime: modTime } : t
            );
            useFileStore.setState({ schemaTabs: updated });
          } else {
            const updated = useFileStore.getState().jsonTabs.map((t) =>
              t.id === targetTabId ? { ...t, lastModifiedTime: modTime } : t
            );
            useFileStore.setState({ jsonTabs: updated });
          }
        }
      }
    } finally {
      isCheckingRef.current = false;
    }
  };

  // Check file modifications whenever the active tab changes (tab gains focus)
  useEffect(() => {
    if (!isInitializing && activeJsonTabId) {
      checkActiveTab(activeJsonTabId, false);
    }
  }, [activeJsonTabId, isInitializing]);

  useEffect(() => {
    if (!isInitializing && activeSchemaTabId) {
      checkActiveTab(activeSchemaTabId, true);
    }
  }, [activeSchemaTabId, isInitializing]);

  // Window focus listener: ONLY checks the currently active/focused file tab!
  useEffect(() => {
    const handleFocus = () => {
      if (isInitializing) return;
      const state = useFileStore.getState();
      if (state.activeJsonTabId) {
        checkActiveTab(state.activeJsonTabId, false);
      }
      if (state.activeSchemaTabId) {
        checkActiveTab(state.activeSchemaTabId, true);
      }
    };

    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, [isInitializing]);
};
