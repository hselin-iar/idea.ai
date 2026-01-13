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
    // V38: Full state replacement from AI with optional node updates
    setMindMapFromJSON: (mapData: { nodes: any[], edges: any[], nodeUpdates?: any[] }) => void;
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

    // V38: COMPREHENSIVE NODE HANDLING
    // - Detects duplicates by label
    // - Handles nodeUpdates for enriching existing descriptions
    // - Auto-connects orphaned nodes to root
    // - Always updates descriptions when AI provides new context
    setMindMapFromJSON: (mapData) => {
        if (!mapData || !mapData.nodes) return;

        const currentNodes = get().nodes;
        const currentEdges = get().edges;

        // Create lookup maps for existing nodes
        const existingNodeById = new Map(currentNodes.map(n => [n.id, n]));
        const existingNodeByLabel = new Map(
            currentNodes.map(n => [String(n.data.label || '').toLowerCase().trim(), n])
        );

        const updatedNodes: Node[] = [];
        const newNodes: Node[] = [];
        const idMapping: Map<string, string> = new Map();

        // V38: Process nodeUpdates FIRST to update existing descriptions
        if (mapData.nodeUpdates && Array.isArray(mapData.nodeUpdates)) {
            mapData.nodeUpdates.forEach((update: any) => {
                const existingNode = existingNodeById.get(update.id);
                if (existingNode && update.description) {
                    updatedNodes.push({
                        ...existingNode,
                        data: {
                            ...existingNode.data,
                            description: update.description,
                        }
                    });
                }
            });
        }

        mapData.nodes.forEach((n: any, index: number) => {
            const normalizedLabel = String(n.label || '').toLowerCase().trim();

            // Skip nodes with empty labels
            if (!normalizedLabel) return;

            // Check if node already exists
            const existingById = existingNodeById.get(n.id);
            const existingByLabel = existingNodeByLabel.get(normalizedLabel);

            if (n.id === 'root' && existingById) {
                // Root node: update in place
                updatedNodes.push({
                    ...existingById,
                    data: {
                        ...existingById.data,
                        label: n.label || existingById.data.label,
                        description: n.description || existingById.data.description,
                    }
                });
                idMapping.set(n.id, n.id);
            } else if (existingByLabel) {
                // Node with same label exists: map to existing ID
                idMapping.set(n.id, existingByLabel.id);

                // V38: ALWAYS update description if AI provided one
                if (n.description && n.description !== existingByLabel.data.description) {
                    // Check if we haven't already updated this node
                    const alreadyUpdated = updatedNodes.some(un => un.id === existingByLabel.id);
                    if (!alreadyUpdated) {
                        updatedNodes.push({
                            ...existingByLabel,
                            data: {
                                ...existingByLabel.data,
                                description: n.description,
                            }
                        });
                    }
                }
            } else {
                // Genuinely new node: create with unique ID
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

                // Add to label map to prevent duplicates within same response
                existingNodeByLabel.set(normalizedLabel, {
                    id: newId,
                    position: { x: 0, y: 0 },
                    data: { label: n.label, description: n.description }
                } as Node);
            }
        });

        // Build final node list
        const updatedNodeIds = new Set(updatedNodes.map(n => n.id));
        const unchangedNodes = currentNodes.filter(n => !updatedNodeIds.has(n.id));
        const mergedNodes = [...unchangedNodes, ...updatedNodes, ...newNodes];
        const allNodeIds = new Set(mergedNodes.map(n => n.id));

        // V38: Process edges with ID remapping AND auto-connect orphans
        const existingEdgeKeys = new Set(currentEdges.map(e => `${e.source}-${e.target}`));
        const newNodesNeedingEdges = new Set(newNodes.map(n => n.id));

        const newEdgesFromAI: Edge[] = (mapData.edges || [])
            .map((e: any, index: number) => {
                let sourceId = idMapping.get(e.source) || e.source;
                const targetId = idMapping.get(e.target) || e.target;

                // V38: If source doesn't exist, fall back to root
                if (!allNodeIds.has(sourceId)) {
                    // Find root node
                    const rootNode = mergedNodes.find(n => n.id.includes('root') || mergedNodes.indexOf(n) === 0);
                    sourceId = rootNode?.id || 'root';
                }

                // Mark this new node as having an edge
                newNodesNeedingEdges.delete(targetId);

                return { source: sourceId, target: targetId, index };
            })
            .filter((e: any) => {
                const key = `${e.source}-${e.target}`;
                // Only add edge if both nodes exist AND edge doesn't already exist
                return allNodeIds.has(e.source) && allNodeIds.has(e.target) && !existingEdgeKeys.has(key);
            })
            .map((e: any) => ({
                id: `edge-${Date.now()}-${e.index}`,
                source: e.source,
                target: e.target,
            }));

        // V38: Auto-connect any orphaned new nodes to root
        const rootNode = mergedNodes.find(n => n.id.includes('root') || mergedNodes.indexOf(n) === 0);
        const orphanEdges: Edge[] = [];
        if (rootNode) {
            newNodesNeedingEdges.forEach(orphanId => {
                const key = `${rootNode.id}-${orphanId}`;
                if (!existingEdgeKeys.has(key)) {
                    orphanEdges.push({
                        id: `edge-orphan-${Date.now()}-${orphanId}`,
                        source: rootNode.id,
                        target: orphanId,
                    });
                }
            });
        }

        const mergedEdges = [...currentEdges, ...newEdgesFromAI, ...orphanEdges];

        console.log(`V38: Added ${newNodes.length} new nodes, ${newEdgesFromAI.length} edges, ${orphanEdges.length} orphan edges. Updated ${updatedNodes.length} descriptions.`);
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
