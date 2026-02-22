'use client';

import { memo, useMemo, useState } from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { CheckCircle2, Circle, Plus, X } from 'lucide-react';
import { useStore } from '@/lib/store';

interface DecisionNodeData extends Record<string, unknown> {
    label: string;
    description?: string;
    decisionOptions?: string[];
    chosenOption?: string;
    decisionConfidence?: number;
}

const DecisionNode = ({ id, data }: NodeProps<Node<DecisionNodeData>>) => {
    const nodes = useStore((state) => state.nodes);
    const setNodes = useStore((state) => state.setNodes);
    const updateNodeContent = useStore((state) => state.updateNodeContent);
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [editTitle, setEditTitle] = useState(data.label);
    const [newOption, setNewOption] = useState('');

    const options = useMemo(() => {
        const raw = Array.isArray(data.decisionOptions) ? data.decisionOptions : [];
        return raw.filter((opt) => typeof opt === 'string' && opt.trim().length > 0);
    }, [data.decisionOptions]);

    const chosenOption = typeof data.chosenOption === 'string' ? data.chosenOption : '';
    const confidence = typeof data.decisionConfidence === 'number' ? data.decisionConfidence : 50;

    const patchNodeData = (patch: Partial<DecisionNodeData>) => {
        setNodes(
            nodes.map((node) =>
                node.id === id
                    ? {
                        ...node,
                        data: {
                            ...node.data,
                            ...patch,
                        },
                    }
                    : node
            )
        );
    };

    const handleSaveTitle = () => {
        updateNodeContent(id, editTitle.trim() || 'Untitled Decision', (data.description as string) || '');
        setIsEditingTitle(false);
    };

    const addOption = () => {
        const value = newOption.trim();
        if (!value) return;
        patchNodeData({ decisionOptions: [...options, value] });
        setNewOption('');
    };

    const removeOption = (value: string) => {
        const next = options.filter((option) => option !== value);
        patchNodeData({
            decisionOptions: next,
            chosenOption: chosenOption === value ? '' : chosenOption,
        });
    };

    const pickOption = (value: string) => {
        patchNodeData({ chosenOption: value });
    };

    return (
        <div className="plan-card group relative border-l-4 border-rose-500">
            <Handle type="target" position={Position.Top} className="opacity-0" />

            <div className="flex items-center justify-between mb-2 opacity-80">
                <div className="text-[10px] font-bold uppercase tracking-wider">decision</div>
                <div className="text-[10px] text-text-muted">{confidence}% confidence</div>
            </div>

            {isEditingTitle ? (
                <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="font-bold text-base w-full bg-black/5 border border-white/20 rounded px-1 outline-none text-white focus:border-rose-500 mb-2"
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
                >
                    {data.label}
                </h3>
            )}

            <div className="h-px bg-white/10 w-full mb-2 mt-1" />

            <div className="space-y-1.5">
                {options.map((option) => {
                    const selected = chosenOption === option;
                    return (
                        <div key={option} className="flex items-center gap-2 rounded-md p-1.5 bg-white/5">
                            <button
                                onClick={() => pickOption(option)}
                                className={`shrink-0 ${selected ? 'text-rose-400' : 'text-text-muted hover:text-white'}`}
                                title="Select winning option"
                            >
                                {selected ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                            </button>
                            <span className={`text-xs flex-1 ${selected ? 'text-white font-semibold' : 'text-zinc-200'}`}>{option}</span>
                            <button onClick={() => removeOption(option)} className="text-text-muted hover:text-red-400">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    );
                })}
            </div>

            <div className="mt-2 flex items-center gap-2 border border-white/10 rounded bg-white/5 px-2 py-1">
                <input
                    type="text"
                    value={newOption}
                    onChange={(e) => setNewOption(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addOption()}
                    placeholder="Add option"
                    className="flex-1 bg-transparent text-xs text-white focus:outline-none placeholder-text-muted/50"
                />
                <button onClick={addOption} className="text-rose-400 hover:text-rose-300">
                    <Plus className="w-3.5 h-3.5" />
                </button>
            </div>

            <Handle type="source" position={Position.Bottom} className="opacity-0" />
        </div>
    );
};

export default memo(DecisionNode);
