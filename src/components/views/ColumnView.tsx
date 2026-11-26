import React, { useRef, useEffect, useState } from "react";
import { useFileStore } from "../../store/useFileStore";
import { useTranslation } from "../../i18n";
import { resolveSchemaNode } from "../../utils/schemaValidator";
import { isValidXmlName } from "../../utils/xmlConverter";
import { Button, Input, Switch, InputNumber, Tooltip, Dropdown, message } from "antd";
import {
  ChevronRight,
  Trash2,
  Plus,
  Braces,
  List,
  Type,
  Hash,
  ToggleLeft,
  EyeOff
} from "lucide-react";

// Helper: Returns the value at a specific path
const getValueAtPath = (val: any, path: (string | number)[]) => {
  let current = val;
  for (const key of path) {
    if (current === null || current === undefined) return undefined;
    current = current[key];
  }
  return current;
};

// Helper: Resolves the schema definition for a JSON path (supports Draft-04..2020-12 $ref/$defs & JTD)
const getSchemaForPath = (schema: any, path: (string | number)[]): any => {
  if (!schema) return null;
  let current = resolveSchemaNode(schema, schema);

  for (const segment of path) {
    current = resolveSchemaNode(current, schema);
    if (!current) return null;

    if (typeof segment === "string") {
      if (current.properties && current.properties[segment]) {
        current = current.properties[segment];
      } else if (current.optionalProperties && current.optionalProperties[segment]) {
        current = current.optionalProperties[segment];
      } else if (current.values && typeof current.values === "object") {
        current = current.values;
      } else if (current.additionalProperties && typeof current.additionalProperties === "object") {
        current = current.additionalProperties;
      } else {
        return null;
      }
    } else if (typeof segment === "number") {
      if (Array.isArray(current.prefixItems) && current.prefixItems[segment]) {
        current = current.prefixItems[segment];
      } else if (current.items) {
        if (Array.isArray(current.items)) {
          current = current.items[segment] || current.items[0];
        } else {
          current = current.items;
        }
      } else if (current.elements) {
        current = current.elements;
      } else {
        return null;
      }
    }
  }
  return resolveSchemaNode(current, schema);
};

// Helper: Returns a matching icon component for the data type
const getTypeIcon = (val: any) => {
  if (val === null) return <EyeOff size={13} className="text-hero-null" />;
  if (Array.isArray(val)) return <List size={13} className="text-hero-array" />;
  if (typeof val === "object") return <Braces size={13} className="text-hero-object" />;
  if (typeof val === "number") return <Hash size={13} className="text-hero-number" />;
  if (typeof val === "boolean") return <ToggleLeft size={13} className="text-hero-boolean" />;
  return <Type size={13} className="text-hero-string" />;
};

// Helper: Returns the type label string
const getTypeLabel = (val: any): string => {
  if (val === null) return "null";
  if (Array.isArray(val)) return "array";
  if (typeof val === "object") return "object";
  if (typeof val === "number") return Number.isInteger(val) ? "integer" : "number";
  if (typeof val === "boolean") return "boolean";
  return "string";
};

// Helper: Generates a default object structure based on schema
const createDefaultFromSchema = (rawSchema: any, rootSchema?: any): any => {
  const schema = resolveSchemaNode(rawSchema, rootSchema || rawSchema);
  if (!schema) return "";
  if (schema.default !== undefined) return schema.default;

  if (schema.properties || schema.optionalProperties || schema.type === "object") {
    const obj: any = {};
    if (schema.properties) {
      Object.keys(schema.properties).forEach((k) => {
        obj[k] = createDefaultFromSchema(schema.properties[k], rootSchema || rawSchema);
      });
    }
    return obj;
  }

  if (schema.elements || schema.type === "array") return [];
  if (
    schema.type === "number" ||
    schema.type === "integer" ||
    ["int8", "uint8", "int16", "uint16", "int32", "uint32", "float32", "float64"].includes(schema.type)
  ) {
    return schema.minimum !== undefined ? schema.minimum : 0;
  }
  if (schema.type === "boolean") return false;
  return "";
};

export const ColumnView: React.FC = () => {
  const { t } = useTranslation();
  const {
    mode,
    jsonValue,
    schemaValue,
    activePath,
    setActivePath,
    updateJsonValue
  } = useFileStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const [addingPropToPath, setAddingPropToPath] = useState<string | null>(null);
  const [newPropName, setNewPropName] = useState("");
  const [newPropType, setNewPropType] = useState<string>("string");

  // Automatischer Scroll nach rechts bei Pfad-Erweiterung
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        left: containerRef.current.scrollWidth,
        behavior: "smooth"
      });
    }
  }, [activePath.length]);

  // Tiefergehende Wertänderung an einem Pfad
  const setDeepValue = (path: (string | number)[], newValue: any) => {
    const rootCopy = JSON.parse(JSON.stringify(jsonValue));

    if (path.length === 0) {
      updateJsonValue(newValue);
      return;
    }

    let current = rootCopy;
    for (let i = 0; i < path.length - 1; i++) {
      current = current[path[i]];
    }

    current[path[path.length - 1]] = newValue;
    updateJsonValue(rootCopy);
  };

  // Deletes a key from an object or an entry from an array
  const deletePathItem = (path: (string | number)[]) => {
    const rootCopy = JSON.parse(JSON.stringify(jsonValue));

    if (path.length === 0) return;

    let current = rootCopy;
    for (let i = 0; i < path.length - 1; i++) {
      current = current[path[i]];
    }

    const lastKey = path[path.length - 1];
    if (Array.isArray(current)) {
      current.splice(lastKey as number, 1);
    } else {
      delete current[lastKey];
    }

    // Aktiven Pfad anpassen, falls nötig (segmentgenauer Präfixvergleich)
    const newActivePath = [...activePath];
    const isPrefix =
      activePath.length >= path.length &&
      path.every((seg, i) => activePath[i] === seg);
    if (isPrefix) {
      newActivePath.splice(path.length - 1);
    }

    setActivePath(newActivePath);
    updateJsonValue(rootCopy);
  };

  // Appends a new item to an array
  const addArrayItem = (path: (string | number)[], itemSchema: any, explicitType?: string) => {
    const rootCopy = JSON.parse(JSON.stringify(jsonValue));
    let arr = rootCopy;

    if (path.length > 0) {
      let current = rootCopy;
      for (let i = 0; i < path.length; i++) {
        current = current[path[i]];
      }
      arr = current;
    }

    if (Array.isArray(arr)) {
      let defaultValue: any;
      if (explicitType) {
        if (explicitType === "object") defaultValue = {};
        else if (explicitType === "array") defaultValue = [];
        else if (explicitType === "number") defaultValue = 0;
        else if (explicitType === "boolean") defaultValue = false;
        else defaultValue = "";
      } else {
        defaultValue = createDefaultFromSchema(itemSchema, schemaValue);
      }
      arr.push(defaultValue);
      updateJsonValue(rootCopy);

      // Fokus auf das neu hinzugefügte Element setzen
      setActivePath([...path, arr.length - 1]);
    }
  };

  // Adds a new property to an object
  const handleAddProperty = (path: (string | number)[]) => {
    const trimmedKey = newPropName.trim();
    if (!trimmedKey) return;

    if (mode === "xml") {
      if (path.length === 0) {
        message.warning(t("views.xmlSingleRootWarning"));
        return;
      }
      const attrOrTag = trimmedKey.startsWith("@_") ? trimmedKey.slice(2) : trimmedKey;
      if (trimmedKey !== "#text" && !isValidXmlName(attrOrTag)) {
        message.warning(t("views.invalidXmlName", { name: trimmedKey }));
        return;
      }
    }

    const rootCopy = JSON.parse(JSON.stringify(jsonValue));
    let obj = rootCopy;

    if (path.length > 0) {
      let current = rootCopy;
      for (let i = 0; i < path.length; i++) {
        current = current[path[i]];
      }
      obj = current;
    }

    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      if (obj[trimmedKey] !== undefined) {
        // Schlüssel existiert bereits
        return;
      }

      let defaultValue: any = "";
      if (newPropType === "object") defaultValue = {};
      else if (newPropType === "array") defaultValue = [];
      else if (newPropType === "number") defaultValue = 0;
      else if (newPropType === "boolean") defaultValue = false;

      obj[trimmedKey] = defaultValue;
      updateJsonValue(rootCopy);

      // Fokus auf die neue Eigenschaft setzen
      setActivePath([...path, trimmedKey]);
      setAddingPropToPath(null);
      setNewPropName("");
    }
  };

  // Liefert die Menüoptionen für die Typ-Auswahl beim Hinzufügen eines Elements
  const getAddMenuProps = (path: (string | number)[], itemSchema: any) => ({
    items: [
      { key: "string", label: t("views.typeString") },
      { key: "number", label: t("views.typeNumber") },
      { key: "boolean", label: t("views.typeBoolean") },
      { key: "object", label: t("views.typeObject") },
      { key: "array", label: t("views.typeArray") }
    ],
    onClick: ({ key }: { key: string }) => {
      addArrayItem(path, itemSchema, key);
    }
  });

  // Spalten rendern
  const columns: React.ReactNode[] = [];

  // Wir beginnen mit Column 0 (Root)
  let currentPath: (string | number)[] = [];
  let currentValue = jsonValue;

  const totalColumns = activePath.length + 1;

  for (let colIdx = 0; colIdx < totalColumns; colIdx++) {
    const parentPath = [...currentPath];
    const columnVal = currentValue;

    // Nächsten Pfad vorbereiten
    const nextKey = activePath[colIdx];

    if (columnVal === null || columnVal === undefined) break;

    const colSchema = getSchemaForPath(schemaValue, parentPath);

    // Render-Logik für Spalte
    if (Array.isArray(columnVal)) {
      // Ist es ein primitives Array (z. B. Liste von Strings)?
      const isPrimitiveArray = columnVal.every(
        (item) => typeof item !== "object" || item === null
      );

      if (isPrimitiveArray) {
        columns.push(
          <div key={`col-${colIdx}`} className="w-80 flex-shrink-0 flex flex-col h-full bg-hero-panel border-r border-hero-border select-none">
            {/* Spaltenheader */}
            <div className="h-9 bg-hero-panel/90 backdrop-blur px-4 border-b border-hero-border flex items-center justify-between select-none shrink-0">
              <span className="text-xs font-semibold text-slate-400 font-mono truncate max-w-[200px]">
                {parentPath[parentPath.length - 1] || "Root"}
              </span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded font-semibold text-hero-array bg-hero-array/10 border border-hero-array/20">
                array ({columnVal.length})
              </span>
            </div>

            {/* Spalteninhalt: Editierbare Primitiv-Liste */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {columnVal.map((item, idx) => (
                <div key={idx} className="flex items-center space-x-2 group">
                  <span className="text-[10px] font-mono text-slate-500 w-5 text-right select-none">{idx}</span>
                  {typeof item === "boolean" ? (
                    <div className="flex-1 flex items-center justify-between bg-hero-input border border-hero-border rounded px-2 h-8">
                      <span className="text-xs font-mono text-slate-400">{t("views.yesNo")}</span>
                      <Switch
                        checked={item}
                        onChange={(val) => setDeepValue([...parentPath, idx], val)}
                        size="small"
                      />
                    </div>
                  ) : typeof item === "number" ? (
                    <InputNumber
                      value={item}
                      onChange={(val) => {
                        if (typeof val === "number" && !Number.isNaN(val)) {
                          setDeepValue([...parentPath, idx], val);
                        }
                      }}
                      className="flex-1 bg-hero-input border-hero-border text-white text-xs h-8"
                      min={colSchema?.items?.minimum}
                      max={colSchema?.items?.maximum}
                    />
                  ) : (
                    <Input
                      value={item ?? ""}
                      onChange={(e) => setDeepValue([...parentPath, idx], e.target.value)}
                      className="flex-1 bg-hero-input border-hero-border text-white text-xs h-8"
                      placeholder={item === null ? "null" : t("views.enterValue")}
                    />
                  )}
                  <Tooltip title={t("views.deleteItem")}>
                    <Button
                      type="text"
                      danger
                      icon={<Trash2 size={13} />}
                      onClick={() => deletePathItem([...parentPath, idx])}
                      className="flex items-center justify-center hover:bg-rose-950/20 border-none shrink-0"
                    />
                  </Tooltip>
                </div>
              ))}

              {columnVal.length === 0 && (
                <div className="text-xs text-slate-500 italic text-center py-4">{t("views.noEntries")}</div>
              )}

              <Dropdown menu={getAddMenuProps(parentPath, colSchema?.items || colSchema?.elements)} trigger={["click"]}>
                <Button
                  type="dashed"
                  icon={<Plus size={12} />}
                  className="w-full text-xs text-slate-400 hover:text-white border-hero-border bg-transparent mt-2"
                >
                  {t("views.addItem")}
                </Button>
              </Dropdown>
            </div>
          </div>
        );
      } else {
        // Komplexes Array (z. B. Array aus Objekten)
        columns.push(
          <div key={`col-${colIdx}`} className="w-80 flex-shrink-0 flex flex-col h-full bg-hero-panel border-r border-hero-border select-none">
            {/* Spaltenheader */}
            <div className="h-9 bg-hero-panel/90 px-4 border-b border-hero-border flex items-center justify-between select-none shrink-0">
              <span className="text-xs font-semibold text-slate-400 font-mono truncate max-w-[200px]">
                {parentPath[parentPath.length - 1] || "Root"}
              </span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded font-semibold text-hero-array bg-hero-array/10 border border-hero-array/20">
                array ({columnVal.length})
              </span>
            </div>

            {/* Liste der Index-Einträge */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {columnVal.map((item, idx) => {
                const isSelected = nextKey === idx;

                // Homogenes Objekt-Label ausfindig machen (z. B. "Name", "Titel", "name", "title")
                let displayLabel = t("views.entryLabel", { index: idx });
                if (item && typeof item === "object") {
                  if (item.Fischname !== undefined) displayLabel = `${item.Fischname}`;
                  else if (item.Name !== undefined) displayLabel = `${item.Name}`;
                  else if (item.name !== undefined) displayLabel = `${item.name}`;
                  else if (item.Titel !== undefined) displayLabel = `${item.Titel}`;
                  else if (item.title !== undefined) displayLabel = `${item.title}`;
                  else if (item.label !== undefined) displayLabel = `${item.label}`;
                  else if (item.id !== undefined) displayLabel = `ID: ${item.id}`;
                  else if (item["#text"] !== undefined) displayLabel = `${item["#text"]}`;
                }

                return (
                  <div
                    key={idx}
                    onClick={() => setActivePath([...parentPath, idx])}
                    className={`group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-xs transition-colors duration-150 select-none ${
                      isSelected ? "border" : "text-slate-300 hover:bg-hero-hover border border-transparent"
                    }`}
                    style={
                      isSelected
                        ? {
                            backgroundColor: "rgba(var(--color-primary-accent-rgb), 0.14)",
                            color: "var(--color-primary-accent)",
                            borderColor: "rgba(var(--color-primary-accent-rgb), 0.45)"
                          }
                        : undefined
                    }
                  >
                    <div className="flex items-center space-x-2.5 truncate min-w-0">
                      <span className="font-mono text-[10px] text-slate-500 shrink-0">[{idx}]</span>
                      <span className="font-semibold truncate">{displayLabel}</span>
                    </div>
                    <div className="flex items-center space-x-1 shrink-0">
                      <Tooltip title={t("views.deleteItem")}>
                        <Button
                          type="text"
                          danger
                          icon={<Trash2 size={12} />}
                          onClick={(e) => {
                            e.stopPropagation();
                            deletePathItem([...parentPath, idx]);
                          }}
                          className="hidden group-hover:flex items-center justify-center hover:bg-rose-950/20 border-none shrink-0"
                        />
                      </Tooltip>
                      <ChevronRight size={13} style={isSelected ? { color: "var(--color-primary-accent)" } : undefined} className={isSelected ? "" : "text-slate-500"} />
                    </div>
                  </div>
                );
              })}

              {columnVal.length === 0 && (
                <div className="text-xs text-slate-500 italic text-center py-8">{t("views.noEntries")}</div>
              )}

              <Dropdown menu={getAddMenuProps(parentPath, colSchema?.items || colSchema?.elements)} trigger={["click"]}>
                <Button
                  type="dashed"
                  icon={<Plus size={12} />}
                  className="w-full text-xs text-slate-400 hover:text-white border-hero-border bg-transparent mt-2"
                >
                  {t("views.addItem")}
                </Button>
              </Dropdown>
            </div>
          </div>
        );
      }
    } else if (typeof columnVal === "object" && columnVal !== null) {
      // Es ist ein Objekt
      const keys = Object.keys(columnVal);

      columns.push(
        <div key={`col-${colIdx}`} className="w-80 flex-shrink-0 flex flex-col h-full bg-hero-panel border-r border-hero-border select-none">
          {/* Spaltenheader */}
          <div className="h-9 bg-hero-panel/90 px-4 border-b border-hero-border flex items-center justify-between select-none shrink-0">
            <span className="text-xs font-semibold text-slate-400 font-mono truncate max-w-[200px]">
              {parentPath[parentPath.length - 1] || "Root"}
            </span>
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded font-semibold text-hero-object bg-hero-object/10 border border-hero-object/20">
              object ({keys.length})
            </span>
          </div>

          {/* Liste der Keys */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {keys.map((key) => {
              const isSelected = nextKey === key;
              const childVal = columnVal[key];
              const childType = getTypeLabel(childVal);
              const isComplex = childVal !== null && typeof childVal === "object";

              // Badge-Farben basierend auf dem Typ
              let typeBadgeClass = "bg-slate-950/50 text-slate-400 border-slate-800";
              if (childType === "string") typeBadgeClass = "bg-emerald-950/50 text-hero-string border-emerald-800/50";
              if (childType === "number" || childType === "integer") typeBadgeClass = "bg-blue-950/50 text-hero-number border-blue-800/50";
              if (childType === "boolean") typeBadgeClass = "bg-purple-950/50 text-hero-boolean border-purple-800/50";
              if (childType === "array") typeBadgeClass = "bg-amber-950/50 text-hero-array border-amber-800/50";
              if (childType === "object") typeBadgeClass = "bg-cyan-950/50 text-hero-object border-cyan-800/50";

              return (
                <div
                  key={key}
                  onClick={() => setActivePath([...parentPath, key])}
                  className={`group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-xs transition-colors duration-150 select-none ${
                    isSelected ? "border" : "text-slate-300 hover:bg-hero-hover border border-transparent"
                  }`}
                  style={
                    isSelected
                      ? {
                          backgroundColor: "rgba(var(--color-primary-accent-rgb), 0.14)",
                          color: "var(--color-primary-accent)",
                          borderColor: "rgba(var(--color-primary-accent-rgb), 0.45)"
                        }
                      : undefined
                  }
                >
                  <div className="flex items-center space-x-2 min-w-0">
                    {getTypeIcon(childVal)}
                    <span className="font-semibold truncate">{key}</span>
                  </div>
                  <div className="flex items-center space-x-1.5 shrink-0">
                    {!(mode === "xml" && parentPath.length === 0) && (
                      <Tooltip title={t("views.deleteProperty")}>
                        <Button
                          type="text"
                          danger
                          icon={<Trash2 size={12} />}
                          onClick={(e) => {
                            e.stopPropagation();
                            deletePathItem([...parentPath, key]);
                          }}
                          className="hidden group-hover:flex items-center justify-center hover:bg-rose-950/20 border-none shrink-0 h-5 w-5 p-0"
                        />
                      </Tooltip>
                    )}
                    <span className={`text-[9px] font-mono px-1 rounded border scale-95 ${typeBadgeClass}`}>
                      {childType === "array" ? `arr [${childVal.length}]` : childType}
                    </span>
                    <ChevronRight size={13} style={isSelected ? { color: "var(--color-primary-accent)" } : undefined} className={isSelected ? "" : "text-slate-500"} />
                  </div>
                </div>
              );
            })}

            {keys.length === 0 && (
              <div className="text-xs text-slate-500 italic text-center py-8">{t("views.emptyObject")}</div>
            )}
          </div>

          {/* Add property section */}
          {!(mode === "xml" && parentPath.length === 0 && keys.length >= 1) && (
          <div className="p-2 border-t border-hero-border/40 mt-auto bg-hero-panel/50 shrink-0">
            {addingPropToPath === JSON.stringify(parentPath) ? (
              <div className="space-y-2 p-2 bg-hero-bg/60 rounded border border-hero-border/60">
                <Input
                  size="small"
                  placeholder={t("views.namePlaceholder")}
                  value={newPropName}
                  onChange={(e) => setNewPropName(e.target.value)}
                  className="bg-hero-input border-hero-border text-xs text-white"
                  autoFocus
                  onPressEnter={() => handleAddProperty(parentPath)}
                />
                <div className="flex space-x-1.5">
                  <Dropdown
                    menu={{
                      items: [
                        { key: "string", label: t("views.typeString") },
                        { key: "number", label: t("views.typeNumber") },
                        { key: "boolean", label: t("views.typeBoolean") },
                        { key: "object", label: t("views.typeObject") },
                        { key: "array", label: t("views.typeArray") }
                      ],
                      onClick: ({ key }) => setNewPropType(key)
                    }}
                    trigger={["click"]}
                  >
                    <Button size="small" className="flex-1 text-[10px] bg-transparent border-hero-border text-slate-300 truncate">
                      {t("views.typePrefix")}: {newPropType}
                    </Button>
                  </Dropdown>
                  <Button
                    size="small"
                    type="primary"
                    className="border-none text-[10px] font-semibold"
                    onClick={() => handleAddProperty(parentPath)}
                  >
                    {t("views.addBtn")}
                  </Button>
                  <Button
                    size="small"
                    className="bg-transparent border-hero-border text-slate-400 text-[10px]"
                    onClick={() => setAddingPropToPath(null)}
                  >
                    X
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="dashed"
                icon={<Plus size={11} />}
                onClick={() => {
                  setAddingPropToPath(JSON.stringify(parentPath));
                  setNewPropName("");
                  setNewPropType("string");
                }}
                className="w-full text-xs text-slate-400 hover:text-white border-hero-border bg-transparent"
              >
                {t("views.addProperty")}
              </Button>
            )}
          </div>
          )}
        </div>
      );
    } else {
      const leafType = getTypeLabel(columnVal);
      const leafSchema = colSchema;

      let leafBadgeClass = "bg-slate-950 text-slate-400 border-slate-800";
      if (leafType === "string") leafBadgeClass = "bg-emerald-950/30 text-hero-string border-emerald-800/50";
      if (leafType === "number" || leafType === "integer") leafBadgeClass = "bg-blue-950/30 text-hero-number border-blue-800/50";
      if (leafType === "boolean") leafBadgeClass = "bg-purple-950/30 text-hero-boolean border-purple-800/50";
      if (leafType === "null") leafBadgeClass = "bg-slate-950/30 text-hero-null border-slate-800/50";

      columns.push(
        <div key={`col-detail`} className="w-80 flex-shrink-0 flex flex-col h-full bg-hero-panel border-r border-hero-border select-none">
          {/* Header */}
          <div className="h-9 bg-hero-panel/90 px-4 border-b border-hero-border flex items-center justify-between select-none shrink-0">
            <span className="text-xs font-semibold text-slate-300 font-mono truncate max-w-[200px]">
              {t("views.detailPrefix")}: {parentPath[parentPath.length - 1] ?? "Root"}
            </span>
          </div>

          {/* Detail content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold font-mono mb-1">{t("views.dataType")}</div>
              <span className={`text-xs font-mono px-2 py-0.5 rounded border ${leafBadgeClass}`}>
                {leafType}
              </span>
            </div>

            {leafSchema?.description && (
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold font-mono mb-1">{t("views.description")}</div>
                <div className="text-xs text-slate-400 leading-relaxed bg-hero-bg/50 p-2.5 rounded border border-hero-border/60">
                  {leafSchema.description}
                </div>
              </div>
            )}

            <div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold font-mono mb-1.5">{t("views.editValue")}</div>

              {leafType === "boolean" ? (
                <div className="flex items-center justify-between bg-hero-input border border-hero-border rounded-lg p-3 h-12">
                  <span className="text-xs text-slate-300">{t("views.booleanSwitch")}</span>
                  <Switch
                    checked={columnVal as boolean}
                    onChange={(val) => setDeepValue(parentPath, val)}
                  />
                </div>
              ) : leafType === "number" || leafType === "integer" ? (
                <div className="space-y-1">
                  <InputNumber
                    value={columnVal as number}
                    onChange={(val) => {
                      if (typeof val === "number" && !Number.isNaN(val)) {
                        setDeepValue(parentPath, val);
                      }
                    }}
                    className="w-full bg-hero-input border-hero-border text-white text-xs h-10 flex items-center"
                    min={leafSchema?.minimum}
                    max={leafSchema?.maximum}
                  />
                  {(leafSchema?.minimum !== undefined || leafSchema?.maximum !== undefined) && (
                    <div className="text-[10px] text-slate-500 font-mono">
                      {t("views.bounds")}: {leafSchema.minimum !== undefined ? `>= ${leafSchema.minimum}` : ""}
                      {leafSchema.minimum !== undefined && leafSchema.maximum !== undefined ? " | " : ""}
                      {leafSchema.maximum !== undefined ? `<= ${leafSchema.maximum}` : ""}
                    </div>
                  )}
                </div>
              ) : leafType === "null" ? (
                <div className="text-xs text-slate-500 italic p-3 bg-hero-input border border-hero-border rounded-lg text-center">
                  {t("views.nullReadonly")}
                </div>
              ) : (
                <Input.TextArea
                  value={columnVal as string}
                  onChange={(e) => setDeepValue(parentPath, e.target.value)}
                  className="w-full bg-hero-input border-hero-border text-white text-xs rounded-lg"
                  autoSize={{ minRows: 2, maxRows: 6 }}
                  placeholder={t("views.enterText")}
                />
              )}
            </div>
          </div>
        </div>
      );
    }

    // Für die nächste Schleife Pfad und Wert vertiefen
    if (nextKey !== undefined) {
      currentPath.push(nextKey);
      currentValue = columnVal[nextKey];
    } else {
      break;
    }
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex flex-row items-stretch overflow-x-auto overflow-y-hidden select-none bg-hero-bg"
    >
      {columns}
    </div>
  );
};
// Version 0.11.1

