'use client';

import {
    ReactFlow,
    Controls,
    Background,
    MiniMap,
    useReactFlow,
    Panel,
    BackgroundVariant,
    Edge
} from '@xyflow/react';
import { toPng } from 'html-to-image';
import { Download } from 'lucide-react';
import ExpandableNode from './ExpandableNode';
import '@xyflow/react/dist/style.css';
import { useStore } from '@/lib/store';
import { useForceLayout } from '@/hooks/useForceLayout';

const nodeTypes = {
    expandable: ExpandableNode,
    // v7: ImageNode deprecated/merged into ExpandableNode
};

function DownloadButton() {
    const { getNodes } = useReactFlow();

    const onClick = () => {
        // Basic implementation: Capture the viewport container
        // Ideally we would calculate bounds and fitView, but for stability we just capture what's there
        // or use a large container.
        // To ensure we capture everything, we can use useReactFlow().fitView() first? 
        // Let's just capture the visible area for now to avoid complexity with missing imports.

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
        <Panel position="top-right">
            <button
                className="flex items-center gap-2 bg-zinc-800 text-zinc-200 px-3 py-2 rounded-lg border border-zinc-700 hover:bg-zinc-700 hover:text-white transition-colors shadow-lg text-sm font-medium"
                onClick={onClick}
            >
                <Download size={14} />
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
    const setEdges = useStore((state) => state.setEdges);

    // Activate force layout
    useForceLayout();

    // V48: Handle edge reconnection (dragging edge to new target or to empty = delete)
    const onReconnect = (oldEdge: any, newConnection: any) => {
        // If new connection has valid source and target, reconnect
        if (newConnection.source && newConnection.target) {
            const updatedEdges = edges.map(e =>
                e.id === oldEdge.id
                    ? { ...e, source: newConnection.source, target: newConnection.target }
                    : e
            );
            setEdges(updatedEdges);
        }
    };

    // V48: Delete edge when dragged to empty space
    const onReconnectEnd = (_: unknown, edge: Edge, handleType: string | null) => {
        // If handleType is undefined, the edge was dropped in empty space - delete it
        if (!handleType) {
            setEdges(edges.filter((e) => e.id !== edge.id));
        }
    };

    return (
        <div className="w-full h-full bg-zinc-950">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onReconnect={onReconnect}
                nodeTypes={nodeTypes}
                colorMode="dark"
                fitView
                edgesReconnectable={true}
            >
                <Background variant={BackgroundVariant.Dots} gap={12} size={1} color="#3f3f46" />
                <Controls className="bg-zinc-800 border-zinc-700 fill-zinc-400" />
                <MiniMap
                    className="bg-zinc-900 border-zinc-700"
                    maskColor="rgba(9, 9, 11, 0.8)"
                    nodeColor="#6366f1"
                />
                <DownloadButton />
            </ReactFlow>
        </div>
    );
}
