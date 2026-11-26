import React, { useEffect, useRef, useState } from "react";
import { Modal, Button, Input, Tooltip, message } from "antd";
import { 
  Network, 
  X, 
  Search, 
  ExternalLink,
  RefreshCw,
  Info,
  ZoomIn,
  ZoomOut,
  RotateCcw
} from "lucide-react";
import { useFileStore } from "../store/useFileStore";
import { useTranslation } from "../i18n";
import { invokeTauriSafe } from "../utils/tauriBridge";
import { buildGraphTopology, renderCanvasGraph, stepForceSimulation, GraphNode, GraphEdge } from "../utils/graphUtils";

/**
 * Graphen-Ansicht Modal Komponente für Fileditor.
 * Visualisiert offene Dokumente, ToDo-Listen Sub-Knoten und Verlinkungen mit Richtungspfeilen.
 * Unterstützt stufenloses Zoomen (Strg + Scrollen), Panning (Ziehen des Hintergrunds) und
 * ein dynamisch skalierendes Canvas ohne Bildverzerrungen.
 */
export const GraphViewModal: React.FC = () => {
  const { t } = useTranslation();
  const { 
    isGraphViewOpen, 
    setGraphViewOpen, 
    jsonTabs, 
    openJsonFile, 
    setActiveJsonTab,
    setMode,
    addJsonTab
  } = useFileStore();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);

  // Interaktions-States für Zoom & Pan
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const draggingNodeRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const isPanningRef = useRef<boolean>(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const animFrameRef = useRef<number | null>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);

  nodesRef.current = nodes;
  edgesRef.current = edges;

  // Dynamische Anpassung der Canvas-Auflösung an die tatsächliche Container-Größe (1:1 Pixelverhältnis)
  const syncCanvasDimensions = () => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (canvas && container) {
      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        canvas.width = Math.floor(rect.width);
        canvas.height = Math.floor(rect.height);
      }
    }
  };

  /**
   * Lädt die Graphenstruktur basierend auf allen aktuell geöffneten Tabs neu.
   * Setzt auf Wunsch auch Zoom und Pan auf den Standardwert (100%) zurück.
   *
   * @param resetView - Steuert, ob Zoom und Pan zurückgesetzt werden sollen.
   */
  const loadGraphData = async (resetView: boolean = false) => {
    syncCanvasDimensions();
    const width = canvasRef.current?.width || 1100;
    const height = canvasRef.current?.height || 560;

    const { nodes: newNodes, edges: newEdges } = await buildGraphTopology(jsonTabs, width, height);
    setNodes(newNodes);
    setEdges(newEdges);

    if (resetView) {
      setZoomLevel(1.0);
      setPanOffset({ x: 0, y: 0 });
    }
  };

  useEffect(() => {
    if (!isGraphViewOpen) return;

    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          syncCanvasDimensions();
          loadGraphData(true);
        }
      }
    });

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [isGraphViewOpen, jsonTabs]);

  // Zeichenschleife
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let running = true;
    const renderLoop = () => {
      if (!running) return;

      // Physik-Simulationsschritt für dynamische Bewegung
      if (nodesRef.current.length > 0) {
        stepForceSimulation(
          nodesRef.current,
          edgesRef.current,
          canvas.width,
          canvas.height,
          draggingNodeRef.current?.id || null
        );
      }

      // Filter bei Suche
      const filteredNodes = searchQuery
        ? nodesRef.current.filter((n) => n.title.toLowerCase().includes(searchQuery.toLowerCase()))
        : nodesRef.current;

      renderCanvasGraph(
        ctx,
        canvas.width,
        canvas.height,
        filteredNodes,
        edgesRef.current,
        selectedNodeId,
        hoveredNodeId,
        zoomLevel,
        panOffset
      );

      animFrameRef.current = requestAnimationFrame(renderLoop);
    };

    renderLoop();

    return () => {
      running = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isGraphViewOpen, selectedNodeId, hoveredNodeId, searchQuery, zoomLevel, panOffset]);

  // Wheel Handler für Strg + Scroll Zoom
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.1 : -0.1;
        setZoomLevel((prev) => Math.max(0.3, Math.min(3.0, +(prev + delta).toFixed(2))));
      }
    };

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, []);

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;

    // Welt-Koordinaten anhand Zoom und Pan berechnen
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const worldX = (rawX - centerX - panOffset.x) / zoomLevel + centerX;
    const worldY = (rawY - centerY - panOffset.y) / zoomLevel + centerY;

    const clickedNode = nodesRef.current.find((n) => {
      const dx = n.x - worldX;
      const dy = n.y - worldY;
      return Math.sqrt(dx * dx + dy * dy) <= n.radius + 6;
    });

    if (clickedNode) {
      setSelectedNodeId(clickedNode.id);
      draggingNodeRef.current = {
        id: clickedNode.id,
        offsetX: worldX - clickedNode.x,
        offsetY: worldY - clickedNode.y
      };

      if (e.ctrlKey || e.metaKey) {
        handleOpenNodeDocument(clickedNode);
      }
    } else {
      setSelectedNodeId(null);
      isPanningRef.current = true;
      panStartRef.current = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const worldX = (rawX - centerX - panOffset.x) / zoomLevel + centerX;
    const worldY = (rawY - centerY - panOffset.y) / zoomLevel + centerY;

    if (draggingNodeRef.current) {
      const dragNode = nodesRef.current.find((n) => n.id === draggingNodeRef.current!.id);
      if (dragNode) {
        dragNode.x = worldX - draggingNodeRef.current.offsetX;
        dragNode.y = worldY - draggingNodeRef.current.offsetY;
      }
      return;
    }

    if (isPanningRef.current) {
      setPanOffset({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y
      });
      return;
    }

    const hovered = nodesRef.current.find((n) => {
      const dx = n.x - worldX;
      const dy = n.y - worldY;
      return Math.sqrt(dx * dx + dy * dy) <= n.radius + 6;
    });

    setHoveredNodeId(hovered ? hovered.id : null);
  };

  const handleCanvasMouseUp = () => {
    draggingNodeRef.current = null;
    isPanningRef.current = false;
  };

  /**
   * Opens the document associated with the node or switches to its tab.
   *
   * @param node - Der anzuspringende Graphenknoten.
   */
  const handleOpenNodeDocument = async (node: GraphNode) => {
    if (node.tabId) {
      setActiveJsonTab(node.tabId, node.listId);
      if (node.type !== "unknown") setMode(node.type as any);
      setGraphViewOpen(false);
    } else if (node.path) {
      const existsOnDisk = await invokeTauriSafe<boolean>("file_exists", { path: node.path });
      if (existsOnDisk) {
        await openJsonFile(node.path, node.listId);
        setGraphViewOpen(false);
      } else {
        Modal.confirm({
          title: t("graph.fileNotFoundTitle", { title: node.title }),
          content: t("graph.createFilePrompt"),
          okText: t("graph.createFileBtn"),
          cancelText: t("common.cancel"),
          onOk: () => {
            const ext = node.type === "todo" ? "todo" : "md";
            addJsonTab(node.path, "", ext as any);
            setGraphViewOpen(false);
          }
        });
      }
    }
  };

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  if (!isGraphViewOpen) return null;

  return (
    <Modal
      open={isGraphViewOpen}
      onCancel={() => setGraphViewOpen(false)}
      footer={null}
      width="92vw"
      style={{ top: 20 }}
      title={
        <div className="flex items-center space-x-2 text-white font-sans">
          <Network size={18} style={{ color: "var(--color-primary-accent)" }} />
          <span className="font-semibold text-sm">{t("graph.title")}</span>
          <span className="text-xs text-slate-500 font-mono">{t("graph.nodesLinksCount", { nodes: nodes.length, edges: edges.length })}</span>
          <span className="text-xs font-mono pl-3" style={{ color: "var(--color-primary-accent)" }}>Zoom: {Math.round(zoomLevel * 100)}%</span>
        </div>
      }
      className="graph-view-modal"
      styles={{
        content: { backgroundColor: "#090d16", borderColor: "#1e293b", padding: "16px" },
        header: { backgroundColor: "#090d16", borderBottom: "1px solid #1e293b" }
      }}
    >
      <div className="flex flex-col space-y-3 font-sans select-none h-[80vh]">
        {/* Top Controls: Search Bar, Legend & Controls */}
        <div className="flex items-center justify-between gap-3 bg-[#0e1624] p-2 rounded border border-slate-800 shrink-0">
          <div className="flex items-center space-x-2 flex-1 max-w-xs">
            <Input
              size="small"
              prefix={<Search size={13} className="text-slate-400" />}
              placeholder={t("graph.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-[#090d16] text-xs text-white border-slate-700"
              allowClear
            />
          </div>

          <div className="flex items-center space-x-4 text-[11px] text-slate-400 font-mono">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#047857] inline-block" /> ToDo</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#34d399] border border-emerald-200 inline-block" /> {t("graph.listLegend")}</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block" /> Markdown</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> JSON</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-sky-500 inline-block" /> XML</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" /> {t("graph.missingLegend")}</span>
          </div>

          <div className="flex items-center space-x-1">
            <Tooltip title={t("graph.zoomIn")}>
              <Button
                type="text"
                size="small"
                icon={<ZoomIn size={14} style={{ color: "var(--color-primary-accent)" }} />}
                onClick={() => setZoomLevel((z) => Math.min(3.0, +(z + 0.2).toFixed(2)))}
                className="hover:bg-slate-800"
              />
            </Tooltip>
            <Tooltip title={t("graph.zoomOut")}>
              <Button
                type="text"
                size="small"
                icon={<ZoomOut size={14} style={{ color: "var(--color-primary-accent)" }} />}
                onClick={() => setZoomLevel((z) => Math.max(0.3, +(z - 0.2).toFixed(2)))}
                className="hover:bg-slate-800"
              />
            </Tooltip>
            <Tooltip title={t("graph.center")}>
              <Button
                type="text"
                size="small"
                icon={<RefreshCw size={14} style={{ color: "var(--color-primary-accent)" }} />}
                onClick={() => loadGraphData(true)}
                className="hover:bg-slate-800"
              />
            </Tooltip>

            <div className="h-4 w-[1px] bg-slate-800 mx-1" />

            <Tooltip
              title={
                <div className="text-xs space-y-1 p-1 font-mono">
                  <p className="font-semibold" style={{ color: "var(--color-primary-accent)" }}>{t("graph.controlsTitle")}</p>
                  <p>• {t("graph.ctrlScroll")}</p>
                  <p>• {t("graph.dragBg")}</p>
                  <p>• {t("graph.dragNodeHelp")}</p>
                  <p>• {t("graph.ctrlClickHelp")}</p>
                </div>
              }
            >
              <Button
                type="text"
                size="small"
                icon={<Info size={14} style={{ color: "var(--color-primary-accent)" }} />}
                className="hover:bg-slate-800"
              />
            </Tooltip>
          </div>
        </div>

        {/* 2D Canvas Graph Display with Dynamic 1:1 Pixel Dimensions */}
        <div ref={containerRef} className="relative border border-slate-800/80 rounded-lg overflow-hidden bg-[#070a10] flex-1 min-h-0">
          <canvas
            ref={canvasRef}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            className="w-full h-full block cursor-crosshair"
          />

          {/* Selected Node Details Card Overlay */}
          {selectedNode && (
            <div className="absolute top-3 right-3 w-72 bg-[#0e1624]/95 border border-slate-800 rounded-lg p-3 shadow-xl space-y-2 text-xs backdrop-blur-md">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                <span className="font-semibold text-white truncate max-w-[200px]">
                  {selectedNode.isListNode ? `📋 ${selectedNode.title}` : selectedNode.title}
                </span>
                <Button
                  type="text"
                  size="small"
                  icon={<X size={12} className="text-slate-400" />}
                  onClick={() => setSelectedNodeId(null)}
                  className="h-5 w-5 p-0 hover:bg-slate-800"
                />
              </div>

              <div className="text-[11px] text-slate-400 font-mono space-y-1">
                <div><span className="text-slate-500">{t("graph.typeLabel")}</span> <span className="uppercase" style={{ color: "var(--color-primary-accent)" }}>{selectedNode.isListNode ? t("graph.todoListType") : selectedNode.type}</span></div>
                <div><span className="text-slate-500">{t("graph.statusLabel")}</span> {selectedNode.exists ? <span className="text-emerald-400">{t("graph.statusPresent")}</span> : <span className="text-rose-400">{t("graph.statusMissing")}</span>}</div>
                {selectedNode.path && <div className="truncate" title={selectedNode.path}><span className="text-slate-500">{t("graph.pathLabel")}</span> {selectedNode.path}</div>}
              </div>

              <div className="pt-1 flex gap-1.5">
                <Button
                  type="primary"
                  size="small"
                  icon={<ExternalLink size={12} />}
                  onClick={() => handleOpenNodeDocument(selectedNode)}
                  className="text-xs flex-1"
                >
                  {selectedNode.isListNode ? t("graph.openListBtn") : t("graph.openFileBtn")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
