'use client';

import { memo, useState } from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { useStore } from '@/lib/store';
import { Check, Plus, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ChecklistItem {
    id: string;
    text: string;
    completed: boolean;
}

interface ChecklistNodeData extends Record<string, unknown> {
    label: string;
    items?: ChecklistItem[];
}

/**
 * ChecklistNode Component
 * 
 * A node type for checklists with interactive checkable items.
 * Users can add, remove, and check off items.
 */
const ChecklistNode = ({ id, data }: NodeProps<Node<ChecklistNodeData>>) => {
    const items: ChecklistItem[] = Array.isArray(data.items) ? data.items : [];
    const [newItemText, setNewItemText] = useState('');

    const updateNodeContent = useStore((state) => state.updateNodeContent);
    const updateNodeItems = useStore((state) => state.updateNodeItems);
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [editTitle, setEditTitle] = useState(data.label);

    const handleSaveTitle = () => {
        updateNodeContent(id, editTitle.trim() || 'Untitled Checklist', (data.description as string) || '');
        setIsEditingTitle(false);
    };

    const toggleItem = (itemId: string) => {
        updateNodeItems(id, items.map(item =>
            item.id === itemId ? { ...item, completed: !item.completed } : item
        ));
    };

    const addItem = () => {
        if (!newItemText.trim()) return;
        updateNodeItems(id, [...items, {
            id: Date.now().toString(),
            text: newItemText.trim(),
            completed: false,
        }]);
        setNewItemText('');
    };

    const removeItem = (itemId: string) => {
        updateNodeItems(id, items.filter(item => item.id !== itemId));
    };

    const completedCount = items.filter(i => i.completed).length;

    return (
        <div className="plan-card group relative border-l-4 border-violet-500">
            <Handle type="target" position={Position.Top} className="opacity-0" />

            {/* Header / Class Badge Row */}
            <div className="flex items-center justify-between mb-2 opacity-70">
                <div className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                    checklist
                </div>

                <span className="text-[10px] font-medium text-text-muted bg-white/5 px-2 py-0.5 rounded-full">{completedCount}/{items.length}</span>
            </div>

            {/* Title Area */}
            {isEditingTitle ? (
                <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="font-bold text-base w-full bg-black/5 dark:bg-white/5 border border-black/20 dark:border-white/20 rounded px-1 outline-none text-white focus:border-violet-500 focus:ring-1 focus:ring-violet-500 mb-2"
                    autoFocus
                    onBlur={handleSaveTitle}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveTitle();
                        if (e.key === 'Escape') {
                            setEditTitle(data.label);
                            setIsEditingTitle(false);
                        }
                    }}
                />
            ) : (
                <h3
                    className="font-bold text-base leading-tight text-white select-none mb-2 cursor-pointer"
                    onDoubleClick={(e) => {
                        e.stopPropagation();
                        setEditTitle(data.label);
                        setIsEditingTitle(true);
                    }}
                    title="Double click to edit title"
                >
                    {data.label}
                </h3>
            )}

            {/* Divider */}
            <div className="h-px bg-white/10 w-full mb-2 mt-1" />

            <div className="w-full space-y-0.5">
                <AnimatePresence>
                    {items.map((item) => (
                        <motion.div
                            key={item.id}
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="flex items-center gap-2 p-1.5 rounded hover:bg-white/5 group/item transition-colors"
                        >
                            <button
                                onClick={() => toggleItem(item.id)}
                                className={`w-4 h-4 rounded-sm flex items-center justify-center transition-all duration-200 border ${item.completed
                                    ? 'bg-violet-500 border-violet-500 text-white shadow-sm'
                                    : 'bg-transparent border-white/30 hover:border-violet-400'
                                    }`}
                            >
                                {item.completed && <Check className="w-3 h-3" />}
                            </button>
                            <span className={`flex-1 text-xs transition-colors ${item.completed ? 'text-text-muted line-through' : 'text-white'
                                }`}>
                                {item.text}
                            </span>
                            <button
                                onClick={() => removeItem(item.id)}
                                className="opacity-0 group-hover/item:opacity-100 p-0.5 text-text-muted hover:text-red-400 transition-opacity"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {/* Add Item form */}
                {items.length < 7 ? (
                    <div className="flex items-center gap-2 p-1.5 mt-1 border border-white/10 rounded focus-within:border-violet-500/50 bg-white/5 transition-colors">
                        <Plus className="w-3 h-3 text-text-muted" />
                        <input
                            type="text"
                            value={newItemText}
                            onChange={(e) => setNewItemText(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && addItem()}
                            placeholder="Add step..."
                            className="flex-1 bg-transparent text-xs text-white focus:outline-none placeholder-text-muted/50"
                        />
                        {newItemText && (
                            <button
                                onClick={addItem}
                                className="text-[10px] font-bold text-violet-400 px-1 hover:text-violet-300 transition-colors"
                            >
                                ADD
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="text-[10px] text-text-muted italic text-center w-full mt-2">
                        List is full. Split into sub-tasks.
                    </div>
                )}
            </div>

            <Handle type="source" position={Position.Bottom} className="opacity-0" />
        </div>
    );
};

export default memo(ChecklistNode);
