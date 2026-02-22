import React from 'react';
import { Handle, NodeProps, Position, Node } from '@xyflow/react';
import { FolderOpen } from 'lucide-react';
import { useStore } from '@/lib/store';

interface SectionNodeData extends Record<string, unknown> {
    label: string;
    description?: string;
    nodeClass?: string;
}

export default function SectionNode({ data, id }: NodeProps<Node<SectionNodeData>>) {
    const setActiveSection = useStore((state) => state.setActiveSection);
    const openSectionBriefDraft = useStore((state) => state.openSectionBriefDraft);
    const setSectionBriefDismissed = useStore((state) => state.setSectionBriefDismissed);
    const sectionBriefs = useStore((state) => state.sectionBriefs);

    // Count all descendants for the badge
    const edges = useStore((state) => state.edges);
    const childCount = (() => {
        const visited = new Set<string>();
        const adjacency = new Map<string, string[]>();
        edges.forEach((edge) => {
            const children = adjacency.get(edge.source) || [];
            children.push(edge.target);
            adjacency.set(edge.source, children);
        });
        const queue = [id];
        while (queue.length > 0) {
            const current = queue.shift()!;
            const children = adjacency.get(current) || [];
            for (const child of children) {
                if (!visited.has(child)) {
                    visited.add(child);
                    queue.push(child);
                }
            }
        }
        return visited.size;
    })();

    return (
        <div
            onClick={() => {
                setActiveSection(id);
                if (!sectionBriefs[id]) {
                    openSectionBriefDraft(id);
                }
            }}
            className="group relative section-card cursor-pointer hover:shadow-lg transition-all flex flex-col h-full min-h-[140px]"
        >
            <Handle type="target" position={Position.Top} className="opacity-0" />

            <div className="flex-1">
                <div className="flex items-center justify-between mb-3 text-blue-400">
                    <div className="flex items-center gap-2 font-bold text-[11px] tracking-wider uppercase">
                        <FolderOpen size={14} />
                        Section
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="bg-white/5 px-2 py-0.5 rounded-full text-[10px] text-text-muted transition-colors font-medium">
                            {childCount} items
                        </div>
                        <button
                            onClick={(event) => {
                                event.stopPropagation();
                                setSectionBriefDismissed(id, false);
                                openSectionBriefDraft(id);
                            }}
                            className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-200 hover:bg-white/10"
                            title="Add section info"
                        >
                            Info
                        </button>
                    </div>
                </div>

                <h3 className="text-lg font-bold text-white mb-2 leading-tight">
                    {data.label}
                </h3>

                {data.description && (
                    <div className="text-xs text-text-muted mt-2 line-clamp-2">
                        {data.description}
                    </div>
                )}
            </div>

            {/* Persistent CTA at the bottom */}
            <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-blue-400 group-hover:text-blue-300 transition-colors">
                <span className="text-xs font-bold uppercase tracking-wider">Enter Section</span>
                <span className="material-symbols-outlined text-sm transform group-hover:translate-x-1 transition-transform">arrow_forward</span>
            </div>

            <Handle type="source" position={Position.Bottom} className="opacity-0" />
        </div>
    );
}
