import { Tab } from "../store/useFileStore";
import { parseDocumentLinks, resolveLinkToTabOrPath, normalizeFilePath } from "./todoLinkParser";
import { invokeTauriSafe } from "./tauriBridge";

export interface GraphNode {
  id: string;
  title: string;
  path: string | null;
  type: "json" | "xml" | "markdown" | "todo" | "unknown";
  exists: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  tabId: string | null;
  listId?: string;
  isListNode?: boolean;
  parentTabId?: string;
}

export interface GraphEdge {
  sourceId: string;
  targetId: string;
  label: string;
  isListEdge?: boolean;
}

/**
 * Erstellt die Knoten und Verbindungen (Edges) für die Dokumenten-Graphenansicht.
 * Generates tight orbit sub-nodes (~35-45px radius) for ToDo lists,
 * Listen repräsentieren.
 *
 * @param jsonTabs - Die Liste aller geöffneten Tabs im FileStore.
 * @param canvasWidth - Breite der Canvas-Zeichenfläche.
 * @param canvasHeight - Höhe der Canvas-Zeichenfläche.
 * @returns Objekt mit erzeugten Knoten (nodes) und Verbindungen (edges).
 */
export async function buildGraphTopology(
  jsonTabs: Tab[],
  canvasWidth: number = 900,
  canvasHeight: number = 540
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  const newNodes: GraphNode[] = [];
  const newEdges: GraphEdge[] = [];
  const nodeMap = new Map<string, GraphNode>();

  // 1. Primäre Knoten für alle geöffneten Tabs anlegen
  jsonTabs.forEach((tab, index) => {
    const angle = (index / (jsonTabs.length || 1)) * Math.PI * 2;
    const r = 160 + Math.random() * 40;
    const normPath = tab.path ? normalizeFilePath(tab.path) : null;
    const isTodo = tab.type === "todo" || tab.title.toLowerCase().endsWith(".todo");

    const node: GraphNode = {
      id: tab.id,
      title: tab.title,
      path: normPath,
      type: (tab.type || "json") as any,
      exists: true,
      x: canvasWidth / 2 + Math.cos(angle) * r,
      y: canvasHeight / 2 + Math.sin(angle) * r,
      vx: 0,
      vy: 0,
      radius: tab.pinned ? 22 : 18,
      tabId: tab.id,
      isListNode: false
    };
    newNodes.push(node);
    nodeMap.set(tab.id, node);

    if (normPath) {
      nodeMap.set(normPath.toLowerCase(), node);
      nodeMap.set(tab.title.toLowerCase(), node);
      nodeMap.set(tab.title.toLowerCase().replace(/\.[^/.]+$/, ""), node);
    }

    // If ToDo tab: Create lists as close orbit sub-nodes (~35-45px) around the file
    if (isTodo && tab.content) {
      try {
        const parsed = JSON.parse(tab.content);
        if (parsed && Array.isArray(parsed.lists) && parsed.lists.length > 0) {
          parsed.lists.forEach((list: any, lIdx: number) => {
            const listNodeId = `${tab.id}_list_${list.id || lIdx}`;
            const orbitAngle = (lIdx / (parsed.lists.length || 1)) * Math.PI * 2;
            const orbitDist = 38 + (lIdx % 2) * 8; // Sehr enger Orbit!

            const listNode: GraphNode = {
              id: listNodeId,
              title: list.title || `Liste ${lIdx + 1}`,
              path: normPath,
              type: "todo",
              exists: true,
              x: node.x + Math.cos(orbitAngle) * orbitDist,
              y: node.y + Math.sin(orbitAngle) * orbitDist,
              vx: 0,
              vy: 0,
              radius: 10,
              tabId: tab.id,
              listId: list.id,
              isListNode: true,
              parentTabId: tab.id
            };
            newNodes.push(listNode);
            nodeMap.set(listNodeId, listNode);

            // ToDo-Hauptdatei -> Listen-Subknoten
            newEdges.push({
              sourceId: tab.id,
              targetId: listNodeId,
              label: "",
              isListEdge: true
            });
          });
        }
      } catch (e) {}
    }
  });

  // 2. Analyze document links and create edges/external nodes
  const checkFileExists = async (filePath: string): Promise<boolean> => {
    const res = await invokeTauriSafe<boolean>("file_exists", { path: filePath });
    return Boolean(res);
  };

  const resolveOrCreateNode = async (
    targetTabId: string | null,
    cleanPath: string
  ): Promise<string | null> => {
    if (!cleanPath) return null;
    const lowerClean = cleanPath.toLowerCase();
    const cleanBaseName = cleanPath.split("/").pop()?.toLowerCase();

    if (targetTabId && nodeMap.has(targetTabId)) {
      return targetTabId;
    }
    if (nodeMap.has(lowerClean)) {
      return nodeMap.get(lowerClean)!.id;
    }
    if (cleanBaseName && nodeMap.has(cleanBaseName)) {
      return nodeMap.get(cleanBaseName)!.id;
    }

    // Target is a closed file: check if it exists on disk and create a GraphNode
    const targetBase = cleanPath.split("/").pop() || cleanPath;
    const ext = targetBase.split(".").pop()?.toLowerCase() || "";
    let docType: "json" | "xml" | "markdown" | "todo" | "unknown" = "unknown";
    if (ext === "json") docType = "json";
    else if (ext === "xml") docType = "xml";
    else if (ext === "md" || ext === "markdown") docType = "markdown";
    else if (ext === "todo") docType = "todo";

    const existsOnDisk = await checkFileExists(cleanPath);
    const closedNodeId = `closed_${lowerClean.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

    const closedNode: GraphNode = {
      id: closedNodeId,
      title: targetBase,
      path: cleanPath,
      type: docType,
      exists: existsOnDisk,
      x: canvasWidth / 2 + (Math.random() - 0.5) * 350,
      y: canvasHeight / 2 + (Math.random() - 0.5) * 350,
      vx: 0,
      vy: 0,
      radius: 17,
      tabId: null,
      isListNode: false
    };

    newNodes.push(closedNode);
    nodeMap.set(closedNodeId, closedNode);
    nodeMap.set(lowerClean, closedNode);
    if (cleanBaseName) nodeMap.set(cleanBaseName, closedNode);
    return closedNodeId;
  };

  // 2. Dokumenten-Links analysieren
  for (const tab of jsonTabs) {
    const isTodo = tab.type === "todo" || tab.title.toLowerCase().endsWith(".todo");

    if (isTodo && tab.content) {
      try {
        const parsed = JSON.parse(tab.content);
        if (parsed && Array.isArray(parsed.lists)) {
          for (let lIdx = 0; lIdx < parsed.lists.length; lIdx++) {
            const list = parsed.lists[lIdx];
            const listNodeId = `${tab.id}_list_${list.id || lIdx}`;
            if (Array.isArray(list.tasks)) {
              for (const task of list.tasks) {
                const taskLinks = parseDocumentLinks(task.text || "");
                for (const link of taskLinks) {
                  const { tabId: targetTabId, cleanPath, isWebUrl } = resolveLinkToTabOrPath(link.targetPath, jsonTabs, tab.path);
                  if (isWebUrl) continue;

                  const targetNodeId = await resolveOrCreateNode(targetTabId, cleanPath);

                  if (targetNodeId && targetNodeId !== listNodeId && targetNodeId !== tab.id) {
                    const sourceId = nodeMap.has(listNodeId) ? listNodeId : tab.id;
                    const edgeExists = newEdges.some(
                      (e) => e.sourceId === sourceId && e.targetId === targetNodeId
                    );
                    if (!edgeExists) {
                      newEdges.push({
                        sourceId,
                        targetId: targetNodeId,
                        label: link.label
                      });
                    }
                  }
                }
              }
            }
          }
        }
      } catch (e) {}
    } else {
      const parsedLinks = parseDocumentLinks(tab.content);
      for (const link of parsedLinks) {
        const { tabId, cleanPath, isWebUrl } = resolveLinkToTabOrPath(link.targetPath, jsonTabs, tab.path);
        if (isWebUrl) continue;

        const targetNodeId = await resolveOrCreateNode(tabId, cleanPath);

        if (targetNodeId && targetNodeId !== tab.id) {
          const edgeExists = newEdges.some(
            (e) => e.sourceId === tab.id && e.targetId === targetNodeId
          );
          if (!edgeExists) {
            newEdges.push({
              sourceId: tab.id,
              targetId: targetNodeId,
              label: link.label
            });
          }
        }
      }
    }
  }

  return { nodes: newNodes, edges: newEdges };
}

/**
 * Zeichnet ein Pfeil-Ende (Arrowhead) an einer definierten Position und Winkel.
 *
 * @param ctx - Der Canvas 2D Kontext.
 * @param x - X-Koordinate des Pfeilspitze.
 * @param y - Y-Koordinate des Pfeilspitze.
 * @param angle - Richtungswinkel in Radiant.
 * @param color - Füllfarbe des Pfeils.
 */
function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  color: string
): void {
  const arrowSize = 9;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(
    x - arrowSize * Math.cos(angle - Math.PI / 6),
    y - arrowSize * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    x - arrowSize * Math.cos(angle + Math.PI / 6),
    y - arrowSize * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

/**
 * Führt einen Physik-Simulationsschritt (Force-Directed Layout) für die Graphen-Knoten durch.
 * Berechnet Abstoßungskräfte zwischen Knoten und Federzugkräfte entlang der Kanten.
 *
 * @param nodes - Liste der Graphenknoten.
 * @param edges - Liste der Kanten.
 * @param width - Breite der Zeichenfläche.
 * @param height - Höhe der Zeichenfläche.
 * @param draggingNodeId - ID des aktuell mit der Maus gezogenen Knotens (wird nicht physikalisch verschoben).
 */
export function stepForceSimulation(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number,
  draggingNodeId: string | null = null
): void {
  const repulsionStrength = 2800;
  const springStrength = 0.04;
  const damping = 0.85;

  // 1. Repulsion (Abstoßungskräfte zwischen allen Knotenpaaren)
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const n1 = nodes[i];
      const n2 = nodes[j];
      const dx = n2.x - n1.x;
      const dy = n2.y - n1.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;

      const minDistance = n1.isListNode || n2.isListNode ? 70 : 130;
      if (dist < minDistance * 3) {
        const force = (repulsionStrength / (dist * dist));
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        if (n1.id !== draggingNodeId) {
          n1.vx -= fx;
          n1.vy -= fy;
        }
        if (n2.id !== draggingNodeId) {
          n2.vx += fx;
          n2.vy += fy;
        }
      }
    }
  }

  // 2. Attraction / Springs (Federkräfte entlang der Kanten)
  edges.forEach((edge) => {
    const src = nodes.find((n) => n.id === edge.sourceId);
    const tgt = nodes.find((n) => n.id === edge.targetId);
    if (!src || !tgt) return;

    const dx = tgt.x - src.x;
    const dy = tgt.y - src.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const targetDist = edge.isListEdge ? 75 : 220; // Größerer Abstand für optimale Übersicht
    const delta = dist - targetDist;
    const fx = (dx / dist) * delta * springStrength;
    const fy = (dy / dist) * delta * springStrength;

    if (src.id !== draggingNodeId) {
      src.vx += fx;
      src.vy += fy;
    }
    if (tgt.id !== draggingNodeId) {
      tgt.vx -= fx;
      tgt.vy -= fy;
    }
  });

  // 3. Zentrierungskraft zur Canvas-Mitte & Integration
  const centerX = width / 2;
  const centerY = height / 2;
  nodes.forEach((n) => {
    if (n.id === draggingNodeId) return;
    const dx = centerX - n.x;
    const dy = centerY - n.y;
    n.vx += dx * 0.002;
    n.vy += dy * 0.002;

    n.x += n.vx;
    n.y += n.vy;
    n.vx *= damping;
    n.vy *= damping;

    const padding = n.radius + 20;
    if (n.x < padding) { n.x = padding; n.vx = 0; }
    if (n.x > width - padding) { n.x = width - padding; n.vx = 0; }
    if (n.y < padding) { n.y = padding; n.vy = 0; }
    if (n.y > height - padding) { n.y = height - padding; n.vy = 0; }
  });
}

/**
 * Zeichnet den Graphen auf ein 2D Canvas-Element unter Berücksichtigung von Zoom, Pan und Richtungspfeilen.
 *
 * @param ctx - Der Canvas 2D Kontext.
 * @param width - Breite des Canvas.
 * @param height - Höhe des Canvas.
 * @param nodes - Liste aller Zeichnungsknoten.
 * @param edges - Liste aller Kanten.
 * @param selectedNodeId - ID des aktuell selektierten Knotens oder null.
 * @param hoveredNodeId - ID des aktuell gehoverten Knotens oder null.
 * @param zoomLevel - Aktueller Skalierungsfaktor (z. B. 1.0).
 * @param panOffset - Verschiebungsoffset { x, y }.
 */
export function renderCanvasGraph(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  nodes: GraphNode[],
  edges: GraphEdge[],
  selectedNodeId: string | null,
  hoveredNodeId: string | null,
  zoomLevel: number = 1.0,
  panOffset: { x: number; y: number } = { x: 0, y: 0 }
): void {
  ctx.clearRect(0, 0, width, height);

  ctx.save();
  // Anwenden der Transform (Pan & Zoom um Canvas-Zentrum)
  ctx.translate(width / 2 + panOffset.x, height / 2 + panOffset.y);
  ctx.scale(zoomLevel, zoomLevel);
  ctx.translate(-width / 2, -height / 2);

  // 1. Kanten mit Richtungspfeilen zeichnen
  edges.forEach((edge) => {
    const srcNode = nodes.find((n) => n.id === edge.sourceId);
    const tgtNode = nodes.find((n) => n.id === edge.targetId);
    if (!srcNode || !tgtNode) return;

    ctx.beginPath();
    ctx.moveTo(srcNode.x, srcNode.y);
    ctx.lineTo(tgtNode.x, tgtNode.y);

    const isMutual = edges.some((e) => e.sourceId === edge.targetId && e.targetId === edge.sourceId);

    if (edge.isListEdge) {
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = "rgba(52, 211, 153, 0.45)"; // Gestrichelte smaragdgrüne Orbitlinie für Listen
      ctx.lineWidth = 1.2;
    } else {
      ctx.setLineDash([]);
      const isMissingEdge = !srcNode.exists || !tgtNode.exists;
      if (isMissingEdge) {
        ctx.strokeStyle = "rgba(239, 68, 68, 0.75)";
        ctx.lineWidth = 1.8;
      } else {
        ctx.strokeStyle = isMutual ? "rgba(168, 85, 247, 0.5)" : "rgba(148, 163, 184, 0.35)";
        ctx.lineWidth = 1.6;
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Pfeile zeichnen (Directional Arrowheads ---> NUR für Dokumenten-Links, NICHT für Listen-Orbit)
    if (!edge.isListEdge) {
      const angle = Math.atan2(tgtNode.y - srcNode.y, tgtNode.x - srcNode.x);
      const arrowX = tgtNode.x - Math.cos(angle) * (tgtNode.radius + 4);
      const arrowY = tgtNode.y - Math.sin(angle) * (tgtNode.radius + 4);
      const arrowColor = (!srcNode.exists || !tgtNode.exists) ? "#ef4444" : "#a855f7";

      drawArrowhead(ctx, arrowX, arrowY, angle, arrowColor);

      // If mutual linking (<--->): Draw arrow at source end as well
      if (isMutual) {
        const revAngle = Math.atan2(srcNode.y - tgtNode.y, srcNode.x - tgtNode.x);
        const revArrowX = srcNode.x - Math.cos(revAngle) * (srcNode.radius + 4);
        const revArrowY = srcNode.y - Math.sin(revAngle) * (srcNode.radius + 4);
        drawArrowhead(ctx, revArrowX, revArrowY, revAngle, arrowColor);
      }
    }
  });

  // 2. Knoten zeichnen
  nodes.forEach((node) => {
    const isSelected = node.id === selectedNodeId;
    const isHovered = node.id === hoveredNodeId;

    ctx.beginPath();
    ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);

    let color = "#3b82f6"; // Standard blau
    if (!node.exists) color = "#ef4444"; // Rote Signalfarbe für nicht mehr existierende Dateien!
    else if (node.isListNode) color = "#34d399"; // Helles Minzgrün für ToDo-Listen Subknoten
    else if (node.type === "todo") color = "#047857"; // Dunkleres Waldgrün für ToDo-Hauptdateien
    else if (node.type === "markdown") color = "#a855f7";
    else if (node.type === "json") color = "#f59e0b";
    else if (node.type === "xml") color = "#06b6d4";

    ctx.fillStyle = color;
    ctx.fill();

    ctx.lineWidth = isSelected ? 3 : isHovered ? 2.5 : node.isListNode ? 1.5 : 2;
    ctx.strokeStyle = !node.exists 
      ? (isSelected ? "#fca5a5" : "#ef4444") 
      : isSelected ? "#a855f7" : isHovered ? "#ffffff" : node.isListNode ? "#a7f3d0" : "rgba(255, 255, 255, 0.4)";
    ctx.stroke();

    // Text-Label unter dem Knoten (Ohne Emoji, Listen gestrichelt unterstrichen)
    ctx.font = node.isListNode ? "10px monospace" : "11px sans-serif";
    ctx.fillStyle = !node.exists
      ? "#f87171"
      : isSelected ? "#a855f7" : isHovered ? "#ffffff" : node.isListNode ? "#6ee7b7" : "#cbd5e1";
    ctx.textAlign = "center";

    const displayTitle = node.title;
    const labelY = node.y + node.radius + (node.isListNode ? 11 : 14);
    ctx.fillText(displayTitle, node.x, labelY);

    if (node.isListNode) {
      const textWidth = ctx.measureText(displayTitle).width;
      const lineY = labelY + 2;
      ctx.save();
      ctx.beginPath();
      ctx.setLineDash([2, 2]);
      ctx.strokeStyle = isSelected ? "#a855f7" : isHovered ? "#ffffff" : "#6ee7b7";
      ctx.lineWidth = 1;
      ctx.moveTo(node.x - textWidth / 2, lineY);
      ctx.lineTo(node.x + textWidth / 2, lineY);
      ctx.stroke();
      ctx.restore();
    }
  });

  ctx.restore();
}
