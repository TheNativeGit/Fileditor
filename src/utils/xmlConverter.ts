/**
 * XML <-> JS Object conversion and formatting utilities.
 */

const XML_NCNAME_REGEX = /^[A-Za-z_\u00C0-\u02FF\u0370-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD][A-Za-z0-9_\-.\u00B7\u00C0-\u02FF\u0370-\u1FFF\u200C-\u200D\u203F-\u2040\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]*$/;

export function isValidXmlName(name: string): boolean {
  if (!name) return false;
  const parts = name.split(":");
  if (parts.length > 2) return false;
  return parts.every((p) => XML_NCNAME_REGEX.test(p));
}

export function escapeXmlText(val: string): string {
  return val
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function escapeXmlAttr(val: string): string {
  return val
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function extractXmlDeclaration(xmlStr: string): string | null {
  if (!xmlStr) return null;
  const match = xmlStr.match(/^\uFEFF?\s*(<\?xml\b[^?]*\?>)/i);
  return match ? match[1] : null;
}

function cleanParserErrorText(raw: string | null | undefined): string {
  if (!raw) return "Ungültige XML-Syntax";
  const cleaned = raw
    .replace(/This page contains the following errors:/gi, "")
    .replace(/Below is a rendering of the page up to the first error\./gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "Ungültige XML-Syntax";
}

/**
 * Convert XML String to a JS Object structure compatible with the visual views.
 */
export function xmlStringToJsObject(xmlStr: string): { value: any; error: string | null } {
  const cleanXml = (xmlStr || "").replace(/^\uFEFF/, "");
  if (!cleanXml.trim()) {
    return { value: null, error: null };
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(cleanXml, "application/xml");

    const parserError = doc.querySelector("parsererror");
    if (parserError) {
      return {
        value: null,
        error: cleanParserErrorText(parserError.textContent)
      };
    }

    const root = doc.documentElement;
    if (!root) {
      return { value: null, error: "XML-Dokument enthält kein Wurzelelement." };
    }

    const obj = {
      [root.nodeName]: xmlToJs(root)
    };

    return { value: obj, error: null };
  } catch (e: any) {
    return { value: null, error: e.message || "Fehler beim Parsen der XML-Datei" };
  }
}

function xmlToJs(node: Node): any {
  if (node.nodeType === Node.ELEMENT_NODE) {
    const element = node as Element;
    const obj: any = {};

    // Attributes
    if (element.attributes.length > 0) {
      for (let i = 0; i < element.attributes.length; i++) {
        const attr = element.attributes[i];
        obj[`@_${attr.name}`] = parseStringValue(attr.value);
      }
    }

    // Children
    const childNodes = Array.from(element.childNodes);
    const elementChildren = childNodes.filter((n) => n.nodeType === Node.ELEMENT_NODE) as Element[];
    const textChildren = childNodes.filter(
      (n) => n.nodeType === Node.TEXT_NODE || n.nodeType === Node.CDATA_SECTION_NODE
    );

    if (elementChildren.length === 0) {
      const textContent = textChildren.map((t) => t.textContent ?? "").join("").trim();
      if (element.attributes.length > 0) {
        if (textContent !== "") {
          obj["#text"] = parseStringValue(textContent);
        }
        return obj;
      } else {
        return textContent === "" ? "" : parseStringValue(textContent);
      }
    } else {
      const grouped: Record<string, Element[]> = {};
      elementChildren.forEach((child) => {
        if (!grouped[child.nodeName]) {
          grouped[child.nodeName] = [];
        }
        grouped[child.nodeName].push(child);
      });

      Object.entries(grouped).forEach(([tagName, list]) => {
        if (list.length === 1) {
          obj[tagName] = xmlToJs(list[0]);
        } else {
          obj[tagName] = list.map((item) => xmlToJs(item));
        }
      });

      const textContent = textChildren.map((t) => t.textContent ?? "").join("").trim();
      if (textContent !== "") {
        obj["#text"] = parseStringValue(textContent);
      }

      return obj;
    }
  }
  return null;
}

function parseStringValue(val: string): any {
  if (val === "true") return true;
  if (val === "false") return false;
  const trimmed = val.trim();
  if (trimmed !== "") {
    const num = Number(trimmed);
    if (Number.isFinite(num) && String(num) === trimmed) {
      return num;
    }
  }
  return val;
}

/**
 * Convert JS Object back to formatted XML String.
 * Returns null if the object cannot be represented as valid XML (e.g. invalid tag name).
 */
export function jsObjectToXmlString(obj: any, xmlDeclaration?: string | null): string | null {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const keys = Object.keys(obj);
  if (keys.length !== 1) return null;

  const rootKey = keys[0];
  if (!isValidXmlName(rootKey)) {
    return null;
  }

  try {
    const body = serializeXmlElement(rootKey, obj[rootKey], 0);
    if (body === null) return null;
    const decl = xmlDeclaration?.trim();
    return decl ? `${decl}\n${body}` : body;
  } catch (e) {
    console.error("Error creating XML from JS Object:", e);
    return null;
  }
}

function serializeXmlElement(tagName: string, value: any, level: number): string | null {
  if (!isValidXmlName(tagName)) {
    return null;
  }

  const indent = "  ".repeat(level);

  if (value === null || value === undefined || value === "") {
    return `${indent}<${tagName}/>`;
  }

  if (typeof value !== "object") {
    return `${indent}<${tagName}>${escapeXmlText(String(value))}</${tagName}>`;
  }

  if (Array.isArray(value)) {
    const parts: string[] = [];
    for (const item of value) {
      const rendered = serializeXmlElement(tagName, item, level);
      if (rendered === null) return null;
      parts.push(rendered);
    }
    return parts.join("\n");
  }

  let attrs = "";
  let textVal: string | null = null;
  const childLines: string[] = [];

  for (const [key, val] of Object.entries(value)) {
    if (key.startsWith("@_")) {
      const attrName = key.slice(2);
      if (!isValidXmlName(attrName)) {
        return null;
      }
      attrs += ` ${attrName}="${escapeXmlAttr(val === null || val === undefined ? "" : String(val))}"`;
    } else if (key === "#text") {
      if (val !== null && val !== undefined && String(val) !== "") {
        textVal = escapeXmlText(String(val));
      }
    } else if (Array.isArray(val)) {
      for (const item of val) {
        const rendered = serializeXmlElement(key, item, level + 1);
        if (rendered === null) return null;
        childLines.push(rendered);
      }
    } else {
      const rendered = serializeXmlElement(key, val, level + 1);
      if (rendered === null) return null;
      childLines.push(rendered);
    }
  }

  if (childLines.length === 0) {
    if (textVal === null) {
      return `${indent}<${tagName}${attrs}/>`;
    }
    return `${indent}<${tagName}${attrs}>${textVal}</${tagName}>`;
  }

  const innerParts: string[] = [];
  if (textVal !== null) {
    innerParts.push(`${"  ".repeat(level + 1)}${textVal}`);
  }
  innerParts.push(...childLines);

  return `${indent}<${tagName}${attrs}>\n${innerParts.join("\n")}\n${indent}</${tagName}>`;
}

/**
 * Formatting/Pretty printing XML while preserving XML declaration, DOCTYPE, comments, CDATA and escaping.
 */
export function formatXmlString(xmlStr: string): string {
  const cleanXml = (xmlStr || "").replace(/^\uFEFF/, "");
  if (!cleanXml.trim()) return "";

  try {
    const xmlDecl = extractXmlDeclaration(cleanXml);
    const parser = new DOMParser();
    const doc = parser.parseFromString(cleanXml, "application/xml");
    const parserError = doc.querySelector("parsererror");
    if (parserError) {
      return xmlStr;
    }

    const topLines: string[] = [];
    if (xmlDecl) {
      topLines.push(xmlDecl);
    }

    const doctypeMatch = cleanXml.match(
      /<!DOCTYPE\s+[^\s\[>]+(?:\s+(?:PUBLIC|SYSTEM)\s+(?:"[^"]*"|'[^']*')(?:\s+(?:"[^"]*"|'[^']*'))?)?\s*(?:\[[\s\S]*?\])?\s*>/i
    );

    Array.from(doc.childNodes).forEach((node) => {
      if (node.nodeType === Node.DOCUMENT_TYPE_NODE) {
        if (doctypeMatch) {
          topLines.push(doctypeMatch[0]);
        } else {
          const dt = node as DocumentType;
          let dtStr = `<!DOCTYPE ${dt.name}`;
          if (dt.publicId) {
            dtStr += ` PUBLIC "${dt.publicId}"`;
            if (dt.systemId) dtStr += ` "${dt.systemId}"`;
          } else if (dt.systemId) {
            dtStr += ` SYSTEM "${dt.systemId}"`;
          }
          dtStr += ">";
          topLines.push(dtStr);
        }
      } else {
        const formatted = formatNode(node, 0);
        if (formatted) {
          topLines.push(formatted);
        }
      }
    });

    return topLines.join("\n");
  } catch (e) {
    return xmlStr;
  }
}

function serializeNodeInline(node: Node): string {
  switch (node.nodeType) {
    case Node.TEXT_NODE:
      return escapeXmlText(node.textContent ?? "");
    case Node.CDATA_SECTION_NODE:
      return `<![CDATA[${node.nodeValue ?? ""}]]>`;
    case Node.COMMENT_NODE:
      return `<!--${node.nodeValue ?? ""}-->`;
    case Node.PROCESSING_INSTRUCTION_NODE:
      return `<?${node.nodeName}${node.nodeValue ? ` ${node.nodeValue}` : ""}?>`;
    case Node.ELEMENT_NODE: {
      const el = node as Element;
      const attrs = Array.from(el.attributes)
        .map((attr) => ` ${attr.name}="${escapeXmlAttr(attr.value)}"`)
        .join("");
      const children = Array.from(el.childNodes);
      if (children.length === 0) {
        return `<${el.nodeName}${attrs}/>`;
      }
      return `<${el.nodeName}${attrs}>${children.map(serializeNodeInline).join("")}</${el.nodeName}>`;
    }
    default:
      return "";
  }
}

function formatNode(node: Node, level: number): string {
  const indent = "  ".repeat(level);

  if (node.nodeType === Node.COMMENT_NODE) {
    return `${indent}<!--${node.nodeValue ?? ""}-->`;
  }

  if (node.nodeType === Node.PROCESSING_INSTRUCTION_NODE) {
    return `${indent}<?${node.nodeName}${node.nodeValue ? ` ${node.nodeValue}` : ""}?>`;
  }

  if (node.nodeType === Node.CDATA_SECTION_NODE) {
    return `${indent}<![CDATA[${node.nodeValue ?? ""}]]>`;
  }

  if (node.nodeType === Node.TEXT_NODE) {
    const trimmed = node.textContent?.trim() || "";
    return trimmed ? `${indent}${escapeXmlText(trimmed)}` : "";
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    const element = node as Element;
    const tagName = element.nodeName;

    let attrs = "";
    if (element.attributes.length > 0) {
      attrs = Array.from(element.attributes)
        .map((attr) => ` ${attr.name}="${escapeXmlAttr(attr.value)}"`)
        .join("");
    }

    const childNodes = Array.from(element.childNodes);
    if (childNodes.length === 0) {
      return `${indent}<${tagName}${attrs}/>`;
    }

    const hasElementOrComment = childNodes.some(
      (n) =>
        n.nodeType === Node.ELEMENT_NODE ||
        n.nodeType === Node.COMMENT_NODE ||
        n.nodeType === Node.PROCESSING_INSTRUCTION_NODE
    );

    if (!hasElementOrComment) {
      // Only text / CDATA children
      const hasCData = childNodes.some((n) => n.nodeType === Node.CDATA_SECTION_NODE);
      if (hasCData) {
        const inlineContent = childNodes
          .map((n) =>
            n.nodeType === Node.CDATA_SECTION_NODE
              ? `<![CDATA[${n.nodeValue ?? ""}]]>`
              : escapeXmlText(n.textContent?.trim() ?? "")
          )
          .join("");
        return inlineContent ? `${indent}<${tagName}${attrs}>${inlineContent}</${tagName}>` : `${indent}<${tagName}${attrs}/>`;
      }
      const text = childNodes.map((n) => n.textContent ?? "").join("").trim();
      if (!text) {
        return `${indent}<${tagName}${attrs}/>`;
      }
      return `${indent}<${tagName}${attrs}>${escapeXmlText(text)}</${tagName}>`;
    }

    // Mixed content (non-whitespace text alongside element children): preserve inline flow without corrupting spacing
    const hasMixedText = childNodes.some(
      (n) => n.nodeType === Node.TEXT_NODE && Boolean(n.textContent?.trim())
    );
    if (hasMixedText) {
      const inline = childNodes.map(serializeNodeInline).join("");
      return `${indent}<${tagName}${attrs}>${inline}</${tagName}>`;
    }

    let childrenXml = "";
    childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE && !child.textContent?.trim()) {
        return;
      }
      const childFormatted = formatNode(child, level + 1);
      if (childFormatted) {
        childrenXml += "\n" + childFormatted;
      }
    });

    if (!childrenXml) {
      return `${indent}<${tagName}${attrs}/>`;
    }
    return `${indent}<${tagName}${attrs}>${childrenXml}\n${indent}</${tagName}>`;
  }

  return "";
}
