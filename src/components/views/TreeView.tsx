import React, { useState, useEffect } from "react";
import { message } from "antd";
import { useFileStore } from "../../store/useFileStore";
import { useTranslation } from "../../i18n";
import { isValidXmlName } from "../../utils/xmlConverter";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  EyeOff,
  Type,
  Hash,
  ToggleLeft,
  Braces,
  List
} from "lucide-react";

// Helper: Determines the JavaScript type of a value
const getTypeLabel = (val: any): "string" | "number" | "boolean" | "null" | "array" | "object" => {
  if (val === null) return "null";
  if (Array.isArray(val)) return "array";
  if (typeof val === "object") return "object";
  if (typeof val === "number") return "number";
  if (typeof val === "boolean") return "boolean";
  return "string";
};

// Helper: Determines badge styling according to data type
const getTypeBadgeClass = (type: string): string => {
  switch (type) {
    case "string": return "bg-emerald-950/40 text-hero-string border-emerald-800/40";
    case "number": return "bg-blue-950/40 text-hero-number border-blue-800/40";
    case "boolean": return "bg-purple-950/40 text-hero-boolean border-purple-800/40";
    case "array": return "bg-amber-950/40 text-hero-array border-amber-800/40";
    case "object": return "bg-cyan-950/40 text-hero-object border-cyan-800/40";
    case "null":
    default: return "bg-slate-950/40 text-hero-null border-slate-850";
  }
};

// Schnittstelle für das Kontextmenü
interface ContextMenuState {
  x: number;
  y: number;
  path: (string | number)[];
  nodeKey: string | number;
  type: string;
  parentType: "object" | "array" | "root";
}

export const TreeView: React.FC = () => {
  const { t } = useTranslation();
  const { mode, jsonValue, updateJsonValue } = useFileStore();
  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({ "Root": true });
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Closes context menu on clicks elsewhere
  useEffect(() => {
    const handleClose = () => setContextMenu(null);
    window.addEventListener("click", handleClose);
    return () => window.removeEventListener("click", handleClose);
  }, []);

  // Pfad-String zur eindeutigen Identifikation von Knoten
  const getPathString = (path: (string | number)[]): string => {
    return path.length === 0 ? "Root" : JSON.stringify(path);
  };

  const toggleExpand = (pathStr: string) => {
    setExpandedPaths((prev) => ({
      ...prev,
      [pathStr]: !prev[pathStr]
    }));
  };

  // --- HILFSFUNKTIONEN ZUR STRUKTURMODIFIKATION ---

  // Ändert einen Wert an einem Pfad
  const setValAtPath = (path: (string | number)[], newVal: any) => {
    const rootCopy = JSON.parse(JSON.stringify(jsonValue));

    if (path.length === 0) {
      updateJsonValue(newVal);
      return;
    }

    let current = rootCopy;
    for (let i = 0; i < path.length - 1; i++) {
      current = current[path[i]];
    }
    current[path[path.length - 1]] = newVal;
    updateJsonValue(rootCopy);
  };

  // Benennt einen Schlüssel in einem Objekt um und behält die Reihenfolge bei
  const renameObjectKey = (parentPath: (string | number)[], oldKey: string, newKey: string) => {
    const trimmed = newKey.trim();
    if (oldKey === trimmed || !trimmed) return;

    if (mode === "xml") {
      const attrOrTag = trimmed.startsWith("@_") ? trimmed.slice(2) : trimmed;
      if (trimmed !== "#text" && !isValidXmlName(attrOrTag)) {
        message.warning(t("views.invalidXmlName", { name: trimmed }));
        return;
      }
    }

    const rootCopy = JSON.parse(JSON.stringify(jsonValue));
    let parent = rootCopy;

    for (const seg of parentPath) {
      parent = parent[seg];
    }

    const keys = Object.keys(parent);
    if (keys.includes(trimmed)) {
      message.warning(t("views.keyExists", { key: trimmed }));
      return;
    }
    const newParent: any = {};

    keys.forEach((k) => {
      if (k === oldKey) {
        newParent[trimmed] = parent[oldKey];
      } else {
        newParent[k] = parent[k];
      }
    });

    if (parentPath.length === 0) {
      updateJsonValue(newParent);
    } else {
      let grandparent = rootCopy;
      for (let i = 0; i < parentPath.length - 1; i++) {
        grandparent = grandparent[parentPath[i]];
      }
      grandparent[parentPath[parentPath.length - 1]] = newParent;
      updateJsonValue(rootCopy);
    }
  };

  // Deletes a node at the specified path
  const deleteNode = (path: (string | number)[]) => {
    if (path.length === 0) {
      updateJsonValue({});
      return;
    }

    const rootCopy = JSON.parse(JSON.stringify(jsonValue));
    let parent = rootCopy;

    for (let i = 0; i < path.length - 1; i++) {
      parent = parent[path[i]];
    }

    const lastKey = path[path.length - 1];
    if (Array.isArray(parent)) {
      parent.splice(lastKey as number, 1);
    } else {
      delete parent[lastKey];
    }

    updateJsonValue(rootCopy);
  };

  // Inserts an element before or after an existing array element
  const insertAdjacent = (path: (string | number)[], direction: "before" | "after", nodeKey: string | number) => {
    if (path.length === 0) return;

    const parentPath = path.slice(0, -1);
    const rootCopy = JSON.parse(JSON.stringify(jsonValue));

    let parent = rootCopy;
    for (const seg of parentPath) {
      parent = parent[seg];
    }

    const defaultValue = "";

    if (Array.isArray(parent)) {
      const idx = nodeKey as number;
      const insertIdx = direction === "before" ? idx : idx + 1;
      parent.splice(insertIdx, 0, defaultValue);
    } else if (typeof parent === "object" && parent !== null) {
      const keys = Object.keys(parent);
      const newParent: any = {};
      const newKey = `neu_${Date.now()}`;

      keys.forEach((k) => {
        if (k === nodeKey && direction === "before") {
          newParent[newKey] = defaultValue;
        }
        newParent[k] = parent[k];
        if (k === nodeKey && direction === "after") {
          newParent[newKey] = defaultValue;
        }
      });

      if (parentPath.length === 0) {
        updateJsonValue(newParent);
        return;
      } else {
        let grandparent = rootCopy;
        for (let i = 0; i < parentPath.length - 1; i++) {
          grandparent = grandparent[parentPath[i]];
        }
        grandparent[parentPath[parentPath.length - 1]] = newParent;
      }
    }

    updateJsonValue(rootCopy);
  };

  // Adds a child property or element
  const addChild = (path: (string | number)[], childType: string) => {
    if (mode === "xml" && path.length === 0 && jsonValue && typeof jsonValue === "object" && Object.keys(jsonValue).length >= 1) {
      message.warning(t("views.xmlSingleRootWarning"));
      return;
    }
    const rootCopy = JSON.parse(JSON.stringify(jsonValue));
    let target = rootCopy;

    for (const seg of path) {
      target = target[seg];
    }

    let defaultValue: any = "";
    if (childType === "object") defaultValue = {};
    if (childType === "array") defaultValue = [];
    if (childType === "number") defaultValue = 0;
    if (childType === "boolean") defaultValue = false;

    if (Array.isArray(target)) {
      target.push(defaultValue);
    } else if (typeof target === "object" && target !== null) {
      const newKey = `neu_${Date.now()}`;
      target[newKey] = defaultValue;
    }

    updateJsonValue(rootCopy);

    // Automatisch Elternebene expandieren
    const pathStr = getPathString(path);
    setExpandedPaths((prev) => ({ ...prev, [pathStr]: true }));
  };

  // --- INTERNE KNOTENKOMPONENTE (REKURSIV) ---

  interface TreeNodeProps {
    path: (string | number)[];
    nodeKey: string | number;
    val: any;
    parentType: "object" | "array" | "root";
  }

  const TreeNode: React.FC<TreeNodeProps> = ({ path, nodeKey, val, parentType }) => {
    const type = getTypeLabel(val);
    const pathStr = getPathString(path);
    const isExpanded = !!expandedPaths[pathStr];

    const [isEditingKey, setIsEditingKey] = useState(false);
    const [keyInput, setKeyInput] = useState(String(nodeKey));

    const [isEditingVal, setIsEditingVal] = useState(false);
    const [valInput, setValInput] = useState(String(val));

    // Update local state when value changes externally
    useEffect(() => {
      setKeyInput(String(nodeKey));
    }, [nodeKey]);

    useEffect(() => {
      setValInput(String(val));
    }, [val]);

    const handleKeySubmit = () => {
      setIsEditingKey(false);
      if (keyInput !== nodeKey) {
        renameObjectKey(path.slice(0, -1), String(nodeKey), keyInput);
      }
    };

    const handleValSubmit = () => {
      setIsEditingVal(false);
      let typedVal: any = valInput;
      if (type === "number") {
        const num = Number(valInput);
        typedVal = isNaN(num) ? 0 : num;
      }
      if (type === "boolean") {
        typedVal = valInput.toLowerCase() === "true";
      }
      setValAtPath(path, typedVal);
    };

    const handleContextMenu = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      let x = e.clientX;
      let y = e.clientY;

      const menuWidth = 224;
      const subMenuWidth = 128;
      const expectedHeight = 260; // Puffer für Haupt- und Untermenü

      if (x + menuWidth + subMenuWidth > window.innerWidth) {
        x = window.innerWidth - menuWidth - subMenuWidth - 10;
      }
      if (y + expectedHeight > window.innerHeight) {
        y = window.innerHeight - expectedHeight - 10;
      }
      if (x < 10) x = 10;
      if (y < 10) y = 10;

      setContextMenu({
        x,
        y,
        path,
        nodeKey,
        type,
        parentType
      });
    };

    const hasChildren = type === "object" || type === "array";
    const childCount = hasChildren ? (type === "object" ? Object.keys(val).length : val.length) : 0;

    return (
      <div className="text-xs select-none">
        {/* Zeile für diesen Knoten */}
        <div
          onContextMenu={handleContextMenu}
          className="flex items-center space-x-1.5 py-1 px-2 rounded hover:bg-hero-hover/40 group w-fit min-w-[200px]"
        >
          {/* Ein-/Ausklapp-Pfeil */}
          {hasChildren ? (
            <button
              onClick={() => toggleExpand(pathStr)}
              className="text-slate-500 hover:text-white p-0.5 focus:outline-none"
            >
              {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          ) : (
            <span className="w-4"></span>
          )}

          {/* Key / Index */}
          <div className="font-mono flex items-center space-x-1">
            {parentType === "object" ? (
              isEditingKey ? (
                <input
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  onBlur={handleKeySubmit}
                  onKeyDown={(e) => e.key === "Enter" && handleKeySubmit()}
                  autoFocus
                  className="bg-hero-input border rounded px-1 text-white font-mono text-xs w-28 focus:outline-none"
                  style={{ borderColor: "var(--color-primary-accent)" }}
                />
              ) : (
                <span
                  onDoubleClick={() => setIsEditingKey(true)}
                  className="text-slate-300 font-semibold cursor-pointer hover:text-white border-b border-dashed border-slate-700 hover:border-white"
                >
                  "{nodeKey}"
                </span>
              )
            ) : parentType === "array" ? (
              <span className="text-slate-500 font-semibold select-none">[{nodeKey}]</span>
            ) : (
              <span className="font-semibold uppercase tracking-wider font-sans select-none" style={{ color: "var(--color-primary-accent)" }}>Root</span>
            )}

            <span className="text-slate-600">:</span>
          </div>

          {/* Wert / Typ-Badge */}
          {hasChildren ? (
            <span
              onClick={() => toggleExpand(pathStr)}
              className="text-slate-500 font-mono text-[10px] cursor-pointer flex items-center space-x-1"
            >
              <span className={`px-1.5 py-0.5 rounded border ${getTypeBadgeClass(type)} font-sans uppercase text-[9px] scale-95`}>
                {type === "array" ? `array [${childCount}]` : "object"}
              </span>
            </span>
          ) : (
            <div className="flex items-center space-x-2">
              {isEditingVal ? (
                type === "boolean" ? (
                  <select
                    value={valInput}
                    onChange={(e) => {
                      setValInput(e.target.value);
                      // Sofort senden bei Booleans
                      setValAtPath(path, e.target.value === "true");
                      setIsEditingVal(false);
                    }}
                    onBlur={() => setIsEditingVal(false)}
                    autoFocus
                    className="bg-hero-input border rounded px-1 text-white font-mono text-xs focus:outline-none"
                    style={{ borderColor: "var(--color-primary-accent)" }}
                  >
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : (
                  <input
                    value={valInput}
                    onChange={(e) => setValInput(e.target.value)}
                    onBlur={handleValSubmit}
                    onKeyDown={(e) => e.key === "Enter" && handleValSubmit()}
                    autoFocus
                    className="bg-hero-input border rounded px-1 text-white font-mono text-xs w-48 focus:outline-none"
                    style={{ borderColor: "var(--color-primary-accent)" }}
                  />
                )
              ) : (
                <span
                  onDoubleClick={() => type !== "null" && setIsEditingVal(true)}
                  className={`cursor-pointer border-b border-transparent font-mono font-medium hover:border-dashed hover:border-slate-400 truncate max-w-sm ${type === "string" ? "text-hero-string" :
                      type === "number" ? "text-hero-number" :
                        type === "boolean" ? "text-hero-boolean" :
                          "text-hero-null italic"
                    }`}
                >
                  {type === "null" ? "null" : type === "string" ? `"${val}"` : String(val)}
                </span>
              )}

              {/* Kleines Typ-Badge */}
              <span className={`px-1 rounded border text-[9px] font-mono select-none ${getTypeBadgeClass(type)}`}>
                {type}
              </span>
            </div>
          )}
        </div>

        {/* Kinder (rekursives Rendern) */}
        {hasChildren && isExpanded && (
          <div className="ml-3 pl-3 border-l border-slate-800/80 space-y-1 my-1">
            {type === "object"
              ? Object.keys(val).map((k) => (
                <TreeNode
                  key={k}
                  path={[...path, k]}
                  nodeKey={k}
                  val={val[k]}
                  parentType="object"
                />
              ))
              : val.map((item: any, idx: number) => (
                <TreeNode
                  key={idx}
                  path={[...path, idx]}
                  nodeKey={idx}
                  val={item}
                  parentType="array"
                />
              ))
            }
          </div>
        )}
      </div>
    );
  };

  const canAddChildToContext =
    contextMenu &&
    (contextMenu.type === "object" || contextMenu.type === "array") &&
    !(mode === "xml" && contextMenu.parentType === "root" && jsonValue && typeof jsonValue === "object" && Object.keys(jsonValue).length >= 1);

  return (
    <div className="w-full h-full p-6 pb-48 overflow-auto bg-hero-bg select-none">
      {jsonValue !== undefined && (
        <TreeNode
          path={[]}
          nodeKey=""
          val={jsonValue}
          parentType="root"
        />
      )}

      {/* Custom absolute-positioniertes Kontextmenü */}
      {contextMenu && (
        <div
          style={{ top: contextMenu.y, left: contextMenu.x }}
          className="fixed z-50 bg-[#0f172a] border border-slate-800 rounded-lg shadow-2xl py-1.5 w-56 select-none"
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.parentType !== "root" && (
            <>
              <button
                onClick={() => {
                  insertAdjacent(contextMenu.path, "before", contextMenu.nodeKey);
                  setContextMenu(null);
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-white flex items-center space-x-2"
              >
                <ArrowUp size={12} />
                <span>{t("views.insertBefore")}</span>
              </button>

              <button
                onClick={() => {
                  insertAdjacent(contextMenu.path, "after", contextMenu.nodeKey);
                  setContextMenu(null);
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-white flex items-center space-x-2"
              >
                <ArrowDown size={12} />
                <span>{t("views.insertAfter")}</span>
              </button>

              <div className="h-[1px] bg-slate-850 my-1"></div>
            </>
          )}

          {canAddChildToContext && (
            <div className="relative group/sub">
              <div className="w-full px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-white flex items-center justify-between cursor-pointer">
                <span className="flex items-center space-x-2">
                  <Plus size={12} />
                  <span>{t("views.addChild")}</span>
                </span>
                <ChevronRight size={10} className="text-slate-500" />
              </div>

              {/* Submenu for child types */}
              <div className="absolute left-full top-0 ml-0.5 bg-[#0f172a] border border-slate-800 rounded-lg shadow-2xl py-1 w-36 hidden group-hover/sub:block">
                <button
                  onClick={() => {
                    addChild(contextMenu.path, "string");
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-white flex items-center space-x-1.5"
                >
                  <Type size={11} className="text-hero-string" />
                  <span>{t("views.typeString")}</span>
                </button>
                <button
                  onClick={() => {
                    addChild(contextMenu.path, "number");
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-white flex items-center space-x-1.5"
                >
                  <Hash size={11} className="text-hero-number" />
                  <span>{t("views.typeNumber")}</span>
                </button>
                <button
                  onClick={() => {
                    addChild(contextMenu.path, "boolean");
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-white flex items-center space-x-1.5"
                >
                  <ToggleLeft size={11} className="text-hero-boolean" />
                  <span>{t("views.typeBoolean")}</span>
                </button>
                <button
                  onClick={() => {
                    addChild(contextMenu.path, "object");
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-white flex items-center space-x-1.5"
                >
                  <Braces size={11} className="text-hero-object" />
                  <span>{t("views.typeObject")}</span>
                </button>
                <button
                  onClick={() => {
                    addChild(contextMenu.path, "array");
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-white flex items-center space-x-1.5"
                >
                  <List size={11} className="text-hero-array" />
                  <span>{t("views.typeArray")}</span>
                </button>
              </div>
            </div>
          )}

          {contextMenu.parentType !== "root" && (
            <>
              {canAddChildToContext && <div className="h-[1px] bg-slate-850 my-1"></div>}

              <button
                onClick={() => {
                  deleteNode(contextMenu.path);
                  setContextMenu(null);
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-rose-500 hover:bg-rose-950/30 hover:text-rose-400 flex items-center space-x-2 font-semibold"
              >
                <Trash2 size={12} />
                <span>{t("views.deleteNode")}</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};
// Version 0.11.1

