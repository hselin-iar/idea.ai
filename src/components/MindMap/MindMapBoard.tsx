'use client';

import {
    ReactFlow,
    Controls,
    Background,
    MiniMap,
    useReactFlow,
    Panel,
    BackgroundVariant,
    Edge,
    Connection,
} from '@xyflow/react';
import { toPng } from 'html-to-image';
import { Download, Undo2, Redo2 } from 'lucide-react';
import ExpandableNode from './ExpandableNode';
import QuestionNode from './QuestionNode';
import ChecklistNode from './ChecklistNode';
import MetricNode from './MetricNode';
import SectionNode from './SectionNode'; // New Phase B component
import '@xyflow/react/dist/style.css';
import { useStore } from '@/lib/store';
import { useForceLayout } from '@/hooks/useForceLayout';
import SectionBreadcrumb from '../Navigation/SectionBreadcrumb'; // New Phase B component
import { useMemo, useState, useEffect } from 'react';

const nodeTypes = {
    expandable: ExpandableNode,
    question: QuestionNode,
    checklist: ChecklistNode,
    metric: MetricNode,
    section: SectionNode,
};

function TopRightControls() {
    const undo = useStore((state) => state.undo);
    const redo = useStore((state) => state.redo);
    const past = useStore((state) => state.past);
    const future = useStore((state) => state.future);

    const onExportClick = () => {
        // Basic implementation: Capture the viewport container
        const checkElement = document.querySelector('.react-flow__viewport') as HTMLElement;

        if (checkElement) {
            // Simple delay to ensure rendering
            setTimeout(() => {
                toPng(checkElement, {
                    backgroundColor: '#09090b',
                    width: 1920, // Enforce high res
                    height: 1080,
                    style: {
                        transform: 'scale(1)', // normalize
                    },
                    cacheBust: true,
                }).then((dataUrl) => {
                    const a = document.createElement('a');
                    a.setAttribute('download', 'idea-ai-mindmap.png');
                    a.setAttribute('href', dataUrl);
                    a.click();
                }).catch(err => {
                    console.error("Failed to export image", err);
                });
            }, 100);
        }
    };

    return (
        <Panel position="top-right" className="flex items-center gap-2">
            <div className="flex bg-background/80 backdrop-blur-md border border-white/5 shadow-neumorphic-dark rounded-xl overflow-hidden p-1">
                <button
                    className={`p-2 rounded-lg transition-all ${past.length === 0 ? 'text-white/20 cursor-not-allowed' : 'text-text-muted hover:text-primary hover:bg-primary/10'}`}
                    onClick={() => past.length > 0 && undo()}
                    disabled={past.length === 0}
                    title="Undo (Cmd+Z)"
                >
                    <Undo2 size={16} />
                </button>
                <button
                    className={`p-2 rounded-lg transition-all ${future.length === 0 ? 'text-white/20 cursor-not-allowed' : 'text-text-muted hover:text-primary hover:bg-primary/10'}`}
                    onClick={() => future.length > 0 && redo()}
                    disabled={future.length === 0}
                    title="Redo (Cmd+Y)"
                >
                    <Redo2 size={16} />
                </button>
            </div>
            <button
                className="flex items-center gap-2 neumorphic-btn px-4 py-2.5 rounded-xl text-text-muted hover:text-primary transition-all font-medium text-sm border border-transparent hover:border-white/20 bg-background/80 backdrop-blur-md"
                onClick={onExportClick}
                title="Export map as PNG"
            >
                <Download size={16} />
                Export PNG
            </button>
        </Panel>
    );
}

export default function MindMapBoard() {
    const nodes = useStore((state) => state.nodes);
    const edges = useStore((state) => state.edges);
    const onNodesChange = useStore((state) => state.onNodesChange);
    const onEdgesChange = useStore((state) => state.onEdgesChange);
    const onConnect = useStore((state) => state.onConnect);
    const activeSection = useStore((state) => state.activeSection);
    const reconnectEdge = useStore((state) => state.reconnectEdge);
    const removeEdge = useStore((state) => state.removeEdge);
    const undo = useStore((state) => state.undo);
    const redo = useStore((state) => state.redo);
    const [isFullView, setIsFullView] = useState(false);

    // Filter nodes based on activeSection
    const { visibleNodes, visibleEdges } = useMemo(() => {
        // Fix #10: In Full View, show ALL nodes unconditionally
        if (isFullView) {
            return { visibleNodes: nodes, visibleEdges: edges };
        }

        if (!activeSection) {
            // OVERVIEW MODE: Show only Root (goal) and top-level Sections.
            const sectionNodeIds = nodes.filter(n => n.data.nodeClass === 'section' || n.type === 'section').map(n => n.id);
            const overviewNodes = nodes.filter(n =>
                n.data.nodeClass === 'goal' || sectionNodeIds.includes(n.id)
            );

            // Only show edges connecting to the overview nodes
            const overviewEdges = edges.filter(e =>
                overviewNodes.some(n => n.id === e.source) && overviewNodes.some(n => n.id === e.target)
            );

            return { visibleNodes: overviewNodes, visibleEdges: overviewEdges };
        }

        // SECTION MODE: Show the open Section node + all descendants
        const sectionDescendantIds = new Set<string>();
        const adjacency = new Map<string, string[]>();
        edges.forEach((edge) => {
            const children = adjacency.get(edge.source) || [];
            children.push(edge.target);
            adjacency.set(edge.source, children);
        });
        const queue = [activeSection];

        while (queue.length > 0) {
            const current = queue.shift()!;
            if (sectionDescendantIds.has(current)) continue;
            sectionDescendantIds.add(current);
            const children = adjacency.get(current) || [];
            for (const child of children) {
                if (!sectionDescendantIds.has(child)) {
                    queue.push(child);
                }
            }
        }

        // Include goal node for global context reference even in section mode
        const sectionNodes = nodes.filter(n => sectionDescendantIds.has(n.id) || n.data.nodeClass === 'goal');
        const sectionEdges = edges.filter(e => sectionDescendantIds.has(e.source) && sectionDescendantIds.has(e.target));

        return { visibleNodes: sectionNodes, visibleEdges: sectionEdges };
    }, [nodes, edges, activeSection, isFullView]);

    // Activate force layout, scoped ONLY to the visible elements to save CPU
    useForceLayout(visibleNodes, visibleEdges);

    // Get react flow instance to trigger fitView programmatically
    const reactFlowInstance = useReactFlow();

    // Undo/Redo keyboard shortcuts (Fix #38)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Check for Cmd (Mac) or Ctrl (Windows/Linux)
            const isModifier = e.metaKey || e.ctrlKey;

            if (isModifier) {
                if (e.key === 'z') {
                    if (e.shiftKey) {
                        redo(); // Cmd+Shift+Z
                        e.preventDefault();
                    } else {
                        undo(); // Cmd+Z
                        e.preventDefault();
                    }
                } else if (e.key === 'y') {
                    redo(); // Cmd+Y
                    e.preventDefault();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [undo, redo]);

    // Auto fit-view when new nodes appear (Fix #1, #2, #19)
    useEffect(() => {
        if (visibleNodes.length > 0) {
            const timer = setTimeout(() => {
                reactFlowInstance.fitView({ padding: 0.2, duration: 800 });
            }, 300); // Give the D3 layout a fraction of a second to spread nodes before zooming
            return () => clearTimeout(timer);
        }
    }, [visibleNodes.length, reactFlowInstance]);

    // V48: Handle edge reconnection (dragging edge to new target or to empty = delete)
    const onReconnect = (oldEdge: Edge, newConnection: Connection) => {
        // If new connection has valid source and target, reconnect
        if (newConnection.source && newConnection.target) {
            reconnectEdge(oldEdge.id, newConnection.source, newConnection.target);
        }
    };

    // V48: Delete edge when dragged to empty space
    const onReconnectEnd = (_: unknown, edge: Edge, handleType: string | null) => {
        // If handleType is undefined, the edge was dropped in empty space - delete it
        if (!handleType) {
            removeEdge(edge.id);
        }
    };

    return (
        <div className="w-full h-full bg-transparent relative selection:bg-primary/30">
            {/* Phase B: Breadcrumb overlay */}
            <SectionBreadcrumb isFullView={isFullView} setIsFullView={setIsFullView} />

            <div className="absolute inset-0 z-10 pt-16">
                <ReactFlow
                    nodes={visibleNodes}
                    edges={visibleEdges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onReconnect={onReconnect}
                    onReconnectEnd={onReconnectEnd}
                    nodeTypes={nodeTypes}
                    colorMode="dark"
                    fitView
                    edgesReconnectable={true}
                    defaultEdgeOptions={{
                        type: 'bezier',
                        animated: false, // Fix #7 - noisy marching ants
                        style: { strokeWidth: 2, stroke: 'rgba(230, 226, 221, 0.5)' } // Fix #9 - edge legibility
                    }}
                    className="bg-transparent"
                >
                    <Controls className="!bg-background/80 !backdrop-blur-md !border-white/5 !text-text-muted shadow-neumorphic-dark rounded-xl overflow-hidden [&>button]:!border-b-white/5 hover:[&>button]:!bg-primary/10 hover:[&>button]:!text-primary" />
                    <MiniMap
                        className="!bg-background/80 !backdrop-blur-md !border-white/5 !rounded-xl shadow-neumorphic-dark"
                        maskColor="rgba(42, 40, 38, 0.8)"
                        nodeColor="#2b8cee"
                    />
                    <Background
                        color="#75716b"
                        gap={20}
                        size={1}
                        variant={BackgroundVariant.Dots}
                        className="opacity-40" // Fix #18 - canvas too dark
                    />
                    <TopRightControls />
                </ReactFlow>
            </div>
        </div>
    );
}
