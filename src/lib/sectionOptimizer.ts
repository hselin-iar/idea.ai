import type { Edge, Node } from '@xyflow/react';

export interface SectionOptimizationSummary {
    merged: number;
    converted: number;
    collapsed: number;
    removed: number;
    repositioned: number;
}

export interface SectionOptimizationResult {
    nodes: Node[];
    edges: Edge[];
    summary: SectionOptimizationSummary;
    changed: boolean;
}

const SPECIAL_TYPES = new Set(['checklist', 'metric', 'question', 'decision', 'tradeoff', 'image']);
const GENERIC_LABEL_RE = /^(details?|notes?|overview|info|misc|more|plan)$/i;
const METRIC_RE = /\b(kpi|metric|target|rate|conversion|retention|%|percent)\b/i;
const QUESTION_RE = /(^|\s)(how|what|why|which|who|when|where)\b/i;
const CHECKLIST_RE = /\b(step|todo|to-do|checklist|task list|procedure|runbook)\b/i;
const DECISION_RE = /\b(decide|decision|choose|pick|option|go\/no-go)\b/i;
const TRADEOFF_RE = /\b(trade[- ]?off|prioriti[sz]e|impact|effort|matrix|rank)\b/i;

const STOP_WORDS = new Set([
    'the', 'and', 'for', 'with', 'from', 'this', 'that', 'your', 'project', 'plan', 'work',
    'node', 'section', 'task', 'idea', 'create', 'build', 'improve', 'optimize'
]);

function tokenize(text: string): Set<string> {
    return new Set(
        text
            .toLowerCase()
            .split(/[^a-z0-9]+/)
            .map((token) => token.trim())
            .filter((token) => token.length > 2 && !STOP_WORDS.has(token))
    );
}

function similarity(a: string, b: string): number {
    const aSet = tokenize(a);
    const bSet = tokenize(b);
    if (aSet.size === 0 || bSet.size === 0) return 0;
    let overlap = 0;
    aSet.forEach((token) => {
        if (bSet.has(token)) overlap += 1;
    });
    return overlap / Math.max(aSet.size, bSet.size);
}

function inferBestType(node: Node): string {
    const current = String(node.type || 'expandable');
    const label = String(node.data?.label || '');
    const description = String(node.data?.description || '');
    const joined = `${label} ${description}`;

    if (DECISION_RE.test(joined)) return 'decision';
    if (TRADEOFF_RE.test(joined)) return 'tradeoff';
    if (METRIC_RE.test(joined) || String(node.data?.nodeClass || '').toLowerCase() === 'metric') return 'metric';
    if (QUESTION_RE.test(label) || current === 'question') return 'question';
    if (CHECKLIST_RE.test(joined) || Array.isArray(node.data?.items)) return 'checklist';
    return current || 'expandable';
}

function splitChecklistItems(text: string): { id: string; text: string; completed: boolean }[] {
    const chunks = text
        .split(/\n|,|;|\|/)
        .map((chunk) => chunk.replace(/^\d+[\.\)]\s*/, '').replace(/^-\s*/, '').trim())
        .filter((chunk) => chunk.length > 3)
        .slice(0, 6);

    if (chunks.length > 0) {
        return chunks.map((chunk, idx) => ({ id: `opt_item_${idx}`, text: chunk, completed: false }));
    }

    return [
        { id: 'opt_item_1', text: 'Define scope and criteria', completed: false },
        { id: 'opt_item_2', text: 'Execute highest impact step', completed: false },
        { id: 'opt_item_3', text: 'Review and iterate', completed: false },
    ];
}

function splitChoices(text: string, fallback: string[]): string[] {
    const picks = text
        .split(/\n|,|;|\|/)
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
        .slice(0, 6);
    return picks.length > 0 ? picks : fallback;
}

function scoreRichness(node: Node): number {
    const labelLen = String(node.data?.label || '').length;
    const descLen = String(node.data?.description || '').length;
    const items = Array.isArray(node.data?.items) ? node.data.items.length * 14 : 0;
    const options = Array.isArray(node.data?.decisionOptions) ? node.data.decisionOptions.length * 10 : 0;
    const rows = Array.isArray(node.data?.tradeoffItems) ? node.data.tradeoffItems.length * 12 : 0;
    return labelLen + descLen + items + options + rows;
}

export function optimizeSectionGraph(nodes: Node[], edges: Edge[], activeSectionId: string): SectionOptimizationResult {
    const nextNodeMap = new Map(nodes.map((node) => [node.id, { ...node, data: { ...node.data } }]));
    let nextEdges = edges.map((edge) => ({ ...edge }));
    const summary: SectionOptimizationSummary = { merged: 0, converted: 0, collapsed: 0, removed: 0, repositioned: 0 };

    if (!nextNodeMap.has(activeSectionId)) {
        return { nodes, edges, summary, changed: false };
    }

    const adjacency = new Map<string, string[]>();
    nextEdges.forEach((edge) => {
        const children = adjacency.get(edge.source) || [];
        children.push(edge.target);
        adjacency.set(edge.source, children);
    });

    const scopedIds = new Set<string>([activeSectionId]);
    const queue = [activeSectionId];
    while (queue.length > 0) {
        const current = queue.shift()!;
        const children = adjacency.get(current) || [];
        for (const child of children) {
            const childNode = nextNodeMap.get(child);
            if (!childNode || scopedIds.has(child)) continue;
            const nodeClass = String(childNode.data?.nodeClass || '').toLowerCase();
            const isGoal = nodeClass === 'goal';
            const isOtherSection = (nodeClass === 'section' || childNode.type === 'section') && child !== activeSectionId;
            if (isGoal || isOtherSection) continue;
            scopedIds.add(child);
            queue.push(child);
        }
    }

    const contentIds = [...scopedIds].filter((id) => id !== activeSectionId);
    if (contentIds.length === 0) {
        return { nodes, edges, summary, changed: false };
    }

    const incoming = new Map<string, string[]>();
    nextEdges.forEach((edge) => {
        const list = incoming.get(edge.target) || [];
        list.push(edge.source);
        incoming.set(edge.target, list);
    });

    const removeIds = new Set<string>();
    const maxAllowedRemovals = Math.max(1, Math.floor(contentIds.length * 0.12));

    // 1) Merge obvious duplicates.
    const duplicateBuckets = new Map<string, string[]>();
    contentIds.forEach((id) => {
        const node = nextNodeMap.get(id);
        if (!node) return;
        const parent = (incoming.get(id) || []).find((src) => scopedIds.has(src)) || 'none';
        const nodeClass = String(node.data?.nodeClass || '').toLowerCase() || 'idea';
        const key = `${parent}__${nodeClass}`;
        const list = duplicateBuckets.get(key) || [];
        list.push(id);
        duplicateBuckets.set(key, list);
    });

    duplicateBuckets.forEach((ids) => {
        if (ids.length < 2) return;
        for (let i = 0; i < ids.length; i++) {
            for (let j = i + 1; j < ids.length; j++) {
                const aId = ids[i];
                const bId = ids[j];
                if (removeIds.has(aId) || removeIds.has(bId)) continue;
                const a = nextNodeMap.get(aId);
                const b = nextNodeMap.get(bId);
                if (!a || !b) continue;

                const aText = `${String(a.data?.label || '')} ${String(a.data?.description || '')}`;
                const bText = `${String(b.data?.label || '')} ${String(b.data?.description || '')}`;
                const sim = similarity(aText, bText);
                const sameLabel = String(a.data?.label || '').toLowerCase().trim() === String(b.data?.label || '').toLowerCase().trim();
                const bothRich = String(a.data?.description || '').length > 24 && String(b.data?.description || '').length > 24;
                const sameParent = ((incoming.get(aId) || [])[0] || '') === ((incoming.get(bId) || [])[0] || '');
                if (!sameLabel && !(sim >= 0.94 && bothRich && sameParent)) continue;
                if (removeIds.size >= maxAllowedRemovals) continue;

                const keep = scoreRichness(a) >= scoreRichness(b) ? a : b;
                const drop = keep.id === a.id ? b : a;

                const keepDesc = String(keep.data?.description || '').trim();
                const dropDesc = String(drop.data?.description || '').trim();
                if (dropDesc && !keepDesc.includes(dropDesc)) {
                    keep.data.description = keepDesc ? `${keepDesc} | ${dropDesc}` : dropDesc;
                }

                if (!Array.isArray(keep.data?.items) && Array.isArray(drop.data?.items) && drop.data.items.length > 0) {
                    keep.data.items = drop.data.items;
                }
                if (!Array.isArray(keep.data?.decisionOptions) && Array.isArray(drop.data?.decisionOptions) && drop.data.decisionOptions.length > 0) {
                    keep.data.decisionOptions = drop.data.decisionOptions;
                }
                if (!Array.isArray(keep.data?.tradeoffItems) && Array.isArray(drop.data?.tradeoffItems) && drop.data.tradeoffItems.length > 0) {
                    keep.data.tradeoffItems = drop.data.tradeoffItems;
                }

                nextEdges = nextEdges.map((edge) => ({
                    ...edge,
                    source: edge.source === drop.id ? keep.id : edge.source,
                    target: edge.target === drop.id ? keep.id : edge.target,
                }));
                removeIds.add(drop.id);
                summary.merged += 1;
            }
        }
    });

    // 2) Collapse generic single-hop connector nodes.
    contentIds.forEach((id) => {
        if (removeIds.has(id)) return;
        const node = nextNodeMap.get(id);
        if (!node) return;
        if (SPECIAL_TYPES.has(String(node.type || 'expandable'))) return;

        const label = String(node.data?.label || '');
        const description = String(node.data?.description || '');
        if (!GENERIC_LABEL_RE.test(label) || description.length > 16) return;

        const inEdges = nextEdges.filter((edge) => edge.target === id);
        const outEdges = nextEdges.filter((edge) => edge.source === id);
        if (inEdges.length !== 1 || outEdges.length !== 1) return;

        const parentId = inEdges[0].source;
        const childId = outEdges[0].target;
        if (parentId === childId) return;
        const childNode = nextNodeMap.get(childId);
        if (SPECIAL_TYPES.has(String(childNode?.type || 'expandable'))) return;

        if (removeIds.size >= maxAllowedRemovals) return;

        nextEdges.push({
            id: `opt_${parentId}_${childId}`,
            source: parentId,
            target: childId,
        });
        nextEdges = nextEdges.filter((edge) => edge.source !== id && edge.target !== id);
        removeIds.add(id);
        summary.collapsed += 1;
    });

    // 3) Convert node type for better fit.
    contentIds.forEach((id) => {
        if (removeIds.has(id)) return;
        const node = nextNodeMap.get(id);
        if (!node) return;

        const suggestedType = inferBestType(node);
        if (suggestedType !== String(node.type || 'expandable')) {
            node.type = suggestedType;
            summary.converted += 1;
        }

        const description = String(node.data?.description || '');
        if (suggestedType === 'checklist' && (!Array.isArray(node.data?.items) || node.data.items.length === 0)) {
            node.data.items = splitChecklistItems(description);
        }
        if (suggestedType === 'decision' && (!Array.isArray(node.data?.decisionOptions) || node.data.decisionOptions.length === 0)) {
            node.data.decisionOptions = splitChoices(description, ['Option A', 'Option B', 'Option C']);
        }
        if (suggestedType === 'tradeoff' && (!Array.isArray(node.data?.tradeoffItems) || node.data.tradeoffItems.length === 0)) {
            const rows = splitChoices(description, ['Low effort path', 'Balanced path', 'High impact path']);
            node.data.tradeoffItems = rows.map((label, idx) => ({
                id: `${node.id}_row_${idx}`,
                label,
                impact: 3,
                effort: 3,
                risk: 2,
                time: 3,
            }));
        }
    });

    summary.removed = removeIds.size;

    // 4) Reposition the section subtree for cleaner visual organization.
    const finalAdjacency = new Map<string, string[]>();
    nextEdges.forEach((edge) => {
        if (removeIds.has(edge.source) || removeIds.has(edge.target)) return;
        const children = finalAdjacency.get(edge.source) || [];
        children.push(edge.target);
        finalAdjacency.set(edge.source, children);
    });

    const sectionNode = nextNodeMap.get(activeSectionId);
    const baseX = sectionNode?.position?.x || 0;
    const baseY = sectionNode?.position?.y || 0;
    const classXOffset: Record<string, number> = {
        metric: 70,
        decision: 90,
        tradeoff: 110,
        checklist: 50,
        question: 20,
        resource: 40,
        constraint: 30,
    };

    const visitedForLayout = new Set<string>([activeSectionId]);
    const layoutQueue: Array<{ parentId: string; depth: number; centerY: number; spread: number }> = [
        { parentId: activeSectionId, depth: 1, centerY: baseY, spread: 190 }
    ];

    while (layoutQueue.length > 0) {
        const { parentId, depth, centerY, spread } = layoutQueue.shift()!;
        const children = (finalAdjacency.get(parentId) || [])
            .filter((childId) => scopedIds.has(childId) && !removeIds.has(childId))
            .filter((childId) => !visitedForLayout.has(childId))
            .map((childId) => nextNodeMap.get(childId))
            .filter((node): node is Node => !!node)
            .sort((a, b) => (a.position?.y || 0) - (b.position?.y || 0));

        if (children.length === 0) continue;

        const localSpread = Math.max(110, spread - depth * 14);
        const startY = centerY - ((children.length - 1) * localSpread) / 2;

        children.forEach((child, idx) => {
            const childClass = String(child.type || child.data?.nodeClass || '').toLowerCase();
            const xOffset = classXOffset[childClass] || 0;
            const nextPos = {
                x: baseX + depth * 305 + xOffset,
                y: startY + idx * localSpread + ((idx % 2 === 0 ? 1 : -1) * Math.min(22, depth * 6)),
            };
            if (Math.abs(child.position.x - nextPos.x) > 1 || Math.abs(child.position.y - nextPos.y) > 1) {
                child.position = nextPos;
                summary.repositioned += 1;
            }
            visitedForLayout.add(child.id);
            layoutQueue.push({
                parentId: child.id,
                depth: depth + 1,
                centerY: nextPos.y,
                spread: localSpread * 0.9,
            });
        });
    }

    const remainingNodeIds = new Set([...nextNodeMap.keys()].filter((id) => !removeIds.has(id)));
    const seen = new Set<string>();
    const cleanedEdges: Edge[] = [];
    nextEdges.forEach((edge) => {
        if (!remainingNodeIds.has(edge.source) || !remainingNodeIds.has(edge.target)) return;
        if (edge.source === edge.target) return;
        const key = `${edge.source}__${edge.target}`;
        if (seen.has(key)) return;
        seen.add(key);
        cleanedEdges.push(edge);
    });

    const cleanedNodes = nodes
        .filter((node) => remainingNodeIds.has(node.id))
        .map((node) => nextNodeMap.get(node.id) || node);

    const changed =
        summary.merged > 0 ||
        summary.converted > 0 ||
        summary.collapsed > 0 ||
        summary.removed > 0 ||
        summary.repositioned > 0 ||
        cleanedEdges.length !== edges.length ||
        cleanedNodes.length !== nodes.length;

    return {
        nodes: cleanedNodes,
        edges: cleanedEdges,
        summary,
        changed,
    };
}
