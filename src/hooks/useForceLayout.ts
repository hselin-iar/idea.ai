import { useEffect, useRef } from 'react';
import { useStore } from '@/lib/store';
import * as d3 from 'd3-force';
import { Node } from '@xyflow/react';

// D3 Node type extending React Flow Node
type D3Node = {
    id: string;
    x: number;
    y: number;
    vx?: number;
    vy?: number;
    fx?: number | null;
    fy?: number | null;
};

type D3Edge = {
    source: string | D3Node;
    target: string | D3Node;
    id: string;
};

export const useForceLayout = () => {
    const nodes = useStore((state) => state.nodes);
    const edges = useStore((state) => state.edges);
    const setNodes = useStore((state) => state.setNodes);

    const simulationRef = useRef<d3.Simulation<D3Node, D3Edge> | null>(null);

    useEffect(() => {
        // Only run if we have nodes
        if (nodes.length === 0) return;

        // Prepare D3 data
        // We Map current nodes to D3 objects. 
        // We must try to preserve velocities if we can, but simpler is just positions.
        const d3Nodes: D3Node[] = nodes.map((node) => ({
            id: node.id,
            x: node.position.x || 0,
            y: node.position.y || 0,
        }));

        const d3Edges: D3Edge[] = edges.map((edge) => ({
            id: edge.id,
            source: edge.source,
            target: edge.target,
        }));

        if (simulationRef.current) simulationRef.current.stop();

        const simulation = d3.forceSimulation(d3Nodes)
            .force('charge', d3.forceManyBody().strength(-1000)) // Stronger repulsion
            .force('center', d3.forceCenter(0, 0).strength(0.05))
            .force('collide', d3.forceCollide().radius(200).strength(0.8)) // Big radius for expandable nodes
            .force('link', d3.forceLink(d3Edges).id((d: any) => d.id).distance(250)) // More space for connections
            .alpha(1)
            .alphaDecay(0.05) // Faster settling
            .on('tick', () => {
                // Sync back to React Flow
                const positions = new Map(d3Nodes.map(d => [d.id, { x: d.x, y: d.y }]));

                // Use functional update to get latest nodes but only update positions
                // We can't access "latest nodes" inside here easily without ref, but `nodes` is from closure.
                // Actually, if we use setNodes(prev => ...), it works.
                // But `useStore` setNodes might not support functional update?
                // Zustand's set supports it, but our store wrapper `setNodes: (nodes) => set({ nodes })` takes value.
                // Let's modify store or just use the closure `nodes` (which is stale? No, effect re-runs on length change).
                // If `nodes` implies strict equality check, we might be overwriting user interaction?
                // For now, let's assume this "Burst" happens only on structure change, user isn't dragging yet.

                const updatedNodes = nodes.map((n) => {
                    const pos = positions.get(n.id);
                    if (pos) return { ...n, position: pos };
                    return n;
                });

                setNodes(updatedNodes);
            });

        simulationRef.current = simulation;

        return () => {
            simulation.stop();
        };
    }, [nodes.length, edges.length]); // Re-run when graph topology changes
};
