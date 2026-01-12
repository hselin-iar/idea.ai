import { create } from 'zustand';
import {
    Connection,
    Edge,
    EdgeChange,
    Node,
    NodeChange,
    addEdge,
    OnNodesChange,
    OnEdgesChange,
    OnConnect,
    applyNodeChanges,
    applyEdgeChanges,
} from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';

export type Role = 'user' | 'assistant' | 'system';

export interface Message {
    id: string;
    role: Role;
    content: string;
    timestamp: number;
    options?: string[];
}

interface AppState {
    // Mind Map State
    nodes: Node[];
    edges: Edge[];
    onNodesChange: OnNodesChange;
    onEdgesChange: OnEdgesChange;
    onConnect: OnConnect;
    addNode: (label: string, parentId?: string, type?: string, description?: string, imageUrl?: string) => void;
    deleteNode: (id: string) => void;
    duplicateNode: (id: string) => void;
    setNodes: (nodes: Node[]) => void;
    setEdges: (edges: Edge[]) => void;
    // V23: Full state replacement from AI
    setMindMapFromJSON: (mapData: { nodes: any[], edges: any[] }) => void;
    getMindMapAsJSON: () => string;

    // Chat State
    messages: Message[];
    addMessage: (role: Role, content: string, options?: string[]) => void;
    setMessages: (messages: Message[]) => void;
    getMessagesForAI: () => { role: string, content: string }[];

    // Session State
    goal: string;
    setGoal: (goal: string) => void;
}

export const useStore = create<AppState>((set, get) => ({
    nodes: [],
    edges: [],

    onNodesChange: (changes: NodeChange[]) => {
        set({
            nodes: applyNodeChanges(changes, get().nodes),
        });
    },

    onEdgesChange: (changes: EdgeChange[]) => {
        set({
            edges: applyEdgeChanges(changes, get().edges),
        });
    },

    onConnect: (connection: Connection) => {
        set({
            edges: addEdge(connection, get().edges),
        });
    },

    addNode: (label: string, parentId?: string, type = 'default', description?: string, imageUrl?: string) => {
        const id = uuidv4();
        const nodes = get().nodes;

        // Validation: Verify parentId exists.
        // If parentId is provided but not found, check if it's a placeholder "id-of-parent" or similar garbage from AI.
        // Fallback: If we have nodes, link to the first one (Root).
        let effectiveParentId = parentId;
        const parentExists = parentId ? nodes.some(n => n.id === parentId) : false;

        if (!parentExists) {
            // If valid nodes exist, use the first one as root default
            effectiveParentId = nodes.length > 0 ? nodes[0].id : undefined;
        }

        const newNode: Node = {
            id,
            position: { x: Math.random() * 500, y: Math.random() * 500 }, // Random initial pos, layout will fix
            data: { label, description, imageUrl },
            type,
        };

        set((state) => {
            const newNodes = [...state.nodes, newNode];
            let newEdges = state.edges;

            // Only add edge if we have a valid parent
            if (effectiveParentId) {
                newEdges = [
                    ...state.edges,
                    { id: `e${effectiveParentId}-${id}`, source: effectiveParentId, target: id },
                ];
            } else {
                // Optimization: If no parent (first node), center it
                newNode.position = { x: 0, y: 0 };
            }

            return { nodes: newNodes, edges: newEdges };
        });
    },

    deleteNode: (id: string) => {
        set((state) => {
            const nodesToDelete = new Set<string>();
            const q = [id];

            while (q.length > 0) {
                const currentId = q.shift()!;
                if (nodesToDelete.has(currentId)) continue;
                nodesToDelete.add(currentId);

                state.edges.filter(e => e.source === currentId).forEach(e => q.push(e.target));
            }

            return {
                nodes: state.nodes.filter((n) => !nodesToDelete.has(n.id)),
                edges: state.edges.filter((e) => !nodesToDelete.has(e.source) && !nodesToDelete.has(e.target)),
            };
        });
    },

    duplicateNode: (id: string) => {
        const nodeToClone = get().nodes.find(n => n.id === id);
        if (!nodeToClone) return;

        const newId = uuidv4();
        const newNode: Node = {
            ...nodeToClone,
            id: newId,
            position: {
                x: nodeToClone.position.x + 50,
                y: nodeToClone.position.y + 50
            },
            data: { ...nodeToClone.data, label: `${nodeToClone.data.label} (Copy)` },
            selected: false,
        };

        // We don't copy edges because it might be messy, user can reconnect
        set((state) => ({ nodes: [...state.nodes, newNode] }));
    },

    setNodes: (nodes) => set({ nodes }),
    setEdges: (edges) => set({ edges }),

    // V36: GENERALIZED NODE HANDLING
    // - Only 'root' node is protected (can be updated)
    // - ALL other nodes from AI create NEW nodes with unique IDs
    // - This works for ANY project type
    setMindMapFromJSON: (mapData) => {
        if (!mapData || !mapData.nodes) return;

        const currentNodes = get().nodes;
        const currentEdges = get().edges;
        const existingNodeMap = new Map(currentNodes.map(n => [n.id, n]));

        const updatedNodes: Node[] = [];
        const newNodes: Node[] = [];
        const idMapping: Map<string, string> = new Map();

        mapData.nodes.forEach((n: any, index: number) => {
            const existingNode = existingNodeMap.get(n.id);

            // V36: Only 'root' can be updated, everything else is NEW
            if (n.id === 'root' && existingNode) {
                updatedNodes.push({
                    ...existingNode,
                    data: {
                        ...existingNode.data,
                        label: n.label || existingNode.data.label,
                        description: n.description || existingNode.data.description,
                    }
                });
                idMapping.set(n.id, n.id);
            } else if (n.label && n.label.trim()) {
                // ALL other nodes become NEW with unique ID
                const newId = `node-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 5)}`;
                idMapping.set(n.id, newId);

                newNodes.push({
                    id: newId,
                    position: { x: Math.random() * 600, y: Math.random() * 400 },
                    data: {
                        label: n.label,
                        description: n.description || '',
                        imageUrl: n.imageUrl
                    },
                    type: 'expandable',
                });
            }
        });

        // Build final node list
        const updatedNodeIds = new Set(updatedNodes.map(n => n.id));
        const unchangedNodes = currentNodes.filter(n => !updatedNodeIds.has(n.id));
        const mergedNodes = [...unchangedNodes, ...updatedNodes, ...newNodes];
        const allNodeIds = new Set(mergedNodes.map(n => n.id));

        // Process edges with ID remapping
        const existingEdgeKeys = new Set(currentEdges.map(e => `${e.source}-${e.target}`));
        const newEdgesFromAI: Edge[] = (mapData.edges || [])
            .map((e: any, index: number) => {
                const sourceId = idMapping.get(e.source) || e.source;
                const targetId = idMapping.get(e.target) || e.target;
                return { source: sourceId, target: targetId, index };
            })
            .filter((e: any) => {
                const key = `${e.source}-${e.target}`;
                return allNodeIds.has(e.source) && allNodeIds.has(e.target) && !existingEdgeKeys.has(key);
            })
            .map((e: any) => ({
                id: `edge-${Date.now()}-${e.index}`,
                source: e.source,
                target: e.target,
            }));

        const mergedEdges = [...currentEdges, ...newEdgesFromAI];

        console.log(`V36: Added ${newNodes.length} new nodes, ${newEdgesFromAI.length} new edges. (Root updated: ${updatedNodes.length > 0})`);
        set({ nodes: mergedNodes, edges: mergedEdges });
    },

    getMindMapAsJSON: () => {
        const state = get();
        const simplifiedNodes = state.nodes.map(n => ({
            id: n.id,
            label: n.data.label,
            description: n.data.description,
        }));
        const simplifiedEdges = state.edges.map(e => ({
            source: e.source,
            target: e.target,
        }));
        return JSON.stringify({ nodes: simplifiedNodes, edges: simplifiedEdges });
    },

    messages: [],
    addMessage: (role, content, options) => {
        const newMessage: Message = {
            id: uuidv4(),
            role,
            content,
            timestamp: Date.now(),
            options,
        };
        set((state) => ({ messages: [...state.messages, newMessage] }));
    },

    setMessages: (messages) => set({ messages }),

    getMessagesForAI: () => {
        return get().messages.map(m => ({ role: m.role, content: m.content }));
    },

    goal: '',
    setGoal: (goal) => set({ goal }),
}));
