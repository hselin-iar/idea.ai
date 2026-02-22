import React from 'react';
import { ChevronRight, ArrowLeft, Maximize, Sparkles } from 'lucide-react';
import { useStore } from '@/lib/store';

interface Props {
    isFullView: boolean;
    setIsFullView: (val: boolean) => void;
    onOptimizeSection: () => void;
    isOptimizingSection: boolean;
}

export default function SectionBreadcrumb({ isFullView, setIsFullView, onOptimizeSection, isOptimizingSection }: Props) {
    const goal = useStore((state) => state.goal);
    const activeSection = useStore((state) => state.activeSection);
    const setActiveSection = useStore((state) => state.setActiveSection);
    const nodes = useStore((state) => state.nodes);

    if (!goal) return null;

    const activeNode = activeSection ? nodes.find(n => n.id === activeSection) : null;

    return (
        <div className="absolute top-6 left-6 z-50 flex items-center gap-4">
            <div className="flex items-center gap-2 px-4 py-2 neumorphic-panel rounded-full text-sm font-medium border border-white/5 shadow-lg">
                <span
                    className={`cursor-pointer transition-colors ${activeSection ? 'text-text-muted hover:text-white' : 'text-white'}`}
                    onClick={() => setActiveSection(null)}
                >
                    Project Overview
                </span>

                {activeNode && (
                    <>
                        <ChevronRight size={14} className="text-text-muted" />
                        <span className="text-blue-400 font-bold">{String((activeNode.data as Record<string, unknown>).label)}</span>
                    </>
                )}
            </div>

            {activeSection && (
                <button
                    onClick={() => setActiveSection(null)}
                    className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-sm font-medium text-white transition-all shadow-lg"
                >
                    <ArrowLeft size={14} />
                    Back to Overview
                </button>
            )}

            {activeSection && (
                <button
                    onClick={onOptimizeSection}
                    disabled={isOptimizingSection}
                    className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all shadow-lg border bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 border-emerald-400/30 disabled:opacity-60"
                    title="Merge redundant nodes, improve node types, and compact this section"
                >
                    <Sparkles size={14} />
                    {isOptimizingSection ? 'Optimizing...' : 'Optimize Section'}
                </button>
            )}

            <button
                onClick={() => setIsFullView(!isFullView)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all shadow-lg border ${isFullView
                    ? 'bg-primary/20 text-primary border-primary/30'
                    : 'bg-white/5 hover:bg-white/10 text-text-muted hover:text-white border-white/10'
                    }`}
            >
                <Maximize size={14} />
                {isFullView ? 'Exit Full View' : 'Show All Nodes'}
            </button>
        </div>
    );
}
