import { memo, useState } from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { ChevronDown, ChevronRight, Lightbulb, MoreVertical, Plus, Trash2, Copy } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@/lib/store';
import { aiService } from '@/services/ai';

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

    // AI Branching Logic (V23: Quick branch - uses simplified context)
    const handleAddBranch = async () => {
        setIsMenuOpen(false);
        try {
            // V23: Use the new signature with minimal context for quick branching
            const branchPrompt = `Break down "${data.label}" into 3 specific sub-tasks.`;
            const chatHistory = [{ role: 'user', content: branchPrompt }];

            // For branching, we just need current node context, not full map
            const response = await aiService.chat(
                data.label, // Use node label as "goal" for this micro-task
                chatHistory,
                '{"nodes":[],"edges":[]}' // Empty map context for branch generation
            );

            // Parse V23 response format
            try {
                const jsonMatch = response.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    // V23: Look for updatedMindMap.nodes
                    const nodesToAdd = parsed.updatedMindMap?.nodes || parsed.newNodes || [];
                    nodesToAdd.forEach((n: any) => {
                        if (n.id !== 'root') { // Skip root node from response
                            addNode(n.label, id, 'expandable', n.description, n.imageUrl);
                        }
                    });
                }
            } catch (e) {
                console.warn("Branch parse failed", e);
            }
        } catch (e) {
            console.error("Branch error:", e);
        }
    };

    return (
        <div className="shadow-xl rounded-xl bg-zinc-900 border border-zinc-700 w-[280px] overflow-visible group hover:border-indigo-500 transition-colors relative">
            <Handle type="target" position={Position.Top} className="!bg-zinc-500 !w-2 !h-2" />

            {/* Optional Header Image */}
            {data.imageUrl && (
                <div className="h-32 w-full relative overflow-hidden rounded-t-xl group-hover:opacity-90 transition-opacity">
                    <img src={data.imageUrl} alt="" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/20 to-transparent" />
                </div>
            )}

            {/* Header */}
            <div
                className={`p-3 bg-zinc-800/80 backdrop-blur-md flex items-center justify-between cursor-pointer hover:bg-zinc-800 transition-colors ${!data.imageUrl ? 'rounded-t-xl' : ''}`}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-2 overflow-hidden">
                    <div className={`p-1.5 rounded-md shrink-0 ${isExpanded ? 'bg-indigo-600 text-white' : 'bg-zinc-700 text-zinc-400'}`}>
                        <Lightbulb size={14} />
                    </div>
                    <span className="font-semibold text-zinc-100 text-sm truncate">{data.label}</span>
                </div>
                <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                    <button className="text-zinc-500 hover:text-zinc-300 p-1" onClick={() => setIsExpanded(!isExpanded)}>
                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                    <button className="text-zinc-500 hover:text-zinc-300 p-1 relative" onClick={() => setIsMenuOpen(!isMenuOpen)}>
                        <MoreVertical size={16} />
                    </button>
                </div>
            </div>

            {/* Context Menu */}
            {isMenuOpen && (
                <div className="absolute right-0 top-10 z-50 w-40 bg-zinc-800 border border-zinc-700 rounded-lg shadow-2xl py-1 flex flex-col pointer-events-auto"
                    onClick={(e) => e.stopPropagation()}
                    onMouseLeave={() => setIsMenuOpen(false)}>
                    <button onClick={handleAddBranch} className="px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-700 text-left flex items-center gap-2">
                        <Plus size={12} /> Add Branch (AI)
                    </button>
                    <button onClick={() => { duplicateNode(id); setIsMenuOpen(false); }} className="px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-700 text-left flex items-center gap-2">
                        <Copy size={12} /> Copy Node
                    </button>
                    <div className="h-px bg-zinc-700 my-1" />
                    <button onClick={() => { deleteNode(id); setIsMenuOpen(false); }} className="px-3 py-2 text-xs text-red-400 hover:bg-zinc-700 text-left flex items-center gap-2">
                        <Trash2 size={12} /> Delete
                    </button>
                </div>
            )}

            {/* Expanded Content */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden bg-zinc-900 rounded-b-xl"
                    >
                        {/* Content */}
                        <div className="p-3 pt-0">
                            <div className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap min-h-[40px] resize-y overflow-auto max-h-[300px] hover:resize-y transition-colors scrollbar-thin scrollbar-thumb-zinc-600 scrollbar-track-transparent">
                                {data.description ? (
                                    <div className="text-zinc-300 font-mono">
                                        {data.description}
                                    </div>
                                ) : (
                                    <span className="text-zinc-500 italic text-xs">No description.</span>
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <Handle type="source" position={Position.Bottom} className="!bg-zinc-500 !w-2 !h-2" />
        </div>
    );
};

export default memo(ExpandableNode);
