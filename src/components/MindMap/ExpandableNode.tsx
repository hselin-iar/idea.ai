import { memo, useState } from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { ChevronDown, ChevronRight, Lightbulb, MoreVertical, Plus, Trash2, Copy } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@/lib/store';
import { aiService, ChatMessage, parseAIResponse, MindMapNode } from '@/services/ai';

interface ExpandableNodeData extends Record<string, unknown> {
    label: string;
    description?: string;
    imageUrl?: string;
}

const ExpandableNode = ({ id, data }: NodeProps<Node<ExpandableNodeData>>) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const deleteNode = useStore((state) => state.deleteNode);
    const duplicateNode = useStore((state) => state.duplicateNode);
    const addNode = useStore((state) => state.addNode);
    const updateNodeContent = useStore((state) => state.updateNodeContent);
    const goal = useStore((state) => state.goal);
    const getMessagesForAI = useStore((state) => state.getMessagesForAI);
    const thinkingMode = useStore((state) => state.thinkingMode);

    const [isEditing, setIsEditing] = useState(false);
    const [editLabel, setEditLabel] = useState(data.label);
    const [editDesc, setEditDesc] = useState(data.description || '');

    const handleSaveEdit = (e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        updateNodeContent(id, editLabel.trim() || 'Untitled Node', editDesc.trim());
        setIsEditing(false);
    };

    const handleCancelEdit = (e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        setEditLabel(data.label);
        setEditDesc(data.description || '');
        setIsEditing(false);
    };

    const handleDoubleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setEditLabel(data.label);
        setEditDesc(data.description || '');
        setIsEditing(true);
        if (!isExpanded && (data.nodeClass as string)?.toLowerCase() !== 'goal') {
            setIsExpanded(true);
        }
    };

    // AI Branching Logic (V23: Quick branch - uses simplified context)
    const handleAddBranch = async () => {
        setIsMenuOpen(false);
        try {
            const state = useStore.getState();
            const queue = [id];
            const scopedIds = new Set<string>([id]);

            while (queue.length > 0) {
                const current = queue.shift()!;
                const children = state.edges
                    .filter((edge) => edge.source === current)
                    .map((edge) => edge.target);
                for (const childId of children) {
                    if (!scopedIds.has(childId)) {
                        scopedIds.add(childId);
                        queue.push(childId);
                    }
                }
            }

            const rootNode = state.nodes.find((node) => node.data.nodeClass === 'goal');
            if (rootNode) scopedIds.add(rootNode.id);

            const scopedNodes = state.nodes
                .filter((node) => scopedIds.has(node.id))
                .map((node) => ({
                    id: node.id,
                    type: node.type || 'expandable',
                    data: {
                        label: node.data.label,
                        description: node.data.description,
                        nodeClass: node.data.nodeClass,
                    },
                }));
            const scopedEdges = state.edges
                .filter((edge) => scopedIds.has(edge.source) && scopedIds.has(edge.target))
                .map((edge) => ({ source: edge.source, target: edge.target }));
            const scopedContextJSON = JSON.stringify({ nodes: scopedNodes, edges: scopedEdges });

            const recentHistory = (getMessagesForAI() as ChatMessage[]).slice(-4);
            const branchPrompt = `Expand "${data.label}" by adding 3 concrete child nodes under this node. Keep nodes specific and implementation-ready.`;
            const chatHistory: ChatMessage[] = [...recentHistory, { role: 'user', content: branchPrompt }];

            const response = await aiService.chat(
                goal || data.label,
                chatHistory,
                scopedContextJSON,
                thinkingMode,
                undefined,
                { forceContextual: true }
            );

            const aiNodes: MindMapNode[] = useStore.getState().nodes.map((node) => ({
                id: node.id,
                label: String(node.data.label || ''),
                description: String(node.data.description || ''),
                nodeClass: ((node.data.nodeClass as MindMapNode['nodeClass']) || 'idea'),
                nodeType: (typeof node.type === 'string' ? node.type : 'expandable') as MindMapNode['nodeType'],
                items: Array.isArray(node.data.items) ? node.data.items as { id: string; text: string; completed: boolean }[] : undefined,
            }));

            const parsedData = parseAIResponse(
                response,
                goal || data.label,
                aiNodes,
                `branch_${Date.now()}`,
                id, // Parent ID for new nodes is the current node ID
                branchPrompt
            );

            if (!parsedData.redirectTo && parsedData.updatedMindMap && parsedData.updatedMindMap.nodes) {
                parsedData.updatedMindMap.nodes.forEach((n) => {
                    if (n.id !== 'root' && n.id !== id) {
                        addNode(n.label, id, n.nodeType || 'expandable', n.description, undefined, n.nodeClass);
                    }
                });
            }
        } catch (e) {
            console.error("Branch error:", e);
        }
    };

    const nodeClass = (data.nodeClass as string)?.toLowerCase() || 'idea';

    // Phase C: Class colors map to Left Border colors
    const colorClasses: Record<string, string> = {
        goal: 'border-l-4 border-emerald-500',
        subgoal: 'border-l-4 border-blue-500',
        section: 'border-l-4 border-blue-500',
        task: 'border-l-4 border-violet-500',
        resource: 'border-l-4 border-amber-500',
        constraint: 'border-l-4 border-red-500',
        metric: 'border-l-4 border-cyan-500',
        idea: 'border-l-4 border-zinc-500',
    };

    const activeColorClass = colorClasses[nodeClass] || colorClasses['idea'];

    const containerClasses = `plan-card group relative ${activeColorClass}`;

    return (
        <div className={containerClasses}>
            <Handle type="target" position={Position.Top} className="opacity-0" />

            {/* Header / Class Badge Row */}
            <div className="flex items-center justify-between mb-2 opacity-70">
                <div className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                    {nodeClass}
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="text-text-muted hover:text-primary p-1" onClick={(e) => { e.stopPropagation(); setIsMenuOpen(!isMenuOpen); }}>
                        <MoreVertical size={14} />
                    </button>
                    {(data.description || isEditing) && (
                        <button className="text-text-muted hover:text-primary p-1" onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}>
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                    )}
                </div>
            </div>

            {/* Context Menu */}
            {isMenuOpen && (
                <div className="absolute right-[-10px] top-8 z-50 w-40 glass rounded-xl shadow-xl py-1 flex flex-col pointer-events-auto text-left border border-white/5"
                    onClick={(e) => e.stopPropagation()}
                    onMouseLeave={() => setIsMenuOpen(false)}>
                    <button onClick={(e) => { handleDoubleClick(e); setIsMenuOpen(false); }} className="px-3 py-2 text-xs text-text-main dark:text-surface-light hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2">
                        <Lightbulb size={12} /> Edit Node
                    </button>
                    <button onClick={handleAddBranch} className="px-3 py-2 text-xs text-text-main dark:text-surface-light hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2">
                        <Plus size={12} /> Add Branch (AI)
                    </button>
                    <button onClick={() => { duplicateNode(id); setIsMenuOpen(false); }} className="px-3 py-2 text-xs text-text-main dark:text-surface-light hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2">
                        <Copy size={12} /> Copy Node
                    </button>
                    <div className="h-px bg-black/10 dark:bg-white/10 my-1" />
                    <button onClick={() => { deleteNode(id); setIsMenuOpen(false); }} className="px-3 py-2 text-xs text-red-500 hover:bg-red-500/10 transition-colors flex items-center gap-2">
                        <Trash2 size={12} /> Delete
                    </button>
                </div>
            )}

            {/* Main Content Area */}
            {isEditing ? (
                <div
                    className="flex flex-col gap-2 cursor-default"
                    onClick={(e) => e.stopPropagation()}
                >
                    <input
                        type="text"
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        className="font-bold text-base leading-tight w-full bg-black/5 dark:bg-white/5 border border-black/20 dark:border-white/20 rounded-lg px-2 py-1 outline-none text-white focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                        autoFocus
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit();
                            if (e.key === 'Escape') handleCancelEdit();
                        }}
                    />

                    <textarea
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        className="w-full mt-2 text-xs leading-relaxed bg-black/5 dark:bg-white/5 border border-black/20 dark:border-white/20 rounded-lg px-2 py-2 outline-none text-text-muted focus:border-primary transition-all resize-none min-h-[70px]"
                        placeholder="Add a detailed description..."
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSaveEdit();
                            if (e.key === 'Escape') handleCancelEdit();
                        }}
                    />

                    <div className="flex gap-2 mt-2 w-full justify-end">
                        <button onClick={handleCancelEdit} className="px-3 py-1 text-xs font-medium rounded-md bg-white/5 hover:bg-white/10 text-text-muted transition-colors">Cancel</button>
                        <button onClick={handleSaveEdit} className="px-3 py-1 text-xs font-medium rounded-md bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 transition-colors">Save</button>
                    </div>
                </div>
            ) : (
                <div
                    className="flex flex-col gap-1 cursor-pointer"
                    onClick={() => setIsExpanded(!isExpanded)}
                    onDoubleClick={handleDoubleClick}
                    title="Double click to edit"
                >
                    <h3 className="font-bold text-base leading-tight text-white select-none">
                        {data.label}
                    </h3>

                    {/* Expanded Description */}
                    <AnimatePresence>
                        {isExpanded && data.description && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden border-t border-white/10 mt-2 pt-2 cursor-pointer select-none"
                            >
                                <div className="text-text-muted text-xs leading-relaxed max-h-[150px] overflow-auto">
                                    {data.description}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}

            <Handle type="source" position={Position.Bottom} className="opacity-0" />
        </div>
    );
};

export default memo(ExpandableNode);
