'use client';

import { memo, useMemo } from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { useStore } from '@/lib/store';
import { Sparkles } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface TradeoffItem {
    id: string;
    label: string;
    impact: number;
    effort: number;
    risk: number;
    time: number;
}

interface TradeoffNodeData extends Record<string, unknown> {
    label: string;
    description?: string;
    tradeoffItems?: TradeoffItem[];
}

const clamp = (value: number) => Math.max(1, Math.min(5, Number.isFinite(value) ? value : 3));

const TradeoffNode = ({ id, data }: NodeProps<Node<TradeoffNodeData>>) => {
    const nodes = useStore((state) => state.nodes);
    const edges = useStore((state) => state.edges);
    const setNodes = useStore((state) => state.setNodes);
    const setEdges = useStore((state) => state.setEdges);
    const pushToHistory = useStore((state) => state.pushToHistory);

    const rows = useMemo(() => {
        const raw = Array.isArray(data.tradeoffItems) ? data.tradeoffItems : [];
        if (raw.length > 0) {
            return raw.map((row) => ({
                id: String(row.id),
                label: String(row.label || 'Option'),
                impact: clamp(Number(row.impact)),
                effort: clamp(Number(row.effort)),
                risk: clamp(Number(row.risk)),
                time: clamp(Number(row.time)),
            }));
        }
        return [
            { id: `${id}_a`, label: 'Low effort path', impact: 3, effort: 2, risk: 3, time: 2 },
            { id: `${id}_b`, label: 'Balanced path', impact: 4, effort: 3, risk: 2, time: 3 },
            { id: `${id}_c`, label: 'High impact path', impact: 5, effort: 4, risk: 3, time: 4 },
        ];
    }, [data.tradeoffItems, id]);

    const patchRows = (nextRows: TradeoffItem[]) => {
        setNodes(
            nodes.map((node) =>
                node.id === id
                    ? {
                        ...node,
                        data: {
                            ...node.data,
                            tradeoffItems: nextRows,
                        },
                    }
                    : node
            )
        );
    };

    const updateValue = (rowId: string, key: keyof Omit<TradeoffItem, 'id' | 'label'>, value: number) => {
        patchRows(
            rows.map((row) =>
                row.id === rowId
                    ? { ...row, [key]: clamp(value) }
                    : row
            )
        );
    };

    const scoredRows = useMemo(() => {
        return rows
            .map((row) => ({
                ...row,
                score: row.impact * 2 - row.effort - row.risk - row.time,
            }))
            .sort((a, b) => b.score - a.score);
    }, [rows]);

    const createApproachNodes = () => {
        const childEdges = edges.filter((edge) => edge.source === id);
        const childIds = new Set(childEdges.map((edge) => edge.target));
        const childLabels = new Set(
            nodes
                .filter((node) => childIds.has(node.id))
                .map((node) => String(node.data?.label || '').toLowerCase().trim())
        );
        const toCreate = scoredRows.filter((row) => !childLabels.has(row.label.toLowerCase().trim()));
        if (toCreate.length === 0) return;

        pushToHistory();

        const nextNodes = [...nodes];
        const nextEdges = [...edges];
        toCreate.forEach((row, index) => {
            const nodeId = uuidv4();
            const nodeType = row.score >= 3 ? 'checklist' : 'expandable';
            nextNodes.push({
                id: nodeId,
                type: nodeType,
                position: {
                    x: (nodes.find((node) => node.id === id)?.position.x || 0) + 280,
                    y: (nodes.find((node) => node.id === id)?.position.y || 0) + (index * 140) - ((toCreate.length - 1) * 70),
                },
                data: {
                    label: row.label,
                    description: `Execution path from tradeoff analysis. Score=${row.score} (impact ${row.impact}, effort ${row.effort}, risk ${row.risk}, time ${row.time}).`,
                    nodeClass: 'task',
                    ...(nodeType === 'checklist'
                        ? {
                            items: [
                                { id: `${nodeId}_1`, text: 'Define exact scope', completed: false },
                                { id: `${nodeId}_2`, text: 'Execute core steps', completed: false },
                                { id: `${nodeId}_3`, text: 'Measure result', completed: false },
                            ]
                        }
                        : {}),
                },
            });
            nextEdges.push({
                id: uuidv4(),
                source: id,
                target: nodeId,
            });
        });

        setNodes(nextNodes);
        setEdges(nextEdges);
    };

    return (
        <div className="plan-card group relative border-l-4 border-amber-500 min-w-[300px]">
            <Handle type="target" position={Position.Top} className="opacity-0" />

            <div className="flex items-center justify-between mb-2 opacity-80">
                <div className="text-[10px] font-bold uppercase tracking-wider">tradeoff</div>
                <div className="text-[10px] text-text-muted">impact vs cost</div>
            </div>

            <h3 className="font-bold text-base leading-tight text-white select-none mb-2">{data.label}</h3>
            <div className="h-px bg-white/10 w-full mb-2 mt-1" />
            <button
                onClick={createApproachNodes}
                className="mb-2 inline-flex items-center gap-1.5 rounded-md border border-amber-400/40 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-200 hover:bg-amber-500/20"
                title="Create connected approach nodes from the tradeoff matrix"
            >
                <Sparkles className="w-3 h-3" />
                Create Approach Nodes
            </button>

            <div className="space-y-2">
                {scoredRows.map((row) => (
                    <div key={row.id} className="rounded-md border border-white/10 bg-white/5 p-2">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-zinc-100">{row.label}</span>
                            <span className="text-[10px] font-bold text-amber-300">Score {row.score}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                            <label className="text-[10px] text-text-muted">Impact
                                <input type="range" min={1} max={5} value={row.impact} onChange={(e) => updateValue(row.id, 'impact', Number(e.target.value))} className="w-full" />
                            </label>
                            <label className="text-[10px] text-text-muted">Effort
                                <input type="range" min={1} max={5} value={row.effort} onChange={(e) => updateValue(row.id, 'effort', Number(e.target.value))} className="w-full" />
                            </label>
                            <label className="text-[10px] text-text-muted">Risk
                                <input type="range" min={1} max={5} value={row.risk} onChange={(e) => updateValue(row.id, 'risk', Number(e.target.value))} className="w-full" />
                            </label>
                            <label className="text-[10px] text-text-muted">Time
                                <input type="range" min={1} max={5} value={row.time} onChange={(e) => updateValue(row.id, 'time', Number(e.target.value))} className="w-full" />
                            </label>
                        </div>
                    </div>
                ))}
            </div>

            <Handle type="source" position={Position.Bottom} className="opacity-0" />
        </div>
    );
};

export default memo(TradeoffNode);
