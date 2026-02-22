import { useEffect, useMemo, useRef } from 'react';
import { useStore } from '@/lib/store';
import * as d3 from 'd3-force';
import { Node, Edge } from '@xyflow/react';

// D3 Node type extending React Flow Node with class info
type D3Node = {
    id: string;
    x: number;
    y: number;
    vx?: number;
    vy?: number;
    fx?: number | null;
    fy?: number | null;
    nodeClass?: string;
};

type D3Edge = {
    source: string | D3Node;
    target: string | D3Node;
    id: string;
};

// V56: Class-based vertical zones (hierarchical positioning)
const CLASS_Y_POSITIONS: Record<string, number> = {
    goal: 0,
    subgoal: 200,
    metric: 200,
    task: 400,
    constraint: 400,
    resource: 600,
    idea: 500,
};

// V56: Class-based horizontal clustering
const CLASS_X_OFFSETS: Record<string, number> = {
    goal: 0,
    subgoal: -100,
    metric: 200,
    task: -50,
    constraint: 250,
    resource: 0,
    idea: 100,
};

export const useForceLayout = (visibleNodes: Node[], visibleEdges: Edge[]) => {
    const simulationRef = useRef<d3.Simulation<D3Node, D3Edge> | null>(null);
    const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const setNodesRef = useRef(useStore.getState().setNodes);
    const allNodesRef = useRef(useStore.getState().nodes);
    const visibleNodesRef = useRef(visibleNodes);
    const visibleEdgesRef = useRef(visibleEdges);

    useEffect(() => {
        visibleNodesRef.current = visibleNodes;
        visibleEdgesRef.current = visibleEdges;
    }, [visibleNodes, visibleEdges]);

    useEffect(() => {
        const unsubscribe = useStore.subscribe((state) => {
            setNodesRef.current = state.setNodes;
            allNodesRef.current = state.nodes;
        });
        return unsubscribe;
    }, []);

    const nodeIdsKey = useMemo(() => visibleNodes.map((n) => n.id).sort().join(','), [visibleNodes]);
    const edgeIdsKey = useMemo(() => visibleEdges.map((e) => e.id).sort().join(','), [visibleEdges]);

    useEffect(() => {
        const scopedNodes = visibleNodesRef.current;
        const scopedEdges = visibleEdgesRef.current;
        if (scopedNodes.length === 0) return;

        // Prepare D3 data with class info, using scoped visible nodes only
        const d3Nodes: D3Node[] = scopedNodes.map((node) => ({
            id: node.id,
            x: node.position.x || 0,
            y: node.position.y || 0,
            nodeClass: (node.data?.nodeClass as string) || 'idea',
        }));

        const d3Edges: D3Edge[] = scopedEdges.map((edge) => ({
            id: edge.id,
            source: edge.source,
            target: edge.target,
        }));

        if (simulationRef.current) simulationRef.current.stop();
        if (stopTimerRef.current) clearTimeout(stopTimerRef.current);

        // V56: Custom class clustering force
        const classClusterForce = () => {
            for (const node of d3Nodes) {
                // Fix goal node at center-left
                if (node.nodeClass === 'goal' || node.id === 'root') {
                    node.fx = -300;
                    node.fy = 300;
                    continue; // Skip force adjustments for fixed nodes
                }

                const targetY = CLASS_Y_POSITIONS[node.nodeClass || 'idea'] ?? 400;
                const targetX = CLASS_X_OFFSETS[node.nodeClass || 'idea'] ?? 0;

                // Stronger pull toward class zone (increased from 0.03 to 0.08)
                node.vy = (node.vy || 0) + (targetY - node.y) * 0.08;
                node.vx = (node.vx || 0) + (targetX - node.x) * 0.03; // Stronger horizontal pull
            }
        };

        let lastUpdateTime = 0;

        const simulation = d3.forceSimulation(d3Nodes)
            .force('charge', d3.forceManyBody().strength(-1000)) // increase repulsion slightly
            .force('center', d3.forceCenter(0, 300).strength(0.05)) // stronger center pull
            .force('collide', d3.forceCollide().radius(320).strength(0.8)) // increased radius to prevent overlap
            .force('link', d3.forceLink<D3Node, D3Edge>(d3Edges).id((d) => d.id).distance(350).strength(0.5))
            .force('classCluster', classClusterForce) // V56: Class-based clustering
            .alpha(1)
            .alphaDecay(0.08) // Faster decay — nodes settle in ~3-4 seconds
            .on('tick', () => {
                const now = Date.now();
                if (now - lastUpdateTime < 32) return; // Limit to ~30fps
                lastUpdateTime = now;

                const positions = new Map(d3Nodes.map(d => [d.id, { x: d.x, y: d.y }]));

                // Update the global nodes array with the new positions of the visible nodes
                const updatedNodes = allNodesRef.current.map((n) => {
                    const pos = positions.get(n.id);
                    if (pos) return { ...n, position: pos };
                    return n;
                });

                setNodesRef.current(updatedNodes);
            });

        simulationRef.current = simulation;

        // Hard stop after 4 seconds — prevent indefinite jittering
        stopTimerRef.current = setTimeout(() => {
            simulation.stop();
        }, 4000);

        return () => {
            if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
            simulation.stop();
        };
    }, [nodeIdsKey, edgeIdsKey]);
};
