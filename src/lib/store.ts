import { create } from 'zustand';
import { persist } from 'zustand/middleware';
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

export interface AINodeData {
    id: string;
    label: string;
    description?: string;
    nodeClass?: string;
    nodeType?: string;
    imageUrl?: string;
    items?: { id: string; text: string; completed: boolean }[];
    decisionOptions?: string[];
    chosenOption?: string;
    decisionConfidence?: number;
    tradeoffItems?: { id: string; label: string; impact: number; effort: number; risk: number; time: number }[];
    currentValue?: number;
    targetValue?: number;
    unit?: string;
    answer?: string;
    isAnswered?: boolean;
}

export interface AIEdgeData {
    source: string;
    target: string;
    index?: number;
}

export interface AINodeUpdateData {
    id: string;
    description?: string;
}

/** Thinking modes for design thinking approach */
export type ThinkingMode = 'explore' | 'analyze' | 'create' | 'execute';

/** Mode descriptions for UI and AI guidance */
export const THINKING_MODE_CONFIG: Record<ThinkingMode, {
    label: string;
    icon: string;
    description: string;
    aiGuidance: string;
}> = {
    explore: {
        label: 'Explore',
        icon: '🧠',
        description: 'Broad thinking, understand the problem',
        aiGuidance: 'Ask open-ended questions. Encourage divergent thinking. Accept incomplete ideas. Focus on understanding WHO and WHAT.'
    },
    analyze: {
        label: 'Analyze',
        icon: '🔍',
        description: 'Critical thinking, challenge assumptions',
        aiGuidance: 'Apply root cause analysis. Challenge assumptions. Ask WHY repeatedly. Identify gaps and risks. Be structured.'
    },
    create: {
        label: 'Create',
        icon: '✨',
        description: 'Innovation, generate alternatives',
        aiGuidance: 'Use SCAMPER prompts. Suggest creative alternatives. Generate multiple options. Push boundaries. Be playful.'
    },
    execute: {
        label: 'Execute',
        icon: '✅',
        description: 'Action planning, concrete steps',
        aiGuidance: 'Break into actionable tasks. Add deadlines and milestones. Assign resources. Create checklists. Be specific.'
    }
};

export interface Message {
    id: string;
    role: Role;
    content: string;
    timestamp: number;
    options?: string[];
    metadata?: {
        nodesAdded?: number;
        sectionName?: string;
        redirectTo?: string;
        redirectReason?: string;
        proposalId?: string;
        proposalSummary?: string;
        rejectedNodes?: number;
    };
}

export interface SectionBrief {
    sectionId: string;
    sectionLabel: string;
    focus: string;
    mustInclude: string;
    updatedAt: number;
}

export interface ProjectIntake {
    objective: string;
    targetAudience: string;
    constraints: string;
    successSignal: string;
    updatedAt: number;
}

export interface AIPatchProposal {
    id: string;
    createdAt: number;
    status: 'pending' | 'approved' | 'rejected';
    summary: string;
    sectionId?: string;
    source?: 'chat' | 'brief' | 'background';
    mapData: { nodes: AINodeData[]; edges: AIEdgeData[]; nodeUpdates?: AINodeUpdateData[] };
}

// V38: History state for Undo/Redo
interface HistoryState {
    nodes: Node[];
    edges: Edge[];
}

interface NodeMetricData {
    currentValue: number;
    targetValue: number;
    unit?: string;
}

interface SessionData {
    goal?: string;
    messages?: Message[];
    nodes?: Node[];
    edges?: Edge[];
    sectionBriefs?: Record<string, SectionBrief>;
    sectionBriefDismissed?: Record<string, boolean>;
    projectIntake?: ProjectIntake | null;
    projectIntakePrompted?: boolean;
    userConstraints?: string[];
    proposalMode?: boolean;
    sectionLoadingIds?: Record<string, boolean>;
}

const MAX_HISTORY = 50; // Maximum number of states to remember for undo/redo

interface AppState {
    // Mind Map State
    nodes: Node[];
    edges: Edge[];
    onNodesChange: OnNodesChange;
    onEdgesChange: OnEdgesChange;
    onConnect: OnConnect;
    addNode: (label: string, parentId?: string, type?: string, description?: string, imageUrl?: string, nodeClass?: string) => void;
    deleteNode: (id: string) => void;
    duplicateNode: (id: string) => void;
    setNodes: (nodes: Node[]) => void;
    setEdges: (edges: Edge[]) => void;
    reconnectEdge: (edgeId: string, source: string, target: string) => void;
    removeEdge: (edgeId: string) => void;
    // V38: Full state replacement from AI with optional node updates
    setMindMapFromJSON: (mapData: { nodes: AINodeData[], edges: AIEdgeData[], nodeUpdates?: AINodeUpdateData[] }) => void;
    getMindMapAsJSON: () => string;
    getScopedMindMapAsJSON: () => string;
    getScopedMindMapAsJSONForSection: (sectionId: string | null) => string;
    updateNodeContent: (id: string, label: string, description: string) => void;

    // Phase 4: Undo/Redo (Fix #38)
    past: HistoryState[];
    future: HistoryState[];
    undo: () => void;
    redo: () => void;
    pushToHistory: () => void;
    clearHistory: () => void;

    // Phase 3: Complex Node Persistence (Fix #34, #35)
    updateNodeItems: (id: string, items: { id: string; text: string; completed: boolean }[]) => void; // For checklist items
    updateNodeMetrics: (id: string, metrics: NodeMetricData) => void; // For metric values
    updateNodeQuestion: (id: string, answer: string, isAnswered: boolean) => void;

    // Chat State
    messages: Message[];
    addMessage: (role: Role, content: string, options?: string[], metadata?: Message['metadata']) => void;
    setMessages: (messages: Message[]) => void;
    getMessagesForAI: () => { role: string, content: string }[];
    clearChat: () => void; // Fix #44

    // Section briefs and user control
    sectionBriefs: Record<string, SectionBrief>;
    setSectionBrief: (sectionId: string, brief: Omit<SectionBrief, 'sectionId' | 'updatedAt'>) => void;
    clearSectionBrief: (sectionId: string) => void;
    sectionBriefDraftFor: string | null;
    openSectionBriefDraft: (sectionId: string) => void;
    closeSectionBriefDraft: () => void;
    sectionBriefDismissed: Record<string, boolean>;
    setSectionBriefDismissed: (sectionId: string, dismissed: boolean) => void;
    sectionLoadingIds: Record<string, boolean>;
    setSectionLoading: (sectionId: string, loading: boolean) => void;
    clearSectionLoading: () => void;
    projectIntake: ProjectIntake | null;
    setProjectIntake: (intake: Omit<ProjectIntake, 'updatedAt'>) => void;
    clearProjectIntake: () => void;
    projectIntakePrompted: boolean;
    setProjectIntakePrompted: (prompted: boolean) => void;
    userConstraints: string[];
    addUserConstraint: (constraint: string) => void;
    removeUserConstraint: (constraint: string) => void;

    // AI proposal mode
    proposalMode: boolean;
    setProposalMode: (enabled: boolean) => void;
    proposals: Record<string, AIPatchProposal>;
    createProposal: (proposal: Omit<AIPatchProposal, 'id' | 'createdAt' | 'status'>) => string;
    approveProposal: (proposalId: string) => void;
    rejectProposal: (proposalId: string) => void;

    // Session State
    goal: string;
    setGoal: (goal: string) => void;
    setSessionData: (data: SessionData) => void;
    resetSessionState: () => void;

    // Sectional Workspace State
    activeSection: string | null;
    setActiveSection: (sectionId: string | null) => void;

    // Thinking Mode State
    thinkingMode: ThinkingMode;
    setThinkingMode: (mode: ThinkingMode) => void;
}
export const useStore = create<AppState>()(
    persist(
        (set, get) => ({
            // Mind Map State
            nodes: [],
            edges: [],
            activeSection: null,
            setActiveSection: (sectionId) => set({ activeSection: sectionId }),

            // History State
            past: [],
            future: [],

            pushToHistory: () => {
                const { nodes, edges, past } = get();
                // Deep copy to prevent reference mutation issues
                const snapshot = {
                    nodes: JSON.parse(JSON.stringify(nodes)),
                    edges: JSON.parse(JSON.stringify(edges))
                };
                set({
                    past: [...past.slice(Math.max(0, past.length - MAX_HISTORY + 1)), snapshot],
                    future: [] // Clear future when creating new history
                });
            },

            clearHistory: () => set({ past: [], future: [] }),

            undo: () => {
                const { past, future, nodes, edges } = get();
                if (past.length === 0) return;

                const previous = past[past.length - 1];
                const newPast = past.slice(0, past.length - 1);

                const currentSnapshot = {
                    nodes: JSON.parse(JSON.stringify(nodes)),
                    edges: JSON.parse(JSON.stringify(edges))
                };

                set({
                    nodes: previous.nodes,
                    edges: previous.edges,
                    past: newPast,
                    future: [currentSnapshot, ...future]
                });
            },

            redo: () => {
                const { past, future, nodes, edges } = get();
                if (future.length === 0) return;

                const next = future[0];
                const newFuture = future.slice(1);

                const currentSnapshot = {
                    nodes: JSON.parse(JSON.stringify(nodes)),
                    edges: JSON.parse(JSON.stringify(edges))
                };

                set({
                    nodes: next.nodes,
                    edges: next.edges,
                    past: [...past, currentSnapshot],
                    future: newFuture
                });
            },

            onNodesChange: (changes: NodeChange[]) => {
                // Determine if this is a meaningful change that should be saved to history
                // (ignore selection or dimension updates that happen constantly)
                const isSignificantElementChange = changes.some(c =>
                    c.type === 'position' && !c.dragging || // Finished drag
                    c.type === 'remove' ||
                    c.type === 'add'
                );

                if (isSignificantElementChange) {
                    get().pushToHistory();
                }

                set({
                    nodes: applyNodeChanges(changes, get().nodes),
                });
            },

            onEdgesChange: (changes: EdgeChange[]) => {
                const isSignificant = changes.some(c => c.type === 'remove' || c.type === 'add');
                if (isSignificant) get().pushToHistory();

                set({
                    edges: applyEdgeChanges(changes, get().edges),
                });
            },

            onConnect: (connection: Connection) => {
                get().pushToHistory();
                set({
                    edges: addEdge(connection, get().edges),
                });
            },

            addNode: (label: string, parentId?: string, type = 'expandable', description?: string, imageUrl?: string, nodeClass = 'idea') => {
                get().pushToHistory();
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
                    data: { label, description, imageUrl, nodeClass }, // V55: Store class
                    type,
                };

                set((state) => {
                    const newNodes = [...state.nodes, newNode];
                    let newEdges = state.edges;

                    // Only add edge if we have a valid parent
                    if (effectiveParentId) {
                        newEdges = [
                            ...state.edges,
                            { id: uuidv4(), source: effectiveParentId, target: id },
                        ];
                    } else {
                        // Optimization: If no parent (first node), center it
                        newNode.position = { x: 0, y: 0 };
                    }

                    return { nodes: newNodes, edges: newEdges };
                });
            },

            duplicateNode: (id: string) => {
                get().pushToHistory();
                const nodes = get().nodes;
                const nodeToDuplicate = nodes.find(n => n.id === id);
                if (!nodeToDuplicate) return;

                const newId = uuidv4();
                const newNode: Node = {
                    ...nodeToDuplicate,
                    id: newId,
                    position: { x: nodeToDuplicate.position.x + 50, y: nodeToDuplicate.position.y + 50 },
                };

                // V43: Deep copy data to avoid ref sharing mutations
                newNode.data = JSON.parse(JSON.stringify(nodeToDuplicate.data));

                set((state) => ({
                    nodes: [...state.nodes, newNode],
                    // We DO NOT duplicate the edges for now to keep it simple and detached
                }));
            },

            deleteNode: (id: string) => {
                get().pushToHistory();
                set((state) => ({
                    nodes: state.nodes.filter((node) => node.id !== id),
                    edges: state.edges.filter((edge) => edge.source !== id && edge.target !== id),
                }));
            },

            setNodes: (nodes: Node[]) => set({ nodes }),
            setEdges: (edges: Edge[]) => set({ edges }),
            reconnectEdge: (edgeId: string, source: string, target: string) => {
                get().pushToHistory();
                set((state) => ({
                    edges: state.edges.map((edge) =>
                        edge.id === edgeId
                            ? { ...edge, source, target }
                            : edge
                    ),
                }));
            },
            removeEdge: (edgeId: string) => {
                get().pushToHistory();
                set((state) => ({
                    edges: state.edges.filter((edge) => edge.id !== edgeId),
                }));
            },

            updateNodeContent: (id: string, label: string, description: string) => {
                get().pushToHistory();
                set((state) => ({
                    nodes: state.nodes.map((n) =>
                        n.id === id
                            ? { ...n, data: { ...n.data, label, description } }
                            : n
                    ),
                }));
            },

            updateNodeItems: (id: string, items: { id: string; text: string; completed: boolean }[]) => {
                get().pushToHistory();
                set((state) => ({
                    nodes: state.nodes.map((n) =>
                        n.id === id
                            ? { ...n, data: { ...n.data, items } }
                            : n
                    ),
                }));
            },

            updateNodeMetrics: (id: string, metrics: NodeMetricData) => {
                get().pushToHistory();
                set((state) => ({
                    nodes: state.nodes.map((n) =>
                        n.id === id
                            ? {
                                ...n,
                                data: {
                                    ...n.data,
                                    metrics,
                                    currentValue: metrics.currentValue,
                                    targetValue: metrics.targetValue,
                                    unit: metrics.unit,
                                },
                            }
                            : n
                    ),
                }));
            },

            updateNodeQuestion: (id: string, answer: string, isAnswered: boolean) => {
                get().pushToHistory();
                set((state) => ({
                    nodes: state.nodes.map((n) =>
                        n.id === id
                            ? {
                                ...n,
                                data: {
                                    ...n.data,
                                    answer,
                                    isAnswered,
                                },
                            }
                            : n
                    ),
                }));
            },

            // V38: COMPREHENSIVE NODE HANDLING
            // - Detects duplicates by label
            // - Handles nodeUpdates for enriching existing descriptions
            // - Auto-connects orphaned nodes to root
            // - Always updates descriptions when AI provides new context
            setMindMapFromJSON: (mapData) => {
                if (!mapData || !mapData.nodes) return;
                get().pushToHistory();

                const currentNodes = get().nodes;
                const currentEdges = get().edges;
                const activeSection = get().activeSection;

                const scopedNodeIds = new Set<string>();
                if (activeSection) {
                    const queue = [activeSection];
                    while (queue.length > 0) {
                        const current = queue.shift()!;
                        if (scopedNodeIds.has(current)) continue;
                        scopedNodeIds.add(current);
                        const children = currentEdges
                            .filter((edge) => edge.source === current)
                            .map((edge) => edge.target);
                        queue.push(...children);
                    }
                }

                // Create lookup maps for existing nodes
                const existingNodeById = new Map(currentNodes.map(n => [n.id, n]));
                const existingNodeByLabel = new Map(
                    currentNodes.map(n => [String(n.data.label || '').toLowerCase().trim(), n])
                );

                const updatedNodes: Node[] = [];
                const newNodes: Node[] = [];
                const idMapping: Map<string, string> = new Map();
                const sanitizeDescription = (label: string, description?: string) => {
                    const raw = String(description || '').trim().replace(/^['"`]|['"`]$/g, '').trim();
                    if (!raw) return '';
                    if (/^[A-Z]?\d{1,4}$/i.test(raw) || /^T\d{1,4}$/i.test(raw) || raw.length < 4) {
                        return `Key detail for ${label}.`;
                    }
                    return raw;
                };

                // V38: Process nodeUpdates FIRST to update existing descriptions
                if (mapData.nodeUpdates && Array.isArray(mapData.nodeUpdates)) {
                    mapData.nodeUpdates.forEach((update: AINodeUpdateData) => {
                        const existingNode = existingNodeById.get(update.id);
                        if (existingNode && update.description) {
                            updatedNodes.push({
                                ...existingNode,
                                data: {
                                    ...existingNode.data,
                                    description: sanitizeDescription(String(existingNode.data.label || ''), update.description),
                                }
                            });
                        }
                    });
                }

                mapData.nodes.forEach((n: AINodeData) => {
                    const normalizedLabel = String(n.label || '').toLowerCase().trim();

                    // Skip nodes with empty labels
                    if (!normalizedLabel) return;

                    // Check if node already exists
                    const existingById = existingNodeById.get(n.id);
                    const existingByLabel = existingNodeByLabel.get(normalizedLabel);
                    const canReuseByLabel = !!existingByLabel && (
                        !activeSection ||
                        scopedNodeIds.has(existingByLabel.id) ||
                        existingByLabel.data.nodeClass === 'goal' ||
                        existingByLabel.type === 'section'
                    );

                    if (existingById) {
                        updatedNodes.push({
                            ...existingById,
                            data: {
                                ...existingById.data,
                                label: n.label || existingById.data.label,
                                description: sanitizeDescription(String(n.label || existingById.data.label || ''), n.description) || existingById.data.description,
                                nodeClass: n.nodeClass || existingById.data.nodeClass || 'goal',
                                ...(n.items ? { items: n.items } : {}),
                                ...(Array.isArray(n.decisionOptions) ? { decisionOptions: n.decisionOptions } : {}),
                                ...(typeof n.chosenOption === 'string' ? { chosenOption: n.chosenOption } : {}),
                                ...(typeof n.decisionConfidence === 'number' ? { decisionConfidence: n.decisionConfidence } : {}),
                                ...(Array.isArray(n.tradeoffItems) ? { tradeoffItems: n.tradeoffItems } : {}),
                                ...(typeof n.currentValue === 'number' ? { currentValue: n.currentValue } : {}),
                                ...(typeof n.targetValue === 'number' ? { targetValue: n.targetValue } : {}),
                                ...(typeof n.unit === 'string' ? { unit: n.unit } : {}),
                                ...(typeof n.answer === 'string' ? { answer: n.answer } : {}),
                                ...(typeof n.isAnswered === 'boolean' ? { isAnswered: n.isAnswered } : {}),
                            }
                        });
                        idMapping.set(n.id, existingById.id);
                    } else if (canReuseByLabel && existingByLabel) {
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
                                        description: sanitizeDescription(String(n.label || existingByLabel.data.label || ''), n.description),
                                        // Update class if AI provides a clearer one?
                                        ...(n.nodeClass ? { nodeClass: n.nodeClass } : {}) // Update class if provided
                                    }
                                });
                            }
                        }
                    } else {
                        // Genuinely new node: create with unique ID
                        const newId = uuidv4();
                        idMapping.set(n.id, newId);

                        // Use AI-specified node type, default to 'expandable'
                        // CRITICAL: If nodeClass is 'section', always use type 'section'
                        const validNodeTypes = ['expandable', 'question', 'checklist', 'metric', 'section', 'image', 'decision', 'tradeoff'];
                        const nodeText = `${String(n.label || '')} ${String(n.description || '')}`.toLowerCase();
                        const inferredType =
                            n.nodeClass === 'section' ? 'section'
                                : n.nodeClass === 'metric' ? 'metric'
                                    : /\b(decide|decision|choose|option)\b/.test(nodeText) ? 'decision'
                                        : /\b(trade[- ]?off|impact|effort|prioriti[sz]e|rank|matrix)\b/.test(nodeText) ? 'tradeoff'
                                    : n.nodeClass === 'task' ? 'checklist'
                                        : 'expandable';
                        let nodeType = (n.nodeType && validNodeTypes.includes(n.nodeType)) ? n.nodeType : inferredType;
                        if (n.nodeClass === 'section') {
                            nodeType = 'section'; // Force section class to use SectionNode component
                        }
                        const checklistItems = nodeType === 'checklist'
                            ? (n.items && n.items.length > 0 ? n.items : buildChecklistItems())
                            : n.items;

                        newNodes.push({
                            id: newId,
                            position: { x: Math.random() * 600, y: Math.random() * 400 },
                            data: {
                                label: n.label,
                                description: sanitizeDescription(String(n.label || ''), n.description),
                                imageUrl: n.imageUrl,
                                nodeClass: n.nodeClass || 'idea',
                                ...(checklistItems ? { items: checklistItems } : {}),
                                ...(Array.isArray(n.decisionOptions) ? { decisionOptions: n.decisionOptions } : {}),
                                ...(typeof n.chosenOption === 'string' ? { chosenOption: n.chosenOption } : {}),
                                ...(typeof n.decisionConfidence === 'number' ? { decisionConfidence: n.decisionConfidence } : {}),
                                ...(Array.isArray(n.tradeoffItems) ? { tradeoffItems: n.tradeoffItems } : {}),
                                ...(typeof n.currentValue === 'number' ? { currentValue: n.currentValue } : {}),
                                ...(typeof n.targetValue === 'number' ? { targetValue: n.targetValue } : {}),
                                ...(typeof n.unit === 'string' ? { unit: n.unit } : {}),
                                ...(typeof n.answer === 'string' ? { answer: n.answer } : {}),
                                ...(typeof n.isAnswered === 'boolean' ? { isAnswered: n.isAnswered } : {}),
                            },
                            type: nodeType,
                        });

                        // Add to label map to prevent duplicates within same response
                        existingNodeByLabel.set(normalizedLabel, {
                            id: newId,
                            position: { x: 0, y: 0 },
                            data: { label: n.label, description: n.description, nodeClass: n.nodeClass }
                        } as Node);
                    }
                });

                // Build final node list
                const updatedNodeIds = new Set(updatedNodes.map(n => n.id));
                const unchangedNodes = currentNodes.filter(n => !updatedNodeIds.has(n.id));
                const mergedNodes = [...unchangedNodes, ...updatedNodes, ...newNodes];
                const allNodeIds = new Set(mergedNodes.map(n => n.id));
                const rootNode = mergedNodes.find((n) => n.data.nodeClass === 'goal') || mergedNodes[0];
                const sectionFallbackParentId = activeSection && allNodeIds.has(activeSection) ? activeSection : rootNode?.id;
                const sectionNodes = mergedNodes.filter((node) => node.data.nodeClass === 'section' || node.type === 'section');

                const STOP_WORDS = new Set([
                    'the', 'and', 'for', 'with', 'from', 'into', 'your', 'this', 'that', 'plan',
                    'work', 'project', 'goal', 'section', 'task', 'node', 'idea', 'build', 'create'
                ]);
                const tokenize = (value?: string): string[] =>
                    String(value || '')
                        .toLowerCase()
                        .split(/[^a-z0-9]+/)
                        .map((token) => token.trim())
                        .filter((token) => token.length > 2 && !STOP_WORDS.has(token));

                const classRank: Record<string, number> = {
                    goal: 0,
                    section: 1,
                    subgoal: 2,
                    task: 3,
                    resource: 4,
                    constraint: 4,
                    metric: 4,
                    idea: 5
                };

                const getNodeClass = (node?: Node): string =>
                    String(node?.data?.nodeClass || '').toLowerCase();

                function buildChecklistItems() {
                    return [
                        { id: `item-${Date.now()}-0`, text: 'Define scope', completed: false },
                        { id: `item-${Date.now()}-1`, text: 'Execute core steps', completed: false },
                        { id: `item-${Date.now()}-2`, text: 'Review outcomes', completed: false },
                    ];
                }

                const chooseBestSectionParent = (targetNode?: Node): string | undefined => {
                    if (sectionNodes.length === 0) return undefined;
                    if (!targetNode) return sectionNodes[0]?.id;

                    if (getNodeClass(targetNode) === 'section') {
                        return rootNode?.id;
                    }

                    const targetTokens = new Set([
                        ...tokenize(String(targetNode.data.label || '')),
                        ...tokenize(String(targetNode.data.description || ''))
                    ]);

                    let bestSectionId: string | undefined;
                    let bestScore = 0;

                    sectionNodes.forEach((sectionNode) => {
                        const sectionLabel = String(sectionNode.data.label || '');
                        const sectionTokens = tokenize(`${sectionLabel} ${String(sectionNode.data.description || '')}`);
                        let score = 0;

                        for (const token of sectionTokens) {
                            if (targetTokens.has(token)) score += 1;
                        }

                        const normalizedSectionLabel = sectionLabel.toLowerCase().trim();
                        const normalizedTargetLabel = String(targetNode.data.label || '').toLowerCase();
                        if (normalizedSectionLabel && normalizedTargetLabel.includes(normalizedSectionLabel)) {
                            score += 3;
                        }

                        if (score > bestScore) {
                            bestScore = score;
                            bestSectionId = sectionNode.id;
                        }
                    });

                    if (bestSectionId && bestScore > 0) return bestSectionId;

                    // Fall back to least-loaded section for better distribution.
                    const leastLoadedSection = [...sectionNodes].sort((a, b) => {
                        const loadA = currentEdges.filter((edge) => edge.source === a.id).length;
                        const loadB = currentEdges.filter((edge) => edge.source === b.id).length;
                        return loadA - loadB;
                    })[0];

                    return leastLoadedSection?.id;
                };

                const chooseBestNestedParent = (sectionId: string, targetNode?: Node): string | undefined => {
                    if (!targetNode) return undefined;
                    const targetClass = getNodeClass(targetNode);
                    if (targetClass === 'section' || targetClass === 'goal') return undefined;

                    const directChildren = currentEdges
                        .filter((edge) => edge.source === sectionId)
                        .map((edge) => mergedNodes.find((node) => node.id === edge.target))
                        .filter((node): node is Node => !!node);

                    if (directChildren.length === 0) return undefined;

                    const targetTokens = new Set([
                        ...tokenize(String(targetNode.data.label || '')),
                        ...tokenize(String(targetNode.data.description || ''))
                    ]);

                    let bestId: string | undefined;
                    let bestScore = 0;

                    directChildren.forEach((candidate) => {
                        const candidateClass = getNodeClass(candidate);
                        if (candidateClass === 'goal' || candidateClass === 'section') return;

                        let classScore = 0;
                        if (targetClass === 'task' && (candidateClass === 'subgoal' || candidateClass === 'idea')) classScore += 2;
                        if ((targetClass === 'resource' || targetClass === 'constraint' || targetClass === 'metric') &&
                            (candidateClass === 'task' || candidateClass === 'subgoal')) classScore += 2;
                        if (targetClass === 'idea' && candidateClass === 'task') classScore += 1;

                        const candidateTokens = tokenize(`${String(candidate.data.label || '')} ${String(candidate.data.description || '')}`);
                        let overlap = 0;
                        for (const token of candidateTokens) {
                            if (targetTokens.has(token)) overlap += 1;
                        }

                        const score = classScore + overlap;
                        if (score > bestScore) {
                            bestScore = score;
                            bestId = candidate.id;
                        }
                    });

                    return bestScore >= 2 ? bestId : undefined;
                };

                const isLikelyReversedEdge = (sourceNode?: Node, targetNode?: Node): boolean => {
                    if (!sourceNode || !targetNode) return false;
                    const sourceClass = getNodeClass(sourceNode);
                    const targetClass = getNodeClass(targetNode);

                    if ((targetClass === 'section' || targetClass === 'goal') && sourceClass !== 'section' && sourceClass !== 'goal') {
                        return true;
                    }

                    const sourceRank = classRank[sourceClass] ?? 99;
                    const targetRank = classRank[targetClass] ?? 99;
                    return sourceRank > targetRank + 1 && (targetClass === 'goal' || targetClass === 'section' || targetClass === 'subgoal');
                };

                // V38: Process edges with ID remapping AND auto-connect orphans
                const existingEdgeKeys = new Set(currentEdges.map(e => `${e.source}__${e.target}`));
                const seenEdgeKeys = new Set(existingEdgeKeys);
                const newNodesNeedingEdges = new Set(newNodes.map(n => n.id));

                const newEdgesFromAI: Edge[] = (mapData.edges || [])
                    .map((e: AIEdgeData) => {
                        let sourceId = idMapping.get(e.source) || e.source;
                        let targetId = idMapping.get(e.target) || e.target;
                        let sourceNode = mergedNodes.find((node) => node.id === sourceId);
                        let targetNode = mergedNodes.find((node) => node.id === targetId);

                        if (isLikelyReversedEdge(sourceNode, targetNode)) {
                            const swappedSource = targetId;
                            targetId = sourceId;
                            sourceId = swappedSource;
                            sourceNode = mergedNodes.find((node) => node.id === sourceId);
                            targetNode = mergedNodes.find((node) => node.id === targetId);
                        }

                        // In section mode, unknown sources should attach to the active section.
                        if (!allNodeIds.has(sourceId)) {
                            if (activeSection && sectionFallbackParentId) {
                                sourceId = sectionFallbackParentId;
                            } else if (targetNode && getNodeClass(targetNode) !== 'section') {
                                sourceId = chooseBestSectionParent(targetNode) || sectionFallbackParentId || 'root';
                            } else {
                                sourceId = sectionFallbackParentId || 'root';
                            }
                        }

                        sourceNode = mergedNodes.find((node) => node.id === sourceId);
                        targetNode = mergedNodes.find((node) => node.id === targetId);

                        // In overview mode, keep non-section work under sections instead of directly under goal.
                        if (!activeSection && sectionNodes.length > 0 && targetNode && getNodeClass(targetNode) !== 'section') {
                            const sourceIsGoal = !!sourceNode && (sourceNode.id === rootNode?.id || getNodeClass(sourceNode) === 'goal');
                            if (sourceIsGoal) {
                                sourceId = chooseBestSectionParent(targetNode) || sourceId;
                            }
                        }

                        if (sourceNode && getNodeClass(sourceNode) === 'section' && targetNode) {
                            const nestedParent = chooseBestNestedParent(sourceNode.id, targetNode);
                            if (nestedParent) {
                                sourceId = nestedParent;
                            }
                        }

                        // Mark this new node as having an edge
                        newNodesNeedingEdges.delete(targetId);

                        return { source: sourceId, target: targetId };
                    })
                    .filter((e: AIEdgeData) => {
                        const key = `${e.source}__${e.target}`;
                        // Only add edge if both nodes exist and not already emitted.
                        if (!allNodeIds.has(e.source) || !allNodeIds.has(e.target) || seenEdgeKeys.has(key)) {
                            return false;
                        }
                        seenEdgeKeys.add(key);
                        return true;
                    })
                    .map((e: AIEdgeData) => ({
                        id: uuidv4(),
                        source: e.source,
                        target: e.target,
                    }));

                const orphanEdges: Edge[] = [];
                if (sectionFallbackParentId || sectionNodes.length > 0) {
                    newNodesNeedingEdges.forEach(orphanId => {
                        const orphanNode = mergedNodes.find((node) => node.id === orphanId);
                        const orphanParent = activeSection
                            ? sectionFallbackParentId
                            : chooseBestSectionParent(orphanNode) || sectionFallbackParentId;
                        if (!orphanParent) return;

                        const key = `${orphanParent}__${orphanId}`;
                        if (!seenEdgeKeys.has(key)) {
                            orphanEdges.push({
                                id: uuidv4(),
                                source: orphanParent,
                                target: orphanId,
                            });
                            seenEdgeKeys.add(key);
                        }
                    });
                }

                const mergedEdges = [...currentEdges, ...newEdgesFromAI, ...orphanEdges];

                set({ nodes: mergedNodes, edges: mergedEdges });
            },

            getMindMapAsJSON: () => {
                const state = get();
                const simplifiedNodes = state.nodes.map(n => ({
                    id: n.id,
                    type: n.type || 'expandable',
                    data: {
                        label: n.data.label,
                        description: n.data.description,
                        nodeClass: n.data.nodeClass,
                    },
                }));
                const simplifiedEdges = state.edges.map(e => ({
                    source: e.source,
                    target: e.target,
                }));
                return JSON.stringify({ nodes: simplifiedNodes, edges: simplifiedEdges });
            },

            getScopedMindMapAsJSON: () => {
                const state = get();
                return get().getScopedMindMapAsJSONForSection(state.activeSection);
            },

            getScopedMindMapAsJSONForSection: (sectionId) => {
                const state = get();
                const activeSection = sectionId;

                let visibleNodes = state.nodes;
                let visibleEdges = state.edges;

                if (activeSection) {
                    // Section mode: target subtree plus lightweight global section headers for coherence.
                    const sectionDescendantIds = new Set<string>();
                    const adjacency = new Map<string, string[]>();
                    const nodeById = new Map(state.nodes.map((node) => [node.id, node]));
                    state.edges.forEach((edge) => {
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
                            const childNode = nodeById.get(child);
                            const isGoal = childNode?.data.nodeClass === 'goal';
                            const isOtherSection = (childNode?.data.nodeClass === 'section' || childNode?.type === 'section') && child !== activeSection;
                            if (!isGoal && !isOtherSection && !sectionDescendantIds.has(child)) {
                                queue.push(child);
                            }
                        }
                    }

                    const sectionNodeIds = state.nodes
                        .filter((n) => n.data.nodeClass === 'section' || n.type === 'section')
                        .map((n) => n.id);

                    const visibleNodeIds = new Set<string>([
                        ...sectionDescendantIds,
                        ...sectionNodeIds,
                        ...state.nodes.filter((n) => n.data.nodeClass === 'goal').map((n) => n.id)
                    ]);

                    visibleNodes = state.nodes.filter((n) => visibleNodeIds.has(n.id));
                    visibleEdges = state.edges.filter((e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target));
                } else {
                    // Overview Mode: Root and top-level sections
                    const sectionNodeIds = state.nodes.filter(n => n.data.nodeClass === 'section' || n.type === 'section').map(n => n.id);
                    visibleNodes = state.nodes.filter(n =>
                        n.data.nodeClass === 'goal' || sectionNodeIds.includes(n.id)
                    );
                    visibleEdges = state.edges.filter(e =>
                        visibleNodes.some(n => n.id === e.source) && visibleNodes.some(n => n.id === e.target)
                    );
                }

                const simplifiedNodes = visibleNodes.map(n => ({
                    id: n.id,
                    type: n.type || 'expandable',
                    data: {
                        label: n.data.label,
                        description: n.data.description,
                        nodeClass: n.data.nodeClass,
                    },
                }));
                const simplifiedEdges = visibleEdges.map(e => ({
                    source: e.source,
                    target: e.target,
                }));
                return JSON.stringify({ nodes: simplifiedNodes, edges: simplifiedEdges });
            },

            messages: [],

            addMessage: (role, content, options, metadata) => {
                const newMessage: Message = {
                    id: uuidv4(),
                    role,
                    content,
                    timestamp: Date.now(),
                    options,
                    metadata,
                };
                set((state) => ({ messages: [...state.messages, newMessage] }));
            },

            setMessages: (messages) => set({ messages }),

            getMessagesForAI: () => {
                return get().messages.map(m => ({ role: m.role, content: m.content }));
            },

            clearChat: () => {
                set({ messages: [] });
            },

            sectionBriefs: {},
            setSectionBrief: (sectionId, brief) => set((state) => ({
                sectionBriefs: {
                    ...state.sectionBriefs,
                    [sectionId]: {
                        sectionId,
                        ...brief,
                        updatedAt: Date.now(),
                    }
                },
                sectionBriefDismissed: {
                    ...state.sectionBriefDismissed,
                    [sectionId]: false,
                },
            })),
            clearSectionBrief: (sectionId) => set((state) => {
                const next = { ...state.sectionBriefs };
                delete next[sectionId];
                return { sectionBriefs: next };
            }),
            sectionBriefDraftFor: null,
            openSectionBriefDraft: (sectionId) => set({ sectionBriefDraftFor: sectionId }),
            closeSectionBriefDraft: () => set({ sectionBriefDraftFor: null }),
            sectionBriefDismissed: {},
            setSectionBriefDismissed: (sectionId, dismissed) => set((state) => ({
                sectionBriefDismissed: {
                    ...state.sectionBriefDismissed,
                    [sectionId]: dismissed,
                }
            })),
            sectionLoadingIds: {},
            setSectionLoading: (sectionId, loading) => set((state) => {
                const next = { ...state.sectionLoadingIds };
                if (loading) {
                    next[sectionId] = true;
                } else {
                    delete next[sectionId];
                }
                return { sectionLoadingIds: next };
            }),
            clearSectionLoading: () => set({ sectionLoadingIds: {} }),
            projectIntake: null,
            setProjectIntake: (intake) => set({
                projectIntake: {
                    ...intake,
                    updatedAt: Date.now(),
                }
            }),
            clearProjectIntake: () => set({ projectIntake: null }),
            projectIntakePrompted: false,
            setProjectIntakePrompted: (prompted) => set({ projectIntakePrompted: prompted }),
            userConstraints: [],
            addUserConstraint: (constraint) => {
                const normalized = constraint.trim();
                if (!normalized) return;
                set((state) => {
                    if (state.userConstraints.some((item) => item.toLowerCase() === normalized.toLowerCase())) {
                        return state;
                    }
                    return { userConstraints: [...state.userConstraints, normalized] };
                });
            },
            removeUserConstraint: (constraint) => set((state) => ({
                userConstraints: state.userConstraints.filter(
                    (item) => item.toLowerCase() !== constraint.trim().toLowerCase()
                )
            })),

            proposalMode: true,
            setProposalMode: (enabled) => set({ proposalMode: enabled }),
            proposals: {},
            createProposal: (proposal) => {
                const id = uuidv4();
                set((state) => ({
                    proposals: {
                        ...state.proposals,
                        [id]: {
                            id,
                            createdAt: Date.now(),
                            status: 'pending',
                            ...proposal,
                        }
                    }
                }));
                return id;
            },
            approveProposal: (proposalId) => {
                const proposal = get().proposals[proposalId];
                if (!proposal || proposal.status !== 'pending') return;
                get().setMindMapFromJSON(proposal.mapData);
                set((state) => ({
                    proposals: {
                        ...state.proposals,
                        [proposalId]: { ...proposal, status: 'approved' }
                    }
                }));
            },
            rejectProposal: (proposalId) => {
                const proposal = get().proposals[proposalId];
                if (!proposal || proposal.status !== 'pending') return;
                set((state) => ({
                    proposals: {
                        ...state.proposals,
                        [proposalId]: { ...proposal, status: 'rejected' }
                    }
                }));
            },

            goal: '',

            setGoal: (goal) => set({ goal }),
            setSessionData: (data) => set((state) => {
                const nextNodes = data.nodes || [];
                const preservedActiveSection = state.activeSection && nextNodes.some((n) => n.id === state.activeSection)
                    ? state.activeSection
                    : null;

                return {
                    goal: data.goal || '',
                    messages: data.messages || [],
                    nodes: nextNodes,
                    edges: data.edges || [],
                    activeSection: preservedActiveSection,
                    sectionBriefDraftFor: null,
                    proposals: {},
                    sectionBriefs: data.sectionBriefs || {},
                    sectionBriefDismissed: data.sectionBriefDismissed || {},
                    sectionLoadingIds: state.sectionLoadingIds || {},
                    projectIntake: data.projectIntake || null,
                    projectIntakePrompted: data.projectIntakePrompted ?? false,
                    userConstraints: data.userConstraints || [],
                    proposalMode: data.proposalMode ?? state.proposalMode,
                };
            }),
            resetSessionState: () => set({
                goal: '',
                messages: [],
                nodes: [],
                edges: [],
                activeSection: null,
                sectionBriefs: {},
                sectionBriefDraftFor: null,
                sectionBriefDismissed: {},
                sectionLoadingIds: {},
                projectIntake: null,
                projectIntakePrompted: false,
                userConstraints: [],
                proposals: {},
                past: [],
                future: [],
            }),

            // Thinking Mode - default to explore
            thinkingMode: 'explore' as ThinkingMode,

            setThinkingMode: (mode) => set({ thinkingMode: mode }),
        }),
        {
            name: 'idea-ai-storage', // Key for local storage
            partialize: (state) => ({
                // Persist only global UI preference, not session data.
                thinkingMode: state.thinkingMode,
                proposalMode: state.proposalMode,
            }),
        }
    )
);
