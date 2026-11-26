import Ajv, { ErrorObject } from "ajv";
import Ajv2019 from "ajv/dist/2019";
import Ajv2020 from "ajv/dist/2020";
import AjvJtd from "ajv/dist/jtd";
import draft6MetaSchema from "ajv/dist/refs/json-schema-draft-06.json";
import { t } from "../i18n";

export type JsonSchemaDialect =
  | "auto"
  | "draft-04"
  | "draft-06"
  | "draft-07"
  | "2019-09"
  | "2020-12"
  | "jtd";

export type XmlSchemaDialect =
  | "auto"
  | "xsd"
  | "dtd"
  | "rng"
  | "schematron";

// Create AJV instances for each JSON Schema specification family
const ajvDraft07 = new Ajv({
  allErrors: true,
  strict: false,
  verbose: true,
  validateFormats: false,
});

// Register Draft-06 meta-schema on the Draft-07 engine
try {
  ajvDraft07.addMetaSchema(draft6MetaSchema);
} catch {
  // Already registered
}

const ajv2019 = new Ajv2019({
  allErrors: true,
  strict: false,
  verbose: true,
  validateFormats: false,
});

const ajv2020 = new Ajv2020({
  allErrors: true,
  strict: false,
  verbose: true,
  validateFormats: false,
});

const ajvJtd = new AjvJtd({
  allErrors: true,
});

/**
 * Detects the JSON Schema dialect from the schema object's `$schema` URI or JTD structure.
 */
export function detectJsonSchemaDialect(schemaValue: any): Exclude<JsonSchemaDialect, "auto"> {
  if (!schemaValue || typeof schemaValue !== "object") {
    return "draft-07";
  }

  const meta = typeof schemaValue.$schema === "string" ? schemaValue.$schema.toLowerCase() : "";
  if (meta.includes("2020-12")) return "2020-12";
  if (meta.includes("2019-09")) return "2019-09";
  if (meta.includes("draft-06") || meta.includes("draft/06")) return "draft-06";
  if (meta.includes("draft-04") || meta.includes("draft/04")) return "draft-04";
  if (meta.includes("draft-07") || meta.includes("draft/07")) return "draft-07";

  // Heuristic for RFC 8927 JSON Type Definition (JTD) when no $schema is present
  const JTD_SCALAR_TYPES = new Set([
    "int8", "uint8", "int16", "uint16", "int32", "uint32", "float32", "float64", "timestamp"
  ]);
  const hasJtdProps =
    schemaValue.properties &&
    typeof schemaValue.properties === "object" &&
    Object.values(schemaValue.properties).some(
      (p: any) => p && typeof p === "object" && (JTD_SCALAR_TYPES.has(p.type) || "ref" in p || "optionalProperties" in p)
    );

  const hasJsonSchemaKeywords =
    (typeof schemaValue.type === "string" && !JTD_SCALAR_TYPES.has(schemaValue.type)) ||
    Array.isArray(schemaValue.type) ||
    "$defs" in schemaValue ||
    "allOf" in schemaValue ||
    "anyOf" in schemaValue ||
    "oneOf" in schemaValue ||
    "required" in schemaValue;

  if (
    !hasJsonSchemaKeywords &&
    (JTD_SCALAR_TYPES.has(schemaValue.type) ||
      hasJtdProps ||
      "optionalProperties" in schemaValue ||
      "elements" in schemaValue ||
      "values" in schemaValue ||
      "ref" in schemaValue ||
      ("discriminator" in schemaValue && "mapping" in schemaValue))
  ) {
    return "jtd";
  }

  // Heuristic: `$defs` or `prefixItems` without `$schema` indicates 2020-12
  if ("prefixItems" in schemaValue || "$dynamicRef" in schemaValue) {
    return "2020-12";
  }
  if ("$recursiveRef" in schemaValue || "unevaluatedProperties" in schemaValue) {
    return "2019-09";
  }
  if (
    typeof schemaValue.exclusiveMinimum === "boolean" ||
    typeof schemaValue.exclusiveMaximum === "boolean" ||
    (typeof schemaValue.id === "string" && !("$id" in schemaValue))
  ) {
    return "draft-04";
  }

  return "draft-07";
}

/**
 * Human-readable label for a detected or selected JSON Schema dialect.
 */
export function getJsonSchemaDialectLabel(
  dialect: JsonSchemaDialect,
  schemaValue?: any
): string {
  const effective = dialect === "auto" ? detectJsonSchemaDialect(schemaValue) : dialect;
  const prefix = dialect === "auto" ? "Auto · " : "";
  switch (effective) {
    case "draft-04":
      return `${prefix}Draft-04`;
    case "draft-06":
      return `${prefix}Draft-06`;
    case "draft-07":
      return `${prefix}Draft-07`;
    case "2019-09":
      return `${prefix}Draft 2019-09`;
    case "2020-12":
      return `${prefix}Draft 2020-12`;
    case "jtd":
      return `${prefix}JTD (RFC 8927)`;
    default:
      return "Draft-07";
  }
}

/**
 * Detects the XML Schema dialect from raw schema text.
 */
export function detectXmlSchemaDialect(schemaText: string): Exclude<XmlSchemaDialect, "auto"> {
  if (!schemaText || !schemaText.trim()) return "xsd";
  const withoutCommentsAndPis = schemaText
    .replace(/^\uFEFF/, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\?[\s\S]*?\?>/g, "")
    .trim();
  if (
    withoutCommentsAndPis.startsWith("<!ELEMENT") ||
    withoutCommentsAndPis.startsWith("<!ATTLIST") ||
    withoutCommentsAndPis.startsWith("<!ENTITY") ||
    withoutCommentsAndPis.startsWith("<!DOCTYPE") ||
    (!withoutCommentsAndPis.startsWith("<") && schemaText.includes("<!ELEMENT"))
  ) {
    return "dtd";
  }
  if (
    withoutCommentsAndPis.includes("http://relaxng.org/ns/structure/1.0") ||
    /^<grammar[\s>]/i.test(withoutCommentsAndPis)
  ) {
    return "rng";
  }
  if (
    withoutCommentsAndPis.includes("http://purl.oclc.org/dsdl/schematron") ||
    (/<rule\s+context=/i.test(withoutCommentsAndPis) && /<(assert|report)\s+test=/i.test(withoutCommentsAndPis))
  ) {
    return "schematron";
  }
  return "xsd";
}

/**
 * Human-readable label for an XML Schema dialect.
 */
export function getXmlSchemaDialectLabel(
  dialect: XmlSchemaDialect,
  schemaText?: string
): string {
  const safeText = schemaText || "";
  const effective = dialect === "auto" ? detectXmlSchemaDialect(safeText) : dialect;
  const prefix = dialect === "auto" ? "Auto · " : "";
  switch (effective) {
    case "dtd":
      return `${prefix}DTD`;
    case "rng":
      return `${prefix}RelaxNG (.rng)`;
    case "schematron":
      return `${prefix}Schematron (.sch)`;
    case "xsd":
    default: {
      const is11 =
        safeText.includes("minVersion=\"1.1\"") ||
        safeText.includes("<xs:assert") ||
        safeText.includes("<xsd:assert") ||
        safeText.includes("<xs:alternative");
      return `${prefix}${is11 ? "XSD 1.1" : "XSD 1.0"}`;
    }
  }
}

/**
 * Recursively transforms Draft-04 schema constructs (boolean exclusiveMinimum/exclusiveMaximum,
 * string `id`, and Draft-04 `$schema`) into Draft-07 equivalents so Ajv v8 compiles them cleanly.
 */
export function normalizeDraft04Schema(node: any, isRoot = true, inLiteralValue = false): any {
  if (!node || typeof node !== "object") return node;
  if (Array.isArray(node)) {
    return node.map((item) => normalizeDraft04Schema(item, false, inLiteralValue));
  }
  if (inLiteralValue) {
    return node;
  }

  const clone: Record<string, any> = {};
  for (const [k, v] of Object.entries(node)) {
    if (isRoot && (k === "$schema" || k === "$id" || k === "id")) {
      continue;
    }
    if (!isRoot && k === "id" && typeof v === "string" && !("$id" in node)) {
      clone["$id"] = v;
      continue;
    }
    if (k === "exclusiveMinimum" && typeof v === "boolean") {
      if (v === true && typeof node.minimum === "number") {
        clone["exclusiveMinimum"] = node.minimum;
      }
      continue;
    }
    if (k === "exclusiveMaximum" && typeof v === "boolean") {
      if (v === true && typeof node.maximum === "number") {
        clone["exclusiveMaximum"] = node.maximum;
      }
      continue;
    }
    if (k === "minimum" && node.exclusiveMinimum === true) {
      continue;
    }
    if (k === "maximum" && node.exclusiveMaximum === true) {
      continue;
    }
    const isChildLiteral = k === "default" || k === "const" || k === "enum" || k === "examples";
    clone[k] = normalizeDraft04Schema(v, false, isChildLiteral);
  }
  return clone;
}

/**
 * Strips conflicting `$schema` URIs when a user explicitly overrides the dialect in the UI.
 */
function prepareSchemaForDialect(schemaValue: any, dialect: Exclude<JsonSchemaDialect, "auto">): any {
  if (!schemaValue || typeof schemaValue !== "object") return schemaValue;
  if (dialect === "draft-04") {
    return normalizeDraft04Schema(schemaValue, true);
  }
  const copy = { ...schemaValue };
  // Prevent duplicate $id registration errors in Ajv across rapid edits
  if ("$id" in copy) {
    delete copy.$id;
  }
  if (dialect === "jtd") {
    delete copy.$schema;
    return copy;
  }
  if (typeof copy.$schema === "string") {
    const s = copy.$schema.toLowerCase();
    const matchesTarget =
      (dialect === "2020-12" && s.includes("2020-12")) ||
      (dialect === "2019-09" && s.includes("2019-09")) ||
      (dialect === "draft-06" && (s.includes("draft-06") || s.includes("draft/06"))) ||
      (dialect === "draft-07" && (s.includes("draft-07") || s.includes("draft/07")));
    if (!matchesTarget) {
      delete copy.$schema;
    }
  }
  return copy;
}

/**
 * Resolves local JSON Pointer `$ref`s (e.g. `#/$defs/Address` or `#/definitions/User`)
 * and `allOf` / `oneOf` / `anyOf` branches for visual views (`ColumnView` / `TableView`).
 */
export function resolveSchemaNode(node: any, rootSchema: any, depth = 0): any {
  if (!node || typeof node !== "object" || depth > 12) return node;

  if (typeof node.$ref === "string" && node.$ref.startsWith("#/") && rootSchema) {
    const parts = node.$ref
      .slice(2)
      .split("/")
      .map((p: string) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
    let target: any = rootSchema;
    for (const part of parts) {
      if (target && typeof target === "object" && part in target) {
        target = target[part];
      } else {
        target = null;
        break;
      }
    }
    if (target) {
      const { $ref: _ignored, ...rest } = node;
      return resolveSchemaNode({ ...target, ...rest }, rootSchema, depth + 1);
    }
  }

  if (Array.isArray(node.allOf) && node.allOf.length > 0) {
    let mergedProps: Record<string, any> = { ...(node.properties || {}) };
    let mergedReq: string[] = Array.isArray(node.required) ? [...node.required] : [];
    let resolvedType = node.type;
    for (const sub of node.allOf) {
      const r = resolveSchemaNode(sub, rootSchema, depth + 1);
      if (r && typeof r === "object") {
        if (r.properties) mergedProps = { ...mergedProps, ...r.properties };
        if (Array.isArray(r.required)) mergedReq = Array.from(new Set([...mergedReq, ...r.required]));
        if (!resolvedType && r.type) resolvedType = r.type;
      }
    }
    return {
      ...node,
      type: resolvedType || (Object.keys(mergedProps).length > 0 ? "object" : undefined),
      properties: mergedProps,
      required: mergedReq,
    };
  }

  const poly = node.oneOf || node.anyOf;
  if (Array.isArray(poly) && poly.length > 0 && !node.properties && !node.items) {
    return resolveSchemaNode(poly[0], rootSchema, depth + 1);
  }

  return node;
}

/**
 * Converts a JSON Pointer (e.g. "/List/0/Name")
 * into readable JavaScript path notation (e.g. "List[0].Name").
 */
export function formatJSONPath(path: string): string {
  if (!path || path === "/" || path === "") return "Root";

  const segments = path.split("/").filter(Boolean);
  let result = "";

  segments.forEach((segment) => {
    // If the segment is a number, it represents an array index
    if (/^\d+$/.test(segment)) {
      result += `[${segment}]`;
    } else {
      if (result) {
        result += `.${segment}`;
      } else {
        result = segment;
      }
    }
  });

  return result;
}

/**
 * Translates AJV validation errors into readable human-friendly messages.
 */
function translateError(error: ErrorObject): string {
  const params: any = error.params || {};
  const fieldName = params.missingProperty ? `"${params.missingProperty}"` : "";

  switch (error.keyword) {
    case "required":
      return t("schemaValidation.required", { field: fieldName });
    case "optionalProperties":
    case "properties":
      if (params.error === "missing" && params.missingProperty) {
        return t("schemaValidation.jtdMissing", { field: params.missingProperty });
      }
      if (params.error === "additional" && params.additionalProperty) {
        return t("schemaValidation.jtdAdditional", { field: params.additionalProperty });
      }
      return error.message || t("schemaValidation.invalidObjectProp");
    case "type": {
      const mapType = (tp: string) => {
        const known = ["string", "number", "integer", "boolean", "array", "object", "null", "timestamp"];
        if (known.includes(tp)) {
          return t(`schemaValidation.types.${tp}`);
        }
        return tp;
      };
      const rawType = params.type;
      const orWord = t("schemaValidation.types.or");
      const formattedType = Array.isArray(rawType)
        ? rawType.map(mapType).join(` ${orWord} `)
        : mapType(String(rawType || t("schemaValidation.types.fallback")));
      return t("schemaValidation.typeMismatch", { type: formattedType });
    }
    case "minimum":
      return t("schemaValidation.minimum", { limit: params.limit });
    case "maximum":
      return t("schemaValidation.maximum", { limit: params.limit });
    case "exclusiveMinimum":
      return t("schemaValidation.exclusiveMinimum", { limit: params.limit });
    case "exclusiveMaximum":
      return t("schemaValidation.exclusiveMaximum", { limit: params.limit });
    case "multipleOf":
      return t("schemaValidation.multipleOf", { multiple: params.multipleOf });
    case "minLength":
      return t("schemaValidation.minLength", { limit: params.limit });
    case "maxLength":
      return t("schemaValidation.maxLength", { limit: params.limit });
    case "minItems":
      return t("schemaValidation.minItems", { limit: params.limit });
    case "maxItems":
      return t("schemaValidation.maxItems", { limit: params.limit });
    case "uniqueItems":
      return t("schemaValidation.uniqueItems");
    case "enum":
      return t("schemaValidation.enum", { values: (params.allowedValues || []).join(", ") });
    case "const":
      return t("schemaValidation.const", { value: JSON.stringify(params.allowedValue) });
    case "pattern":
      return t("schemaValidation.pattern", { pattern: params.pattern });
    case "additionalProperties":
    case "unevaluatedProperties":
      return t("schemaValidation.additionalProperty", {
        field: params.additionalProperty || params.unevaluatedProperty || ""
      });
    case "elements":
      return t("schemaValidation.jtdElements");
    case "values":
      return t("schemaValidation.jtdValues");
    case "discriminator":
      return t("schemaValidation.jtdDiscriminator", { tag: params.tag || "type" });
    default:
      return error.message || t("schemaValidation.invalidValue");
  }
}

export interface ValidationError {
  path: string;
  message: string;
}

/**
 * Validates a JSON object against a JSON Schema (Draft-04, Draft-06, Draft-07,
 * Draft 2019-09, Draft 2020-12) or JTD (RFC 8927).
 * Returns an array of structured errors (or an empty array if valid).
 */
export function validateJSON(
  jsonValue: any,
  schemaValue: any,
  dialect: JsonSchemaDialect = "auto"
): ValidationError[] {
  if (!schemaValue || typeof schemaValue !== "object") {
    return [];
  }

  const effectiveDialect =
    dialect === "auto" ? detectJsonSchemaDialect(schemaValue) : dialect;

  const engine =
    effectiveDialect === "2020-12"
      ? ajv2020
      : effectiveDialect === "2019-09"
      ? ajv2019
      : effectiveDialect === "jtd"
      ? ajvJtd
      : ajvDraft07;

  try {
    engine.removeSchema();
    const preparedSchema = prepareSchemaForDialect(schemaValue, effectiveDialect);
    const validate = engine.compile(preparedSchema);
    const valid = validate(jsonValue);

    if (valid) return [];

    if (validate.errors) {
      return validate.errors.map((err) => {
        const params: any = err.params || {};
        let rawPath = err.instancePath;
        if (
          (err.keyword === "required" || err.keyword === "properties") &&
          params.missingProperty
        ) {
          rawPath = rawPath
            ? `${rawPath}/${params.missingProperty}`
            : `/${params.missingProperty}`;
        }

        return {
          path: formatJSONPath(rawPath),
          message: translateError(err),
        };
      });
    }
  } catch (error: any) {
    return [
      {
        path: `Schema (${effectiveDialect})`,
        message: t("schemaValidation.compileError", { message: error.message }),
      },
    ];
  }

  return [];
}
