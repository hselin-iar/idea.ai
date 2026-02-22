'use client';

import { memo, useState } from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { useStore } from '@/lib/store';
import { Edit2 } from 'lucide-react';
import { motion } from 'framer-motion';

interface MetricNodeData extends Record<string, unknown> {
    label: string;
    description?: string;
    currentValue?: number;
    targetValue?: number;
    unit?: string;
    metrics?: {
        currentValue?: number;
        targetValue?: number;
        unit?: string;
    };
}

/**
 * MetricNode Component
 * 
 * A node type for tracking metrics with current/target values and progress visualization.
 */
const MetricNode = ({ id, data }: NodeProps<Node<MetricNodeData>>) => {
    const metricData = data.metrics || {};
    const currentValue = typeof data.currentValue === 'number' ? data.currentValue : (metricData.currentValue || 0);
    const targetValue = typeof data.targetValue === 'number' ? data.targetValue : (metricData.targetValue || 100);
    const unit = typeof data.unit === 'string' ? data.unit : (metricData.unit || '');

    const [isEditing, setIsEditing] = useState(false);
    const [editCurrent, setEditCurrent] = useState(currentValue.toString());
    const [editTarget, setEditTarget] = useState(targetValue.toString());
    const [editUnit, setEditUnit] = useState(unit);

    const updateNodeContent = useStore((state) => state.updateNodeContent);
    const updateNodeMetrics = useStore((state) => state.updateNodeMetrics);
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [editTitle, setEditTitle] = useState(data.label);

    const handleSaveTitle = () => {
        updateNodeContent(id, editTitle.trim() || 'Untitled Metric', (data.description as string) || '');
        setIsEditingTitle(false);
    };

    const progress = targetValue > 0 ? Math.min((currentValue / targetValue) * 100, 100) : 0;
    const isComplete = currentValue >= targetValue;

    const handleSave = () => {
        const newCurrent = parseFloat(editCurrent) || 0;
        const newTarget = parseFloat(editTarget) || 100;
        updateNodeMetrics(id, {
            currentValue: newCurrent,
            targetValue: newTarget,
            unit: editUnit.trim(),
        });
        setIsEditing(false);
    };

    const getProgressColor = () => {
        if (progress >= 100) return 'bg-emerald-500';
        if (progress >= 70) return 'bg-cyan-500';
        if (progress >= 40) return 'bg-amber-500';
        return 'bg-red-500';
    };

    const borderColorClass = isComplete ? 'border-emerald-500/30' : 'border-cyan-500/30';

    return (
        <div className={`plan-card group relative border-l-4 ${borderColorClass}`}>
            <Handle type="target" position={Position.Top} className="opacity-0" />

            {/* Header / Class Badge Row */}
            <div className="flex items-center justify-between mb-2 opacity-70">
                <div className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                    metric
                </div>

                <button
                    onClick={() => {
                        setEditCurrent(currentValue.toString());
                        setEditTarget(targetValue.toString());
                        setEditUnit(unit);
                        setIsEditing(!isEditing);
                    }}
                    className="p-1 px-2 rounded-full text-text-muted hover:text-white hover:bg-white/5 transition-colors opacity-0 group-hover:opacity-100"
                >
                    <Edit2 className="w-3 h-3" />
                </button>
            </div>

            {/* Title Area */}
            {isEditingTitle ? (
                <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="font-bold text-base w-full bg-black/5 dark:bg-white/5 border border-black/20 dark:border-white/20 rounded px-1 outline-none text-white focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 mb-2"
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
            <div className="h-px bg-white/10 w-full mb-3 mt-1" />

            {/* Content area: Metric Progress */}
            {isEditing ? (
                <div className="space-y-2 p-2 bg-white/5 rounded-lg animate-in fade-in zoom-in-95">
                    <div className="flex items-center gap-2">
                        <label className="text-xs font-medium text-text-muted w-14">Current</label>
                        <input
                            type="number"
                            value={editCurrent}
                            onChange={(e) => setEditCurrent(e.target.value)}
                            className="flex-1 bg-background rounded-md px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 border border-transparent focus:border-cyan-500/50"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="text-xs font-medium text-text-muted w-14">Target</label>
                        <input
                            type="number"
                            value={editTarget}
                            onChange={(e) => setEditTarget(e.target.value)}
                            className="flex-1 bg-background rounded-md px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 border border-transparent focus:border-cyan-500/50"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="text-xs font-medium text-text-muted w-14">Unit</label>
                        <input
                            type="text"
                            value={editUnit}
                            onChange={(e) => setEditUnit(e.target.value)}
                            className="flex-1 bg-background rounded-md px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 border border-transparent focus:border-cyan-500/50"
                        />
                    </div>
                    <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-white/5">
                        <button
                            onClick={() => setIsEditing(false)}
                            className="px-2 py-1 rounded text-xs text-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            className="px-2 py-1 rounded text-xs text-cyan-400 hover:text-cyan-300 hover:bg-cyan-400/10 transition-colors bg-cyan-500/10 border border-cyan-500/30"
                        >
                            Save
                        </button>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between w-full text-xs">
                        <span className="text-text-muted">Current:</span>
                        <span className="font-bold text-white">{currentValue.toLocaleString()} {unit}</span>
                    </div>
                    <div className="flex items-baseline justify-between w-full text-xs">
                        <span className="text-text-muted">Target:</span>
                        <span className="font-bold text-white">{targetValue.toLocaleString()} {unit}</span>
                    </div>

                    {/* Progress Bar */}
                    <div className="h-1.5 w-full bg-white/10 rounded-full mt-2 overflow-hidden">
                        <motion.div
                            className={`h-full ${getProgressColor()} rounded-full`}
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            transition={{ duration: 0.5, ease: 'easeOut' }}
                        />
                    </div>

                    <div className="flex items-center justify-between w-full text-[10px] mt-1 font-bold uppercase tracking-wider">
                        <span className="text-text-muted">Status:</span>
                        <span className={isComplete ? 'text-emerald-500' : 'text-cyan-400'}>
                            {isComplete ? '✅ Complete' : '🟡 In Progress'}
                        </span>
                    </div>
                </div>
            )}

            <Handle type="source" position={Position.Bottom} className="opacity-0" />
        </div>
    );
};

export default memo(MetricNode);
