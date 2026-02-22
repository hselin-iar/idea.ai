import type { MindMapEdge, MindMapNode } from '@/services/ai';

export interface QualityGateContext {
    goal: string;
    userPrompt?: string;
    sectionLabel?: string;
    sectionBriefText?: string;
    userConstraints?: string[];
    existingNodes: MindMapNode[];
}

export interface QualityGateResult {
    updatedMindMap: {
        nodes: MindMapNode[];
        edges: MindMapEdge[];
    };
    rejectedCount: number;
    acceptedCount: number;
    summary: string;
}

const GENERIC_LABELS = new Set([
    'general',
    'misc',
    'other',
    'notes',
    'random',
    'ideas',
    'stuff',
]);

const ACTION_VERBS = [
    'define', 'set', 'create', 'build', 'plan', 'test', 'measure', 'review', 'prioritize',
    'validate', 'analyze', 'design', 'map', 'document', 'align', 'estimate', 'launch', 'track'
];

function normalizeLabel(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokenize(value: string): string[] {
    const stopWords = new Set([
        'the', 'and', 'for', 'with', 'from', 'this', 'that', 'your', 'project', 'plan',
        'section', 'node', 'goal', 'work', 'phase', 'item'
    ]);
    return value
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map((token) => token.trim())
        .filter((token) => token.length > 2 && !stopWords.has(token));
}

function relevanceScore(tokens: Set<string>, contextTokens: Set<string>): number {
    if (tokens.size === 0) return 0;
    let overlap = 0;
    for (const token of tokens) {
        if (contextTokens.has(token)) overlap += 1;
    }
    return overlap / tokens.size;
}

function actionabilityScore(node: MindMapNode): number {
    const classWeight = ['task', 'resource', 'constraint', 'metric', 'subgoal'].includes(node.nodeClass) ? 0.7 : 0.35;
    const labelTokens = tokenize(`${node.label} ${node.description}`);
    const hasVerb = labelTokens.some((token) => ACTION_VERBS.includes(token));
    const advancedTypeBonus = ['question', 'decision', 'tradeoff'].includes(node.nodeType || '') ? 0.14 : 0;
    return Math.min(1, classWeight + (hasVerb ? 0.3 : 0) + advancedTypeBonus);
}

function cleanChecklistItems(node: MindMapNode): MindMapNode {
    if (node.nodeType !== 'checklist') return node;

    const nodeLabelTokens = tokenize(node.label);
    const sourceItems = (node.items && node.items.length > 0)
        ? node.items
        : [
            { id: `item-${Date.now()}-0`, text: 'Define scope', completed: false },
            { id: `item-${Date.now()}-1`, text: 'Execute core tasks', completed: false },
            { id: `item-${Date.now()}-2`, text: 'Review and iterate', completed: false },
        ];

    const seen = new Set<string>();
    const cleaned = sourceItems
        .map((item, idx) => {
            let text = item.text.trim();
            const itemTokens = tokenize(text).filter((token) => !nodeLabelTokens.includes(token));
            if (itemTokens.length > 0) {
                text = itemTokens.join(' ');
            }
            text = text.replace(/^\w/, (ch) => ch.toUpperCase());
            if (text.length > 56) text = `${text.slice(0, 56).trim()}...`;
            if (!text) text = `Step ${idx + 1}`;
            return { id: item.id || `item-${Date.now()}-${idx}`, text, completed: !!item.completed };
        })
        .filter((item) => {
            const key = normalizeLabel(item.text);
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .slice(0, 6);

    return { ...node, items: cleaned };
}

export function applyQualityGate(
    rawMap: { nodes: MindMapNode[]; edges: MindMapEdge[] },
    context: QualityGateContext
): QualityGateResult {
    const contextText = [
        context.goal,
        context.userPrompt || '',
        context.sectionLabel || '',
        context.sectionBriefText || '',
        ...(context.userConstraints || [])
    ].join(' ');
    const contextTokens = new Set(tokenize(contextText));
    const existingLabelSet = new Set(context.existingNodes.map((node) => normalizeLabel(node.label)));

    const scored = rawMap.nodes.map((node) => {
        const normalizedLabel = normalizeLabel(node.label);
        const tokens = new Set(tokenize(`${node.label} ${node.description}`));
        const relevance = relevanceScore(tokens, contextTokens);
        const actionability = actionabilityScore(node);
        const novelty = existingLabelSet.has(normalizedLabel) ? 0 : 1;
        const isPlaceholder = /^[a-z]?\d{1,4}$/i.test(node.label.trim()) || /^t\d{1,4}$/i.test(node.label.trim());
        const genericPenalty = (GENERIC_LABELS.has(normalizedLabel) || isPlaceholder) ? 0.45 : 0;
        const score = (relevance * 0.45) + (actionability * 0.35) + (novelty * 0.20) - genericPenalty;
        return { node, score, normalizedLabel, novelty };
    });

    const byScore = [...scored].sort((a, b) => b.score - a.score);
    const selectedLabels = new Set<string>();
    const threshold = context.sectionLabel ? 0.20 : 0.16;
    const accepted: MindMapNode[] = [];

    for (const item of byScore) {
        if (selectedLabels.has(item.normalizedLabel)) continue;
        if (item.novelty === 0 && item.score < threshold + 0.12) continue;
        if (item.score < threshold) continue;

        let node = item.node;
        if (node.nodeClass === 'task' && node.nodeType !== 'checklist') {
            node = { ...node, nodeType: 'checklist' };
        }
        if (node.nodeType === 'checklist') {
            node = cleanChecklistItems(node);
        }

        accepted.push(node);
        selectedLabels.add(item.normalizedLabel);
    }

    // Preserve at least one advanced thinking node if model produced one.
    const hasAdvanced = accepted.some((node) => ['question', 'decision', 'tradeoff'].includes(node.nodeType || ''));
    if (!hasAdvanced) {
        const advancedCandidate = byScore.find((item) =>
            ['question', 'decision', 'tradeoff'].includes(item.node.nodeType || '') &&
            !selectedLabels.has(item.normalizedLabel)
        );
        if (advancedCandidate) {
            accepted.push(advancedCandidate.node);
            selectedLabels.add(advancedCandidate.normalizedLabel);
        }
    }

    const minAccepted = context.sectionLabel ? 4 : 2;
    if (accepted.length < minAccepted) {
        for (const item of byScore) {
            if (accepted.length >= minAccepted) break;
            if (selectedLabels.has(item.normalizedLabel)) continue;
            let node = item.node;
            if (node.nodeClass === 'task' && node.nodeType !== 'checklist') {
                node = { ...node, nodeType: 'checklist' };
            }
            if (node.nodeType === 'checklist') {
                node = cleanChecklistItems(node);
            }
            accepted.push(node);
            selectedLabels.add(item.normalizedLabel);
        }
    }

    // Never return an empty patch if the model produced something usable.
    if (accepted.length === 0 && byScore.length > 0) {
        let fallback = byScore[0].node;
        if (fallback.nodeClass === 'task') fallback = { ...fallback, nodeType: 'checklist' };
        if (fallback.nodeType === 'checklist') fallback = cleanChecklistItems(fallback);
        accepted.push(fallback);
    }

    const acceptedIds = new Set(accepted.map((node) => node.id));
    const existingIds = new Set(context.existingNodes.map((node) => node.id));
    const edges = rawMap.edges.filter((edge) =>
        (acceptedIds.has(edge.source) || existingIds.has(edge.source)) &&
        (acceptedIds.has(edge.target) || existingIds.has(edge.target))
    );

    const rejectedCount = Math.max(0, rawMap.nodes.length - accepted.length);
    const summary = `${accepted.length} accepted, ${rejectedCount} rejected (quality gate)`;

    return {
        updatedMindMap: {
            nodes: accepted,
            edges,
        },
        rejectedCount,
        acceptedCount: accepted.length,
        summary,
    };
}
