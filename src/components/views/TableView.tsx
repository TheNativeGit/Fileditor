import React, { useState, useEffect, useMemo } from "react";
import { useFileStore } from "../../store/useFileStore";
import { useTranslation } from "../../i18n";
import { resolveSchemaNode } from "../../utils/schemaValidator";
import { Select, Button, Input, Switch, InputNumber, Empty, Tooltip } from "antd";
import { Trash2, Plus, ArrowRight, Table } from "lucide-react";

// Helper: Returns the value at a specified path
const getValueAtPath = (val: any, path: (string | number)[]) => {
  let current = val;
  for (const key of path) {
    if (current === null || current === undefined) return undefined;
    current = current[key];
  }
  return current;
};

// Helper: Resolves the JSON schema definition for a path (supports Draft-04..2020-12 $ref/$defs & JTD)
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

// Helper: Creates default objects based on schema properties
const createDefaultFromSchema = (rawSchema: any, rootSchema?: any): any => {
  const schema = resolveSchemaNode(rawSchema, rootSchema || rawSchema);
  if (!schema) return {};
  if (schema.type === "object" || schema.properties || schema.optionalProperties) {
    const obj: any = {};
    const props = { ...(schema.optionalProperties || {}), ...(schema.properties || {}) };
    Object.keys(props).forEach((k) => {
      const prop = resolveSchemaNode(props[k], rootSchema || rawSchema) || {};
      if (prop.type === "array" || prop.elements) obj[k] = [];
      else if (prop.type === "object" || prop.properties) obj[k] = {};
      else if (
        prop.type === "number" ||
        prop.type === "integer" ||
        ["int8", "uint8", "int16", "uint16", "int32", "uint32", "float32", "float64"].includes(prop.type)
      ) {
        obj[k] = prop.minimum !== undefined ? prop.minimum : 0;
      } else if (prop.type === "boolean") obj[k] = prop.default !== undefined ? prop.default : false;
      else obj[k] = prop.default !== undefined ? prop.default : "";
    });
    return obj;
  }
  return {};
};

// Helper: Determines the JavaScript type of a value
const getTypeLabel = (val: any): "string" | "number" | "boolean" | "null" | "array" | "object" => {
  if (val === null) return "null";
  if (Array.isArray(val)) return "array";
  if (typeof val === "object") return "object";
  if (typeof val === "number") return "number";
  if (typeof val === "boolean") return "boolean";
  return "string";
};

interface TableOption {
  path: (string | number)[];
  pathStr: string;
  label: string;
}

export const TableView: React.FC = () => {
  const { t } = useTranslation();
  const {
    mode,
    jsonValue,
    schemaValue,
    updateJsonValue,
    setViewMode,
    setActivePath
  } = useFileStore();

  const [selectedTableKey, setSelectedTableKey] = useState<string>("");

  // Rekursives Finden aller Arrays von Objekten im JSON/XML
  const tableOptions = useMemo((): TableOption[] => {
    const findTables = (val: any, path: (string | number)[] = []): TableOption[] => {
      if (val === null || typeof val !== "object") return [];
      let results: TableOption[] = [];

      if (Array.isArray(val)) {
        const hasObjectRows = val.some(
          (item) => item !== null && typeof item === "object" && !Array.isArray(item)
        );
        if (hasObjectRows) {
          const pathStr = path.length === 0 ? "Root" : path.map(p => typeof p === "number" ? `[${p}]` : p).join(".");
          results.push({
            path,
            pathStr,
            label: t("views.entriesCount", { path: pathStr, count: val.length })
          });
        }
        // Rekursion in Array-Einträge
        val.forEach((item, index) => {
          results = results.concat(findTables(item, [...path, index]));
        });
      } else {
        // Rekursion in Objekt-Schlüssel
        Object.keys(val).forEach((key) => {
          results = results.concat(findTables(val[key], [...path, key]));
        });
      }

      return results;
    };

    return findTables(jsonValue);
  }, [jsonValue, t]);

  // Standardmäßig die erste Tabelle auswählen, falls keine ausgewählt ist
  useEffect(() => {
    if (tableOptions.length > 0) {
      const exists = tableOptions.some(opt => opt.pathStr === selectedTableKey);
      if (!exists) {
        setSelectedTableKey(tableOptions[0].pathStr);
      }
    } else {
      setSelectedTableKey("");
    }
  }, [tableOptions, selectedTableKey]);

  // Holt das aktuell ausgewählte Array
  const activeTableOption = useMemo(() => {
    return tableOptions.find(opt => opt.pathStr === selectedTableKey) || null;
  }, [tableOptions, selectedTableKey]);

  const tableData = useMemo(() => {
    if (!activeTableOption) return [];
    const data = getValueAtPath(jsonValue, activeTableOption.path);
    return Array.isArray(data) ? data : [];
  }, [jsonValue, activeTableOption]);

  // Alle eindeutigen Spaltennamen sammeln
  const columns = useMemo((): string[] => {
    if (!tableData || tableData.length === 0) return [];
    const keysSet = new Set<string>();
    tableData.forEach((row) => {
      if (row && typeof row === "object") {
        Object.keys(row).forEach((k) => keysSet.add(k));
      }
    });
    return Array.from(keysSet);
  }, [tableData]);

  // Schema der Tabelleneinträge ermitteln
  const rowSchema = useMemo(() => {
    if (!activeTableOption) return null;
    const arraySchema = getSchemaForPath(schemaValue, activeTableOption.path);
    const itemNode = arraySchema?.items || arraySchema?.elements || null;
    return resolveSchemaNode(itemNode, schemaValue);
  }, [schemaValue, activeTableOption]);

  // Inferred column types from existing rows (useful for schemaless JSON / XML)
  const inferredColumnTypes = useMemo(() => {
    const map: Record<string, "string" | "number" | "boolean" | "array" | "object"> = {};
    for (const col of columns) {
      for (const row of tableData) {
        if (row && typeof row === "object" && row[col] !== undefined && row[col] !== null) {
          const t = getTypeLabel(row[col]);
          if (t !== "null") {
            map[col] = t;
            break;
          }
        }
      }
    }
    return map;
  }, [columns, tableData]);

  // --- TABELLEN-AKTIONEN ---

  // Ändert eine Zelle
  const updateCell = (rowIndex: number, colName: string, value: any) => {
    if (!activeTableOption) return;

    const rootCopy = JSON.parse(JSON.stringify(jsonValue));
    let parent = rootCopy;

    for (const seg of activeTableOption.path) {
      parent = parent[seg];
    }

    if (parent && parent[rowIndex] && typeof parent[rowIndex] === "object" && !Array.isArray(parent[rowIndex])) {
      parent[rowIndex][colName] = value;
      updateJsonValue(rootCopy);
    }
  };

  // Deletes a row at index
  const deleteRow = (rowIndex: number) => {
    if (!activeTableOption) return;

    const rootCopy = JSON.parse(JSON.stringify(jsonValue));
    let parent = rootCopy;

    for (const seg of activeTableOption.path) {
      parent = parent[seg];
    }

    if (Array.isArray(parent)) {
      parent.splice(rowIndex, 1);
      updateJsonValue(rootCopy);
    }
  };

  // Adds a new row
  const addRow = () => {
    if (!activeTableOption) return;

    const rootCopy = JSON.parse(JSON.stringify(jsonValue));
    let parent = rootCopy;

    for (const seg of activeTableOption.path) {
      parent = parent[seg];
    }

    if (Array.isArray(parent)) {
      let defaultRow = createDefaultFromSchema(rowSchema, schemaValue);
      if ((!defaultRow || Object.keys(defaultRow).length === 0) && columns.length > 0) {
        defaultRow = {};
        columns.forEach((col) => {
          const t = inferredColumnTypes[col];
          if (t === "boolean") defaultRow[col] = false;
          else if (t === "number") defaultRow[col] = 0;
          else if (t === "array") defaultRow[col] = [];
          else if (t === "object") defaultRow[col] = {};
          else defaultRow[col] = "";
        });
      }
      parent.push(defaultRow);
      updateJsonValue(rootCopy);
    }
  };

  // Navigiert zu einem verschachtelten Pfad in den Miller Columns
  const navigateToColumn = (rowIndex: number, colName: string) => {
    if (!activeTableOption) return;
    const targetPath = [...activeTableOption.path, rowIndex, colName];
    setActivePath(targetPath);
    setViewMode("column");
  };

  if (tableOptions.length === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-hero-bg text-slate-400 p-8 select-none">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <div className="text-center">
              <span className="text-sm font-semibold text-slate-300 block mb-1">{t("views.noTableDataTitle")}</span>
              <span className="text-xs text-slate-500 max-w-sm block">
                {mode === "xml"
                  ? t("views.noTableDataXmlDesc")
                  : t("views.noTableDataJsonDesc")}
              </span>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-hero-bg overflow-hidden p-6 select-none">
      {/* Table selector bar */}
      <div className="shrink-0 flex items-center justify-between pb-4 border-b border-hero-border mb-4">
        <div className="flex items-center space-x-3">
          <Table size={16} style={{ color: "var(--color-primary-accent)" }} />
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono">
            {t("views.selectTable")}
          </span>
          <Select
            value={selectedTableKey}
            onChange={setSelectedTableKey}
            options={tableOptions.map((opt) => ({
              label: opt.label,
              value: opt.pathStr
            }))}
            className="w-80 text-xs"
            dropdownClassName="bg-[#0f172a] text-slate-300"
          />
        </div>

        <Button
          type="primary"
          icon={<Plus size={13} />}
          onClick={addRow}
          className="border-none text-xs flex items-center h-8"
        >
          {t("views.addRow")}
        </Button>
      </div>

      {/* The Table */}
      <div className="flex-1 overflow-auto border border-hero-border rounded-lg bg-hero-panel">
        <table className="w-full text-left border-collapse table-auto">
          <thead>
            <tr className="bg-hero-input border-b border-hero-border select-none text-[10px] uppercase font-mono tracking-wider text-slate-400">
              <th className="p-3 w-12 text-center">{t("views.actionCol")}</th>
              <th className="p-3 w-12 text-center">{t("views.indexCol")}</th>
              {columns.map((col) => (
                <th key={col} className="p-3 font-semibold min-w-[150px]">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-hero-border/60">
            {tableData.map((row, rIdx) => (
              <tr key={rIdx} className="hover:bg-hero-hover/30 transition-colors duration-75 text-xs text-slate-300">
                {/* Column: Delete Row */}
                <td className="p-2.5 text-center">
                  <Tooltip title={t("views.deleteRow")}>
                    <Button
                      type="text"
                      danger
                      icon={<Trash2 size={13} />}
                      onClick={() => deleteRow(rIdx)}
                      className="flex items-center justify-center hover:bg-rose-950/20 border-none mx-auto"
                    />
                  </Tooltip>
                </td>

                {/* Spalte: Index */}
                <td className="p-2.5 text-center font-mono text-[10px] text-slate-500 font-semibold select-none">
                  {rIdx}
                </td>

                {/* Zellen der Zeile */}
                {columns.map((col) => {
                  const isObjRow = row !== null && typeof row === "object" && !Array.isArray(row);
                  const cellVal = isObjRow ? row[col] : undefined;
                  const rawCellSchema = rowSchema?.properties?.[col] || rowSchema?.optionalProperties?.[col];
                  const cellSchema = resolveSchemaNode(rawCellSchema, schemaValue);
                  let cellType = getTypeLabel(cellVal);
                  if (cellVal === undefined) {
                    const schemaType = cellSchema?.type;
                    if (schemaType === "boolean") cellType = "boolean";
                    else if (
                      schemaType === "number" ||
                      schemaType === "integer" ||
                      ["int8", "uint8", "int16", "uint16", "int32", "uint32", "float32", "float64"].includes(schemaType)
                    ) {
                      cellType = "number";
                    } else if (inferredColumnTypes[col] === "boolean") {
                      cellType = "boolean";
                    } else if (inferredColumnTypes[col] === "number") {
                      cellType = "number";
                    }
                  }

                  if (!isObjRow) {
                    return (
                      <td key={col} className="p-2.5 text-slate-600 italic font-mono text-[11px]">
                        –
                      </td>
                    );
                  }

                  // If the cell contains a nested object or array
                  if (cellVal !== null && typeof cellVal === "object") {
                    const isArr = Array.isArray(cellVal);
                    return (
                      <td key={col} className="p-2.5">
                        <Button
                          type="dashed"
                          size="small"
                          icon={<ArrowRight size={10} />}
                          onClick={() => navigateToColumn(rIdx, col)}
                          className="text-[10px] bg-transparent border-hero-border flex items-center space-x-1 py-0 px-2 h-6"
                        >
                          <span className="font-mono text-slate-400 font-semibold uppercase">
                            {isArr ? t("views.listBadge", { count: cellVal.length }) : t("views.objectBadge")}
                          </span>
                        </Button>
                      </td>
                    );
                  }

                  // Standard editors depending on value type
                  return (
                    <td key={col} className="p-2.5">
                      {cellType === "boolean" ? (
                        <div className="flex items-center h-8">
                          <Switch
                            checked={!!cellVal}
                            onChange={(val) => updateCell(rIdx, col, val)}
                            size="small"
                          />
                        </div>
                      ) : cellType === "number" ? (
                        <InputNumber
                          value={typeof cellVal === "number" ? cellVal : undefined}
                          onChange={(val) => {
                            if (typeof val === "number" && !Number.isNaN(val)) {
                              updateCell(rIdx, col, val);
                            }
                          }}
                          className="w-full bg-hero-bg border-hero-border text-white text-xs h-8 flex items-center"
                          min={cellSchema?.minimum}
                          max={cellSchema?.maximum}
                          placeholder="0"
                        />
                      ) : (
                        <Input
                          value={cellVal !== undefined && cellVal !== null ? String(cellVal) : ""}
                          onChange={(e) => updateCell(rIdx, col, e.target.value)}
                          className="w-full bg-hero-bg border-hero-border text-white text-xs h-8"
                          placeholder={cellVal === null ? "null" : t("views.enterValue")}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}

            {tableData.length === 0 && (
              <tr>
                <td colSpan={columns.length + 2} className="p-8 text-center text-xs text-slate-500 italic">
                  {t("views.noRows")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
// Version 0.11.1