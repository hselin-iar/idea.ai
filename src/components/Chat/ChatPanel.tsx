'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Bot, User as UserIcon, Loader2, Check, X } from 'lucide-react';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@/lib/store';
import { aiService, parseAIResponse, ChatMessage, ParsedAIResponse, MindMapNode } from '@/services/ai';
import { InitProgressReport } from '@mlc-ai/web-llm';
import ModelSelector from '@/components/ModelSelector';
import LoginButton from '@/components/Auth/LoginButton';
import { v4 as uuidv4 } from 'uuid';
import { applyQualityGate } from '@/lib/aiQuality';
import type { ProjectIntake, SectionBrief } from '@/lib/store';

function CollapsibleMessage({ content }: { content: string }) {
    const [expanded, setExpanded] = useState(false);
    const isLong = content.length > 150;

    if (!isLong) return <>{content}</>;

    return (
        <>
            {expanded ? content : content.slice(0, 150) + '...'}
            <button
                onClick={() => setExpanded(!expanded)}
                className="block mt-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
                {expanded ? 'show less' : 'show more'}
            </button>
        </>
    );
}

function normalizeTokenSet(input: string): Set<string> {
    const stopWords = new Set([
        'the', 'and', 'for', 'with', 'from', 'this', 'that', 'your', 'plan', 'project',
        'goal', 'node', 'section', 'task', 'idea', 'work', 'phase', 'build', 'create'
    ]);
    return new Set(
        input
            .toLowerCase()
            .split(/[^a-z0-9]+/)
            .map((token) => token.trim())
            .filter((token) => token.length > 2 && !stopWords.has(token))
    );
}

function normalizeInitialScaffold(
    goal: string,
    map: ParsedAIResponse['updatedMindMap']
): ParsedAIResponse['updatedMindMap'] {
    const nodes = [...(map?.nodes || [])];
    const edges = [...(map?.edges || [])];
    if (nodes.length === 0) return map;

    let rootNode = nodes.find((node) => node.nodeClass === 'goal');
    if (!rootNode) {
        rootNode = {
            id: `goal_${Date.now()}`,
            label: goal.slice(0, 48) || 'Project Goal',
            description: goal || 'Primary project objective',
            nodeClass: 'goal',
            nodeType: 'expandable'
        };
        nodes.unshift(rootNode);
    }

    const targetSections = 6;
    const existingSectionLabels = new Set(
        nodes
            .filter((node) => node.nodeClass === 'section')
            .map((node) => node.label.toLowerCase().trim())
    );

    const sectionTemplates = [
        'Vision & Outcomes',
        'Users & Research',
        'Scope & Requirements',
        'Execution Plan',
        'Resources & Budget',
        'Risks & Constraints',
        'Go-to-Market',
        'Metrics & Validation',
    ];

    const sections = nodes.filter((node) => node.nodeClass === 'section');
    for (const sectionLabel of sectionTemplates) {
        if (sections.length >= targetSections) break;
        const normalized = sectionLabel.toLowerCase().trim();
        if (existingSectionLabels.has(normalized)) continue;
        const newSection: MindMapNode = {
            id: `sec_boot_${Date.now()}_${sections.length}`,
            label: sectionLabel,
            description: `Strategic workstream for ${sectionLabel.toLowerCase()}.`,
            nodeClass: 'section',
            nodeType: 'expandable'
        };
        nodes.push(newSection);
        sections.push(newSection);
        existingSectionLabels.add(normalized);
    }

    const edgeKeys = new Set<string>();
    const dedupedEdges: ParsedAIResponse['updatedMindMap']['edges'] = [];
    const pushEdge = (source: string, target: string) => {
        if (!source || !target || source === target) return;
        const key = `${source}__${target}`;
        if (edgeKeys.has(key)) return;
        edgeKeys.add(key);
        dedupedEdges.push({ source, target });
    };

    edges.forEach((edge) => pushEdge(edge.source, edge.target));
    sections.forEach((section) => pushEdge(rootNode.id, section.id));

    // Add lightweight section placeholders when a section has no children yet.
    const hasChild = new Set(edges.map((edge) => edge.source));
    sections.forEach((section, index) => {
        if (hasChild.has(section.id)) return;
        const placeholderId = `ph_${Date.now()}_${index}`;
        nodes.push({
            id: placeholderId,
            label: 'Section Intake',
            description: `Capture key context for ${section.label} to generate high-quality planning nodes.`,
            nodeClass: 'task',
            nodeType: 'checklist',
            items: [
                { id: `${placeholderId}_1`, text: 'Define core problem', completed: false },
                { id: `${placeholderId}_2`, text: 'State desired outcomes', completed: false },
                { id: `${placeholderId}_3`, text: 'List constraints', completed: false },
            ]
        });
        pushEdge(section.id, placeholderId);
    });

    const incomingByTarget = new Map<string, string>();
    for (const edge of dedupedEdges) {
        if (!incomingByTarget.has(edge.target)) {
            incomingByTarget.set(edge.target, edge.source);
        }
    }

    const sectionLoad = new Map<string, number>();
    sections.forEach((section) => sectionLoad.set(section.id, 0));

    const sectionTokenCache = new Map<string, Set<string>>();
    sections.forEach((section) => {
        sectionTokenCache.set(
            section.id,
            normalizeTokenSet(`${section.label} ${section.description || ''} ${goal}`)
        );
    });

    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const nodeTokenCache = new Map<string, Set<string>>();
    nodes.forEach((node) => {
        nodeTokenCache.set(node.id, normalizeTokenSet(`${node.label} ${node.description || ''}`));
    });

    const chooseBestSection = (node: MindMapNode): MindMapNode => {
        const nodeTokens = nodeTokenCache.get(node.id) || new Set<string>();
        let bestSection = sections[0];
        let bestScore = -1;

        for (const section of sections) {
            const sectionTokens = sectionTokenCache.get(section.id) || new Set<string>();
            let overlap = 0;
            for (const token of sectionTokens) {
                if (nodeTokens.has(token)) overlap += 1;
            }
            const balanceBonus = Math.max(0, 6 - (sectionLoad.get(section.id) || 0)) * 0.25;
            const score = overlap + balanceBonus;
            if (score > bestScore) {
                bestScore = score;
                bestSection = section;
            }
        }

        return bestSection;
    };

    const nodeHasStructuralParent = (sourceId?: string): boolean => {
        if (!sourceId) return false;
        const parent = nodeById.get(sourceId);
        if (!parent) return false;
        return parent.nodeClass !== 'goal';
    };

    nodes.forEach((node) => {
        if (node.id === rootNode.id || node.nodeClass === 'section') return;

        const currentParentId = incomingByTarget.get(node.id);
        if (nodeHasStructuralParent(currentParentId)) return;

        const bestSection = chooseBestSection(node);
        if (!bestSection) return;
        pushEdge(bestSection.id, node.id);
        incomingByTarget.set(node.id, bestSection.id);
        sectionLoad.set(bestSection.id, (sectionLoad.get(bestSection.id) || 0) + 1);
    });

    const targetHasSectionParent = new Set<string>();
    dedupedEdges.forEach((edge) => {
        const sourceNode = nodeById.get(edge.source);
        if (sourceNode?.nodeClass === 'section') {
            targetHasSectionParent.add(edge.target);
        }
    });

    const filteredEdges = dedupedEdges.filter((edge) => {
        if (edge.source !== rootNode.id) return true;
        const targetNode = nodeById.get(edge.target);
        if (!targetNode) return false;
        if (targetNode.nodeClass === 'section') return true;
        return !targetHasSectionParent.has(edge.target);
    });

    return { nodes, edges: filteredEdges };
}

function buildSectionBriefText(brief?: SectionBrief): string {
    if (!brief) return '';
    return [
        `Focus: ${brief.focus}`,
        `Must include: ${brief.mustInclude}`,
    ].filter((line) => !line.endsWith(': ')).join(' | ');
}

function buildProjectIntakeText(projectIntake?: ProjectIntake | null): string {
    if (!projectIntake) return '';
    return [
        `Objective: ${projectIntake.objective}`,
        `Target audience: ${projectIntake.targetAudience}`,
        `Constraints: ${projectIntake.constraints}`,
        `Success signal: ${projectIntake.successSignal}`,
    ].filter((line) => !line.endsWith(': ')).join(' | ');
}

function buildSectionBriefDigest(
    briefs: Record<string, SectionBrief>,
    activeSectionId?: string | null
): string {
    const entries = Object.values(briefs || {})
        .filter((brief) => brief.sectionId !== activeSectionId)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 4)
        .map((brief) => `${brief.sectionLabel}: focus=${brief.focus}${brief.mustInclude ? `, must=${brief.mustInclude}` : ''}`);
    return entries.join(' | ');
}

function buildIntentPrompt(input: string): string {
    const trimmed = input.trim();
    const lower = trimmed.toLowerCase();
    if (lower.startsWith('/prioritize')) {
        return `${trimmed.replace('/prioritize', '').trim() || 'current section'}\n\nIntent: Prioritize highest-leverage nodes, dependencies, and execution order.`;
    }
    if (lower.startsWith('/gaps')) {
        return `${trimmed.replace('/gaps', '').trim() || 'current section'}\n\nIntent: Identify missing critical nodes and weak assumptions before adding new work.`;
    }
    if (lower.startsWith('/challenge')) {
        return `${trimmed.replace('/challenge', '').trim() || 'current plan'}\n\nIntent: Challenge assumptions and surface risks, blind spots, and failure modes.`;
    }
    if (lower.startsWith('/expand')) {
        return `${trimmed.replace('/expand', '').trim() || 'current section'}\n\nIntent: Expand this with concrete actionable nodes and useful checklists.`;
    }
    return trimmed;
}

function buildProjectIntakeFallbackPatch(
    sectionId: string,
    sectionLabel: string,
    intake: {
        objective: string;
        audience: string;
        constraints: string;
        successSignal: string;
    },
    count: number
): { nodes: MindMapNode[]; edges: { source: string; target: string }[] } {
    const objective = intake.objective.trim() || 'Deliver meaningful progress';
    const constraints = intake.constraints.trim() || 'Operate within practical limits';
    const successSignal = intake.successSignal.trim() || 'Track clear outcome signal';
    const audience = intake.audience.trim() || 'Primary users';

    const templates: Array<Pick<MindMapNode, 'label' | 'description' | 'nodeClass' | 'nodeType'> & {
        items?: { id: string; text: string; completed: boolean }[];
        decisionOptions?: string[];
        tradeoffItems?: { id: string; label: string; impact: number; effort: number; risk: number; time: number }[];
    }> = [
        {
            label: `${sectionLabel}: Key Question`,
            description: `What is the highest-leverage move for "${sectionLabel}" to advance ${objective.toLowerCase()}?`,
            nodeClass: 'idea',
            nodeType: 'question',
        },
        {
            label: `${sectionLabel}: Execution Checklist`,
            description: `Concrete steps to execute ${sectionLabel} with focus on ${audience.toLowerCase()}.`,
            nodeClass: 'task',
            nodeType: 'checklist',
            items: [
                { id: uuidv4(), text: 'Define owner and timeline', completed: false },
                { id: uuidv4(), text: 'Ship first implementation', completed: false },
                { id: uuidv4(), text: 'Review outcomes and iterate', completed: false },
            ]
        },
        {
            label: `${sectionLabel}: Core Decision`,
            description: `Choose a direction that balances constraints: ${constraints}.`,
            nodeClass: 'idea',
            nodeType: 'decision',
            decisionOptions: ['Fast iteration', 'Balanced rollout', 'High assurance']
        },
        {
            label: `${sectionLabel}: Tradeoff Matrix`,
            description: `Compare options by impact, effort, risk, and time for this section.`,
            nodeClass: 'idea',
            nodeType: 'tradeoff',
            tradeoffItems: [
                { id: uuidv4(), label: 'Low effort path', impact: 3, effort: 2, risk: 3, time: 2 },
                { id: uuidv4(), label: 'Balanced path', impact: 4, effort: 3, risk: 2, time: 3 },
                { id: uuidv4(), label: 'High impact path', impact: 5, effort: 4, risk: 3, time: 4 },
            ]
        },
        {
            label: `${sectionLabel}: Success Metric`,
            description: `Measure progress using: ${successSignal}.`,
            nodeClass: 'metric',
            nodeType: 'metric',
        },
    ];

    const nodes: MindMapNode[] = templates.slice(0, Math.max(1, Math.min(count, templates.length))).map((template) => ({
        id: uuidv4(),
        label: template.label,
        description: template.description,
        nodeClass: template.nodeClass,
        nodeType: template.nodeType,
        items: template.items,
        decisionOptions: template.decisionOptions,
        tradeoffItems: template.tradeoffItems,
    }));
    const edges = nodes.map((node) => ({ source: sectionId, target: node.id }));
    return { nodes, edges };
}

type ChatIntentType = 'question' | 'information' | 'instruction' | 'radical';
type ImpactBand = 'single' | 'few' | 'broad';

interface ChatIntentAnalysis {
    type: ChatIntentType;
    impactedSectionIds: string[];
    impactedSectionLabels: string[];
    impactBand: ImpactBand;
    shouldMicroUpdate: boolean;
    maxNodesPerSection: number;
}

interface SectionScopeNode {
    id: string;
    type?: string;
    data: {
        label?: unknown;
        description?: unknown;
        nodeClass?: unknown;
    };
}

function extractConversationalText(raw: string): string {
    return raw
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/^[A-Z0-9_-]+\s*-->\s*[A-Z0-9_-]+.*$/gim, ' ')
        .replace(/^[A-Z0-9_-]+\[.*$/gim, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function overlapCount(a: Set<string>, b: Set<string>): number {
    let overlap = 0;
    for (const token of a) {
        if (b.has(token)) overlap += 1;
    }
    return overlap;
}

function analyzeChatIntent(
    rawText: string,
    allNodes: SectionScopeNode[],
    activeSectionId?: string | null
): ChatIntentAnalysis {
    const text = rawText.trim();
    const lower = text.toLowerCase();
    const messageTokens = normalizeTokenSet(text);

    const radical = /\b(regenerate|rebuild|rework everything|redo all|start over|from scratch|full rewrite|complete overhaul|restructure all)\b/i.test(lower);
    const actionRequest = /^(can|could|would|should)\s+you\b.*\b(add|update|create|remove|change|optimize|expand|refactor|implement|fix|improve|organize|prioritize)\b/i.test(lower);
    const question = !actionRequest && (/\?$/.test(text) || /^(how|what|why|which|who|where|when|can|could|should|would)\b/i.test(lower));
    const instruction = /\b(add|update|create|remove|change|optimize|expand|refactor|implement|fix|improve|organize|prioritize)\b/i.test(lower);

    const type: ChatIntentType = radical
        ? 'radical'
        : question
            ? 'question'
            : instruction
                ? 'instruction'
                : 'information';

    const sectionNodes = allNodes
        .filter((node) => String(node.data?.nodeClass || '').toLowerCase() === 'section' || node.type === 'section')
        .map((node) => ({
            id: node.id,
            label: String(node.data?.label || ''),
            description: String(node.data?.description || ''),
        }));

    const broadRequested = /\b(all sections|every section|overall|across the project|everywhere|whole map|entire project)\b/i.test(lower);
    const ranked = sectionNodes
        .map((section) => {
            const sectionTokens = normalizeTokenSet(`${section.label} ${section.description}`);
            const overlap = overlapCount(messageTokens, sectionTokens);
            const explicitMention = section.label && lower.includes(section.label.toLowerCase()) ? 3 : 0;
            const score = overlap + explicitMention;
            return { ...section, score };
        })
        .sort((a, b) => b.score - a.score);

    let impacted = broadRequested || type === 'radical'
        ? ranked
        : ranked.filter((entry) => entry.score > 0);

    if (impacted.length === 0 && activeSectionId) {
        const active = sectionNodes.find((section) => section.id === activeSectionId);
        if (active) impacted = [active];
    }
    if (impacted.length === 0 && ranked.length > 0) {
        impacted = [ranked[0]];
    }

    const limit = type === 'information'
        ? 3
        : type === 'question'
            ? 2
            : type === 'instruction'
                ? 2
                : Math.max(6, impacted.length);
    impacted = impacted.slice(0, limit);

    const impactBand: ImpactBand = impacted.length <= 1
        ? 'single'
        : impacted.length <= 3
            ? 'few'
            : 'broad';

    const maxNodesPerSection = type === 'information'
        ? (impactBand === 'broad' ? 1 : 2)
        : type === 'question'
            ? 1
            : type === 'instruction'
                ? 3
                : 8;

    return {
        type,
        impactedSectionIds: impacted.map((section) => section.id),
        impactedSectionLabels: impacted.map((section) => section.label),
        impactBand,
        shouldMicroUpdate: type === 'information' && impacted.length > 0 && !radical,
        maxNodesPerSection,
    };
}

function buildIntentPolicyBlock(analysis: ChatIntentAnalysis): string {
    if (analysis.type === 'question') {
        return [
            'Chat Handling Policy:',
            '- Primary goal: answer the question clearly.',
            '- Mind map changes should be minimal (0-1 node) unless user explicitly asks for expansion.',
            '- Do not regenerate sections.'
        ].join('\n');
    }
    if (analysis.type === 'instruction') {
        return [
            'Chat Handling Policy:',
            '- Apply incremental updates only.',
            '- Add focused nodes and preserve existing structure.',
            '- Do not regenerate full sections unless user explicitly asks.'
        ].join('\n');
    }
    if (analysis.type === 'radical') {
        return [
            'Chat Handling Policy:',
            '- User requested a radical change.',
            '- Larger structural changes are allowed where necessary.'
        ].join('\n');
    }
    return [
        'Chat Handling Policy:',
        '- User message is informational context.',
        '- Prefer small additive updates and preserve current map.'
    ].join('\n');
}

export default function ChatPanel() {
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isIntakeSubmitting, setIsIntakeSubmitting] = useState(false);
    const [showIntakeForm, setShowIntakeForm] = useState(false);
    const [loadingText, setLoadingText] = useState('');
    const [progress, setProgress] = useState(0);
    const [historyExpanded, setHistoryExpanded] = useState(false);
    const [intakeObjective, setIntakeObjective] = useState('');
    const [intakeAudience, setIntakeAudience] = useState('');
    const [intakeConstraints, setIntakeConstraints] = useState('');
    const [intakeSuccessSignal, setIntakeSuccessSignal] = useState('');
    const [intakeError, setIntakeError] = useState('');
    const [intakeJob, setIntakeJob] = useState<{
        status: 'idle' | 'running' | 'done' | 'error';
        total: number;
        processed: number;
        currentSection: string;
        updatedSections: number;
        addedNodes: number;
        results: { section: string; added: number }[];
    }>({
        status: 'idle',
        total: 0,
        processed: 0,
        currentSection: '',
        updatedSections: 0,
        addedNodes: 0,
        results: [],
    });

    // V23: Get all required store methods
    const messages = useStore((state) => state.messages);
    const addMessage = useStore((state) => state.addMessage);
    const goal = useStore((state) => state.goal);
    const nodes = useStore((state) => state.nodes);
    const getScopedMindMapAsJSON = useStore((state) => state.getScopedMindMapAsJSON);
    const getScopedMindMapAsJSONForSection = useStore((state) => state.getScopedMindMapAsJSONForSection);
    const setMindMapFromJSON = useStore((state) => state.setMindMapFromJSON);
    const getMessagesForAI = useStore((state) => state.getMessagesForAI);
    const sectionBriefs = useStore((state) => state.sectionBriefs);
    const projectIntake = useStore((state) => state.projectIntake);
    const setProjectIntake = useStore((state) => state.setProjectIntake);
    const projectIntakePrompted = useStore((state) => state.projectIntakePrompted);
    const setProjectIntakePrompted = useStore((state) => state.setProjectIntakePrompted);
    const userConstraints = useStore((state) => state.userConstraints);
    const setSectionLoading = useStore((state) => state.setSectionLoading);
    const addUserConstraint = useStore((state) => state.addUserConstraint);
    const removeUserConstraint = useStore((state) => state.removeUserConstraint);
    const proposalMode = useStore((state) => state.proposalMode);
    const setProposalMode = useStore((state) => state.setProposalMode);
    const createProposal = useStore((state) => state.createProposal);
    const proposals = useStore((state) => state.proposals);
    const approveProposal = useStore((state) => state.approveProposal);
    const rejectProposal = useStore((state) => state.rejectProposal);

    // Proactive Greeting Ref to ensure it only runs once
    const hasInitializedRef = useRef(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const lastUserMessageRef = useRef<string>('');
    const lastIntentRef = useRef<ChatIntentAnalysis | null>(null);

    const runLocalCommand = useCallback((rawText: string): { handled: boolean; aiText?: string } => {
        const trimmed = rawText.trim();
        if (!trimmed.startsWith('/')) return { handled: false };

        const parts = trimmed.split(/\s+/);
        const command = (parts[0] || '').toLowerCase();
        const args = parts.slice(1).join(' ').trim();

        if (command === '/constraints') {
            const text = userConstraints.length > 0
                ? `Current constraints:\n- ${userConstraints.join('\n- ')}`
                : 'No constraints saved yet. Use `/constraint add <text>`.';
            addMessage('assistant', text);
            return { handled: true };
        }

        if (command === '/constraint') {
            const sub = (parts[1] || '').toLowerCase();
            const value = parts.slice(2).join(' ').trim();
            if (sub === 'add' && value) {
                addUserConstraint(value);
                addMessage('assistant', `Constraint added: "${value}"`);
                return { handled: true };
            }
            if (sub === 'remove' && value) {
                removeUserConstraint(value);
                addMessage('assistant', `Constraint removed: "${value}"`);
                return { handled: true };
            }
            addMessage('assistant', 'Use `/constraint add <text>` or `/constraint remove <text>`.');
            return { handled: true };
        }

        if (command === '/approve' && args) {
            approveProposal(args);
            addMessage('assistant', `Approved proposal ${args}.`);
            return { handled: true };
        }
        if (command === '/reject' && args) {
            rejectProposal(args);
            addMessage('assistant', `Rejected proposal ${args}.`);
            return { handled: true };
        }

        if (['/prioritize', '/gaps', '/challenge', '/expand'].includes(command)) {
            return { handled: false, aiText: buildIntentPrompt(trimmed) };
        }

        if (command === '/intake') {
            setShowIntakeForm(true);
            setIntakeJob({
                status: 'idle',
                total: 0,
                processed: 0,
                currentSection: '',
                updatedSections: 0,
                addedNodes: 0,
                results: [],
            });
            addMessage('assistant', 'Project intake is open. Submit it to refresh all sections with better context.');
            return { handled: true };
        }

        addMessage('assistant', 'Commands: `/constraints`, `/constraint add ...`, `/constraint remove ...`, `/intake`, `/prioritize`, `/gaps`, `/challenge`, `/expand`.');
        return { handled: true };
    }, [
        userConstraints,
        addMessage,
        addUserConstraint,
        removeUserConstraint,
        approveProposal,
        rejectProposal,
        setShowIntakeForm
    ]);

    const handleProjectIntakeSubmit = useCallback(async () => {
        const objective = intakeObjective.trim();
        const targetAudience = intakeAudience.trim();
        const constraints = intakeConstraints.trim();
        const successSignal = intakeSuccessSignal.trim();

        if (objective.length < 12 || targetAudience.length < 4) {
            setIntakeError('Add a clear objective and target audience.');
            return;
        }

        setIntakeError('');
        setIsIntakeSubmitting(true);
        setIntakeJob({
            status: 'idle',
            total: 0,
            processed: 0,
            currentSection: '',
            updatedSections: 0,
            addedNodes: 0,
            results: [],
        });

        try {
            setProjectIntake({
                objective,
                targetAudience,
                constraints,
                successSignal,
            });
            if (constraints.length > 0) {
                addUserConstraint(constraints);
            }

            const currentState = useStore.getState();
            const allNodes = currentState.nodes;
            const allEdges = currentState.edges;
            const sectionNodes = allNodes.filter(
                (node) => node.data.nodeClass === 'section' || node.type === 'section'
            );

            const adjacency = new Map<string, string[]>();
            allEdges.forEach((edge) => {
                const children = adjacency.get(edge.source) || [];
                children.push(edge.target);
                adjacency.set(edge.source, children);
            });
            const nodeById = new Map(allNodes.map((node) => [node.id, node]));
            const countSectionDescendants = (sectionId: string) => {
                const visited = new Set<string>();
                const queue = [sectionId];
                while (queue.length > 0) {
                    const current = queue.shift()!;
                    const children = adjacency.get(current) || [];
                    for (const child of children) {
                        if (visited.has(child)) continue;
                        const childNode = nodeById.get(child);
                        const isGoal = childNode?.data.nodeClass === 'goal';
                        const isOtherSection = (childNode?.data.nodeClass === 'section' || childNode?.type === 'section') && child !== sectionId;
                        if (isGoal || isOtherSection) continue;
                        visited.add(child);
                        queue.push(child);
                    }
                }
                return visited.size;
            };

            const sectionTargets = sectionNodes
                .map((sectionNode) => ({
                    id: sectionNode.id,
                    label: String(sectionNode.data.label || 'Section'),
                    count: countSectionDescendants(sectionNode.id),
                }))
                .sort((a, b) => {
                    const target = 24;
                    const score = (count: number) => {
                        const deficit = target - count;
                        if (deficit >= 0) return deficit * 2;
                        return Math.max(1, Math.floor(Math.abs(deficit) * 0.65));
                    };
                    return score(b.count) - score(a.count);
                });

            const selectedSections = sectionTargets;

            setIntakeJob({
                status: 'running',
                total: selectedSections.length,
                processed: 0,
                currentSection: selectedSections[0] ? selectedSections[0].label : '',
                updatedSections: 0,
                addedNodes: 0,
                results: [],
            });

            if (selectedSections.length === 0) {
                setIntakeJob((prev) => ({ ...prev, status: 'done' }));
                addMessage('assistant', 'Saved project intake. Sections are already dense; I skipped heavy expansion to keep map quality stable.');
                return;
            }

            let updatedSections = 0;
            let addedNodes = 0;
            const baseHistory = (getMessagesForAI() as ChatMessage[]).slice(-1);
            const intakeText = buildProjectIntakeText({
                objective,
                targetAudience,
                constraints,
                successSignal,
                updatedAt: Date.now(),
            });

            for (const section of selectedSections) {
                const sectionId = section.id;
                const sectionLabel = section.label;
                setIntakeJob((prev) => ({ ...prev, currentSection: sectionLabel }));
                const sectionBrief = useStore.getState().sectionBriefs[sectionId];
                const sectionBriefText = buildSectionBriefText(sectionBrief);
                const sectionNodeCount = section.count;
                const targetRange = sectionNodeCount < 8
                    ? '8-12'
                    : sectionNodeCount < 16
                        ? '6-9'
                        : sectionNodeCount < 28
                            ? '4-6'
                            : sectionNodeCount < 40
                                ? '2-4'
                                : '0-2';

                const sectionPrompt = [
                    `[Section: ${sectionLabel}]`,
                    `Update this section with high-impact nodes using the global project intake.`,
                    `Project Intake: ${intakeText}`,
                    `Current section node count: ${sectionNodeCount}.`,
                    sectionBriefText ? `Section Brief: ${sectionBriefText}` : '',
                    userConstraints.length > 0 ? `Global Constraints: ${userConstraints.join(' | ')}` : '',
                    `Add ${targetRange} concrete nodes for this section, focused on execution quality and missing coverage.`,
                    sectionNodeCount > 40
                        ? 'This section is dense. Prefer merge/reclassify and cross-section handoffs; avoid increasing net node count.'
                        : 'If nodes look misplaced here, reframe them into better section categories instead of duplication.',
                    'Include execution, risks, dependencies, and at least one measurable node when relevant.',
                    'Use at least one of these node types when suitable: question, decision, tradeoff.',
                ].filter(Boolean).join('\n');

                setSectionLoading(sectionId, true);
                let qualityAddedCount = 0;
                let wasRedirected = false;
                const minNetAdds = sectionNodeCount < 8
                    ? 6
                    : sectionNodeCount < 16
                        ? 5
                        : sectionNodeCount < 28
                            ? 3
                            : 2;
                const maxAttempts = sectionNodeCount < 12 ? 2 : 1;
                try {
                    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
                        const currentNodes = useStore.getState().nodes;
                        const aiNodes: MindMapNode[] = currentNodes.map((node) => ({
                            id: node.id,
                            label: String(node.data.label || ''),
                            description: String(node.data.description || ''),
                            nodeClass: ((node.data.nodeClass as MindMapNode['nodeClass']) || 'idea'),
                            nodeType: (typeof node.type === 'string' ? node.type : 'expandable') as MindMapNode['nodeType'],
                            items: Array.isArray(node.data.items)
                                ? node.data.items as { id: string; text: string; completed: boolean }[]
                                : undefined,
                        }));

                        const attemptPrompt = attempt === 0
                            ? sectionPrompt
                            : `${sectionPrompt}\nSecond pass: section still sparse. Add missing concrete nodes and improve weak placeholders.`;
                        const response = await aiService.chat(
                            goal,
                            [...baseHistory, { role: 'user', content: attemptPrompt }],
                            getScopedMindMapAsJSONForSection(sectionId),
                            undefined,
                            undefined,
                            {
                                forceContextual: true,
                                preEnrichedUserPrompt: true,
                                maxTokens: sectionNodeCount > 40 ? 820 : 1080,
                                temperature: attempt === 0 ? 0.56 : 0.6
                            }
                        );

                        const parsed = parseAIResponse(
                            response,
                            goal,
                            aiNodes,
                            `intake_${Date.now()}`,
                            sectionId,
                            attemptPrompt
                        );

                        if (parsed.redirectTo) {
                            wasRedirected = true;
                            break;
                        }
                        const quality = applyQualityGate(parsed.updatedMindMap, {
                            goal,
                            userPrompt: attemptPrompt,
                            sectionLabel,
                            sectionBriefText: `${sectionBriefText}${sectionBriefText ? ' | ' : ''}${intakeText}`,
                            userConstraints,
                            existingNodes: aiNodes,
                        });

                        if (quality.updatedMindMap.nodes.length > 0) {
                            setMindMapFromJSON(quality.updatedMindMap);
                            qualityAddedCount += quality.updatedMindMap.nodes.length;
                            await new Promise((resolve) => window.setTimeout(resolve, 0));
                        }
                        if (qualityAddedCount >= minNetAdds) break;
                    }

                    if (!wasRedirected) {
                        const deficit = Math.max(0, minNetAdds - qualityAddedCount);
                        if (deficit > 0) {
                            const fallbackPatch = buildProjectIntakeFallbackPatch(
                                sectionId,
                                sectionLabel,
                                {
                                    objective,
                                    audience: targetAudience,
                                    constraints,
                                    successSignal,
                                },
                                Math.min(4, deficit)
                            );
                            if (fallbackPatch.nodes.length > 0) {
                                setMindMapFromJSON(fallbackPatch);
                                qualityAddedCount += fallbackPatch.nodes.length;
                            }
                        }
                    }

                    if (!wasRedirected && qualityAddedCount > 0) {
                        updatedSections += 1;
                        addedNodes += qualityAddedCount;
                    }
                } catch (error) {
                    console.error(`[ChatPanel] intake section update failed (${sectionLabel})`, error);
                } finally {
                    setSectionLoading(sectionId, false);
                }

                setIntakeJob((prev) => ({
                    ...prev,
                    processed: prev.processed + 1,
                    updatedSections,
                    addedNodes,
                    results: [
                        ...prev.results,
                        {
                            section: sectionLabel,
                            added: wasRedirected ? 0 : qualityAddedCount,
                        }
                    ],
                }));

                // Avoid long main-thread monopolization across many sections.
                await new Promise((resolve) => window.setTimeout(resolve, 0));
            }

            setIntakeJob((prev) => ({ ...prev, status: 'done', currentSection: '' }));
            addMessage(
                'assistant',
                updatedSections > 0
                    ? `Intake applied across ${updatedSections}/${selectedSections.length} sections. Added ${addedNodes} focused nodes and filled sparse sections with fallback coverage when needed.`
                    : 'Intake saved. I could not find high-quality additions yet, so I kept the map stable.'
            );
            setShowIntakeForm(false);
        } catch (error) {
            console.error('[ChatPanel] project intake update failed', error);
            setIntakeJob((prev) => ({ ...prev, status: 'error', currentSection: '' }));
            addMessage('assistant', 'Project intake saved, but section refresh failed this time. Try again in a moment.');
        } finally {
            setIsIntakeSubmitting(false);
        }
    }, [
        intakeObjective,
        intakeAudience,
        intakeConstraints,
        intakeSuccessSignal,
        setProjectIntake,
        addUserConstraint,
        addMessage,
        getMessagesForAI,
        goal,
        getScopedMindMapAsJSONForSection,
        userConstraints,
        setMindMapFromJSON,
        setSectionLoading
    ]);

    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            // Use setTimeout to ensure DOM has updated before scrolling
            setTimeout(() => {
                if (scrollRef.current) {
                    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                }
            }, 50);
        }
    }, [messages, isLoading, historyExpanded]);

    useEffect(() => {
        if (!projectIntake) return;
        setIntakeObjective(projectIntake.objective || '');
        setIntakeAudience(projectIntake.targetAudience || '');
        setIntakeConstraints(projectIntake.constraints || '');
        setIntakeSuccessSignal(projectIntake.successSignal || '');
    }, [projectIntake]);

    useEffect(() => {
        const sectionCount = nodes.filter((node) => node.data.nodeClass === 'section' || node.type === 'section').length;
        const hasBaseScaffold = !!goal && sectionCount >= 4;
        if (!hasBaseScaffold || projectIntakePrompted) return;

        setProjectIntakePrompted(true);
        addMessage(
            'assistant',
            'Base sections are ready. Open Project Intake when you want me to improve every section using shared context.'
        );
    }, [nodes, goal, projectIntakePrompted, setProjectIntakePrompted, addMessage]);

    const runInfoMicroUpdates = useCallback(async (
        infoText: string,
        analysis: ChatIntentAnalysis
    ): Promise<{ addedNodes: number; touchedSections: string[]; failedSections: number }> => {
        let addedNodes = 0;
        let failedSections = 0;
        const touchedSections: string[] = [];
        const projectIntakeText = buildProjectIntakeText(projectIntake);

        for (const sectionId of analysis.impactedSectionIds) {
            const history = (getMessagesForAI() as ChatMessage[]).slice(-2);
            const state = useStore.getState();
            const sectionNode = state.nodes.find((node) => node.id === sectionId);
            const sectionLabel = String(sectionNode?.data?.label || 'Section');
            const sectionBrief = state.sectionBriefs[sectionId];
            const sectionBriefText = buildSectionBriefText(sectionBrief);
            if (!sectionNode) continue;

            setSectionLoading(sectionId, true);
            try {
                const aiNodes: MindMapNode[] = state.nodes.map((node) => ({
                    id: node.id,
                    label: String(node.data.label || ''),
                    description: String(node.data.description || ''),
                    nodeClass: ((node.data.nodeClass as MindMapNode['nodeClass']) || 'idea'),
                    nodeType: (typeof node.type === 'string' ? node.type : 'expandable') as MindMapNode['nodeType'],
                    items: Array.isArray(node.data.items) ? node.data.items as { id: string; text: string; completed: boolean }[] : undefined,
                    decisionOptions: Array.isArray(node.data.decisionOptions) ? node.data.decisionOptions as string[] : undefined,
                    chosenOption: typeof node.data.chosenOption === 'string' ? node.data.chosenOption as string : undefined,
                    tradeoffItems: Array.isArray(node.data.tradeoffItems)
                        ? node.data.tradeoffItems as { id: string; label: string; impact: number; effort: number; risk: number; time: number }[]
                        : undefined,
                }));

                const prompt = [
                    `[Section: ${sectionLabel}]`,
                    `User shared new information that affects ${analysis.impactBand} scope.`,
                    `New Info: ${infoText}`,
                    projectIntakeText ? `Project Intake: ${projectIntakeText}` : '',
                    sectionBriefText ? `Section Brief: ${sectionBriefText}` : '',
                    userConstraints.length > 0 ? `Global Constraints: ${userConstraints.join(' | ')}` : '',
                    `Integrate this info with a micro-update: add at most ${analysis.maxNodesPerSection} high-value nodes in this section.`,
                    'Do not regenerate the section. Do not rewrite unrelated nodes.',
                    'Prefer concrete execution/decision/question/metric nodes when relevant.'
                ].filter(Boolean).join('\n');

                const response = await aiService.chat(
                    goal,
                    [...history, { role: 'user', content: prompt }],
                    getScopedMindMapAsJSONForSection(sectionId),
                    undefined,
                    undefined,
                    {
                        forceContextual: true,
                        preEnrichedUserPrompt: true,
                        maxTokens: 720,
                        temperature: 0.54,
                    }
                );

                const parsed = parseAIResponse(
                    response,
                    goal,
                    aiNodes,
                    `info_${Date.now()}`,
                    sectionId,
                    prompt
                );

                if (parsed.redirectTo || parsed.updatedMindMap.nodes.length === 0) {
                    continue;
                }

                const quality = applyQualityGate(parsed.updatedMindMap, {
                    goal,
                    userPrompt: prompt,
                    sectionLabel,
                    sectionBriefText: `${sectionBriefText}${sectionBriefText && projectIntakeText ? ' | ' : ''}${projectIntakeText}`,
                    userConstraints,
                    existingNodes: aiNodes,
                });

                const promptTokens = normalizeTokenSet(`${infoText} ${sectionLabel} ${projectIntakeText} ${sectionBriefText}`);
                const strictNodes = quality.updatedMindMap.nodes.filter((node) => {
                    const label = String(node.label || '').trim();
                    if (/^[a-z]?\d{1,4}$/i.test(label) || /^t\d{1,4}$/i.test(label)) return false;
                    const nodeTokens = normalizeTokenSet(`${node.label} ${node.description || ''}`);
                    const overlap = overlapCount(nodeTokens, promptTokens);
                    const importantType = ['question', 'checklist', 'metric', 'decision', 'tradeoff'].includes(node.nodeType || '');
                    return overlap > 0 || importantType;
                });
                const limitedNodes = strictNodes.slice(0, analysis.maxNodesPerSection);
                if (limitedNodes.length === 0) continue;

                const newIds = new Set(limitedNodes.map((node) => node.id));
                const existingIds = new Set(aiNodes.map((node) => node.id));
                const limitedEdges = quality.updatedMindMap.edges
                    .filter((edge) =>
                        (newIds.has(edge.source) || existingIds.has(edge.source) || edge.source === sectionId) &&
                        (newIds.has(edge.target) || existingIds.has(edge.target))
                    )
                    .slice(0, Math.max(analysis.maxNodesPerSection * 3, 4));

                const linkedTargets = new Set(limitedEdges.map((edge) => edge.target));
                limitedNodes.forEach((node) => {
                    if (!linkedTargets.has(node.id)) {
                        limitedEdges.push({ source: sectionId, target: node.id });
                    }
                });

                setMindMapFromJSON({
                    nodes: limitedNodes,
                    edges: limitedEdges,
                });
                addedNodes += limitedNodes.length;
                touchedSections.push(sectionLabel);
            } catch (error) {
                failedSections += 1;
                console.error(`[ChatPanel] info micro-update failed (${sectionLabel})`, error);
            } finally {
                setSectionLoading(sectionId, false);
                await new Promise((resolve) => window.setTimeout(resolve, 0));
            }
        }

        return { addedNodes, touchedSections, failedSections };
    }, [
        getMessagesForAI,
        projectIntake,
        userConstraints,
        goal,
        getScopedMindMapAsJSONForSection,
        setMindMapFromJSON,
        setSectionLoading,
    ]);

    // V44: Process AI response using parser with robust fallback
    const processAIResponse = useCallback((response: string, isFirstTurn: boolean = false) => {
        const currentNodes = useStore.getState().nodes;
        const activeSectionId = useStore.getState().activeSection;
        const currentSectionNode = activeSectionId
            ? currentNodes.find((n) => n.id === activeSectionId)
            : undefined;
        const aiNodes: MindMapNode[] = currentNodes.map((node) => ({
            id: node.id,
            label: String(node.data.label || ''),
            description: String(node.data.description || ''),
            nodeClass: ((node.data.nodeClass as MindMapNode['nodeClass']) || 'idea'),
            nodeType: (typeof node.type === 'string' ? node.type : 'expandable') as MindMapNode['nodeType'],
            items: Array.isArray(node.data.items) ? node.data.items as { id: string; text: string; completed: boolean }[] : undefined,
        }));
        const newNodeId = `node-${uuidv4()}`;
        const goalNode = currentNodes.find((node) => node.data.nodeClass === 'goal');
        const parentId = activeSectionId || goalNode?.id || currentNodes[0]?.id || 'root';
        const lastUserMsg = lastUserMessageRef.current;

        let parsedData: ParsedAIResponse | null = null;

        // First try JSON parsing (backwards compatibility)
        try {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsedData = JSON.parse(jsonMatch[0]);
            }
        } catch {
            // Not JSON, use text parser
        }

        // If no JSON or JSON failed, use text parser
        if (!parsedData || !parsedData.assistantResponse) {
            parsedData = parseAIResponse(response, goal, aiNodes, newNodeId, parentId, lastUserMsg);
        }

        if (!parsedData) {
            parsedData = parseAIResponse(response, goal, aiNodes, newNodeId, parentId, lastUserMsg);
        }

        if (isFirstTurn && parsedData.updatedMindMap?.nodes?.length > 0) {
            parsedData.updatedMindMap = normalizeInitialScaffold(goal, parsedData.updatedMindMap);
        }

        let rejectedNodes = 0;
        let qualitySummary = '';
        if (parsedData.updatedMindMap?.nodes?.length > 0 && !parsedData.redirectTo) {
            const sectionBrief = activeSectionId ? sectionBriefs[activeSectionId] : undefined;
            const intakeText = buildProjectIntakeText(projectIntake);
            const quality = applyQualityGate(parsedData.updatedMindMap, {
                goal,
                userPrompt: lastUserMsg,
                sectionLabel: currentSectionNode ? String(currentSectionNode.data.label || '') : undefined,
                sectionBriefText: `${buildSectionBriefText(sectionBrief)}${buildSectionBriefText(sectionBrief) && intakeText ? ' | ' : ''}${intakeText}`,
                userConstraints,
                existingNodes: aiNodes,
            });
            parsedData.updatedMindMap = quality.updatedMindMap;
            rejectedNodes = quality.rejectedCount;
            qualitySummary = quality.summary;
        }

        let cleanResponse = parsedData.assistantResponse || "What would you like to explore?";
        let suggestions = parsedData.suggestions || [];

        // V57: Clean up AI reasoning that leaked into response
        // Remove instructional phrases that shouldn't be shown to user
        const stripPatterns = [
            /To add .+?, we need to create new nodes under .+?\./gi,
            /Each new node should have a Class .+? assigned appropriately\./gi,
            /I'll create nodes? .+? under .+?\./gi,
            /Let me add these to the mind map\./gi,
            /Creating nodes? for .+?\./gi,
        ];
        for (const pattern of stripPatterns) {
            cleanResponse = cleanResponse.replace(pattern, '').trim();
        }
        // Clean up multiple spaces/newlines
        cleanResponse = cleanResponse.replace(/\s+/g, ' ').trim();
        if (!cleanResponse) {
            cleanResponse = parsedData.redirectTo
                ? `That request fits better in "${parsedData.redirectTo}".`
                : "Done! I've added those to your mind map.";
        }

        // Clean up suggestions
        suggestions = suggestions
            .filter((s: string) => s && typeof s === 'string')
            .map((s: string) => s.replace(/[\[\]]/g, '').trim())
            .filter((s: string) => s.length > 0 && s.length < 100);

        const activeSectionLabel = currentSectionNode ? String(currentSectionNode.data.label) : undefined;
        const shouldOfferRedirect = !!parsedData.redirectTo &&
            (!activeSectionLabel || parsedData.redirectTo.toLowerCase() !== activeSectionLabel.toLowerCase());

        let proposalId: string | undefined;
        if (
            !shouldOfferRedirect &&
            parsedData.updatedMindMap &&
            parsedData.updatedMindMap.nodes?.length > 0
        ) {
            if (!isFirstTurn && proposalMode) {
                proposalId = createProposal({
                    mapData: parsedData.updatedMindMap,
                    summary: qualitySummary || `Proposed ${parsedData.updatedMindMap.nodes.length} updates`,
                    sectionId: activeSectionId || undefined,
                    source: 'chat',
                });
            } else {
                setMindMapFromJSON(parsedData.updatedMindMap);
            }
        } else if (
            !shouldOfferRedirect &&
            !isFirstTurn &&
            lastUserMsg &&
            !proposalMode &&
            ['instruction', 'radical'].includes(lastIntentRef.current?.type || '')
        ) {
            // V44: Fallback - create node from user message anyway
            const fallbackData = {
                nodes: [{ id: newNodeId, label: lastUserMsg.slice(0, 30), description: lastUserMsg }],
                edges: [{ source: parentId, target: newNodeId }]
            };
            setMindMapFromJSON(fallbackData);
        }

        let nodesAdded = 0;
        if (!shouldOfferRedirect && parsedData.updatedMindMap && parsedData.updatedMindMap.nodes) {
            // Count new nodes that aren't the root
            nodesAdded = parsedData.updatedMindMap.nodes.filter((n) => n.id !== 'root').length;
        }
        if (proposalId) {
            nodesAdded = 0;
        }

        let sectionName = goal || 'Project Overview'; // Fix #15: Default to Goal instead of generic 'Plan'
        if (currentSectionNode) {
            sectionName = String(currentSectionNode.data.label);
        }

        const metadata = {
            nodesAdded: nodesAdded > 0 ? nodesAdded : undefined,
            sectionName,
            redirectTo: shouldOfferRedirect ? parsedData.redirectTo : undefined,
            redirectReason: shouldOfferRedirect ? parsedData.redirectReason : undefined,
            proposalId,
            proposalSummary: proposalId ? (qualitySummary || 'Review suggested updates') : undefined,
            rejectedNodes: rejectedNodes > 0 ? rejectedNodes : undefined,
        };

        if (proposalId) {
            cleanResponse = `${cleanResponse} I prepared a proposal for your approval before applying changes.`;
        }

        addMessage('assistant', cleanResponse, suggestions, metadata);
        setIsLoading(false);
        setLoadingText('');
        setProgress(0);
    }, [
        goal,
        addMessage,
        setMindMapFromJSON,
        sectionBriefs,
        projectIntake,
        userConstraints,
        proposalMode,
        createProposal
    ]);

    // Proactive Greeting Effect (V23: Full context injection)
    useEffect(() => {
        const initChat = async () => {
            if (!hasInitializedRef.current && messages.length === 0 && goal) {
                hasInitializedRef.current = true;

                setIsLoading(true);
                try {
                    // V23: Pass full context to AI
                    const chatHistory: ChatMessage[] = [{ role: 'user', content: `My goal is: "${goal}".` }];
                    const currentMapJSON = getScopedMindMapAsJSON();

                    const response = await aiService.chat(
                        goal,
                        chatHistory,
                        currentMapJSON,
                        undefined,
                        (report: InitProgressReport) => {
                            setLoadingText(report.text);
                            if (report.progress) setProgress(report.progress);
                        }
                    );

                    processAIResponse(response, true);

                } catch (e) {
                    console.error("Proactive greeting failed", e);
                    addMessage('assistant', "I am ready. State your goal constraint.");
                    setIsLoading(false);
                }
            }
        };
        initChat();
    }, [goal, messages.length, addMessage, getScopedMindMapAsJSON, processAIResponse]);

    // V42: Send message with debug logging
    const handleSend = async (textOverride?: string) => {
        const textToSend = typeof textOverride === 'string' ? textOverride : input;

        if (!textToSend.trim() || isLoading) return;

        setInput('');

        const commandResult = runLocalCommand(textToSend);
        const aiText = commandResult.aiText || textToSend;

        // Include Section Context Prefix
        const activeSectionId = useStore.getState().activeSection;
        let prefix = "";
        let visibleText = textToSend;
        if (activeSectionId) {
            const nodes = useStore.getState().nodes;
            const activeNode = nodes.find(n => n.id === activeSectionId);
            if (activeNode) {
                prefix = `[Section: ${activeNode.data.label}] `;
                visibleText = prefix + textToSend;
            }
        }

        addMessage('user', visibleText);

        if (commandResult.handled) {
            return;
        }

        setIsLoading(true);

        // V42: Store last user message for parser (using the un-prefixed one for node generation fallback)
        lastUserMessageRef.current = aiText;
        const intentAnalysis = analyzeChatIntent(
            aiText,
            useStore.getState().nodes as unknown as SectionScopeNode[],
            activeSectionId
        );
        lastIntentRef.current = intentAnalysis;

        if (intentAnalysis.shouldMicroUpdate) {
            try {
                const result = await runInfoMicroUpdates(aiText, intentAnalysis);
                const touched = result.touchedSections.slice(0, 4).join(', ');
                const summaryText = result.addedNodes > 0
                    ? `Integrated that information into ${result.touchedSections.length} section${result.touchedSections.length > 1 ? 's' : ''}${touched ? ` (${touched})` : ''}. Added ${result.addedNodes} focused nodes without regenerating sections.`
                    : `Captured that information. I tagged ${intentAnalysis.impactedSectionLabels.length} relevant section${intentAnalysis.impactedSectionLabels.length > 1 ? 's' : ''} and will use it for subsequent planning updates.`;
                const failureNote = result.failedSections > 0
                    ? ` ${result.failedSections} section update${result.failedSections > 1 ? 's' : ''} failed and can be retried.`
                    : '';

                let conversational = '';
                try {
                    const conversationalPrompt = [
                        'Respond to the user in 1-2 short sentences.',
                        'Answer any direct question they asked.',
                        `User message: ${aiText}`,
                        `System action summary: ${summaryText}${failureNote}`,
                        'Do not output mindmap syntax, nodes, edges, or code blocks.'
                    ].join('\n');
                    const reply = await aiService.chat(
                        goal,
                        [{ role: 'user', content: conversationalPrompt }],
                        getScopedMindMapAsJSON(),
                        undefined,
                        undefined,
                        {
                            forceContextual: true,
                            preEnrichedUserPrompt: true,
                            maxTokens: 220,
                            temperature: 0.45,
                        }
                    );
                    conversational = extractConversationalText(reply);
                } catch {
                    conversational = '';
                }
                const responseText = conversational || `${summaryText}${failureNote}`;

                addMessage('assistant', responseText, [
                    'Anything else to add?',
                    'Show me gaps now',
                    'Prioritize next moves',
                ], {
                    nodesAdded: result.addedNodes > 0 ? result.addedNodes : undefined,
                    sectionName: intentAnalysis.impactedSectionLabels.join(', ') || goal || 'Project',
                });
            } catch (error) {
                console.error('[ChatPanel] info update pipeline failed', error);
                addMessage('assistant', 'I captured your update, but applying section-level improvements failed this time. Try once more.');
            } finally {
                setIsLoading(false);
                setLoadingText('');
                setProgress(0);
            }
            return;
        }

        try {
            // Get messages and cast to ChatMessage[] for AI service
            const chatHistory = getMessagesForAI() as ChatMessage[];

            const activeSection = activeSectionId ? useStore.getState().nodes.find((n) => n.id === activeSectionId) : undefined;
            const sectionBrief = activeSectionId ? sectionBriefs[activeSectionId] : undefined;
            const sectionBriefText = buildSectionBriefText(sectionBrief);
            const sectionBriefDigest = buildSectionBriefDigest(sectionBriefs, activeSectionId);
            const projectIntakeText = buildProjectIntakeText(projectIntake);
            const constraintText = userConstraints.length > 0 ? `Constraints: ${userConstraints.join(' | ')}` : '';
            const scopeTag = intentAnalysis.impactedSectionLabels.length > 0
                ? `Impact Scope: ${intentAnalysis.impactBand} (${intentAnalysis.impactedSectionLabels.join(' | ')})`
                : `Impact Scope: ${intentAnalysis.impactBand}`;
            const enrichedText = [
                prefix ? `[Section: ${String(activeSection?.data.label || '')}]` : '',
                buildIntentPrompt(aiText),
                buildIntentPolicyBlock(intentAnalysis),
                scopeTag,
                projectIntakeText ? `Project Intake: ${projectIntakeText}` : '',
                sectionBriefText ? `Section Brief: ${sectionBriefText}` : '',
                sectionBriefDigest ? `Other section context: ${sectionBriefDigest}` : '',
                constraintText,
            ].filter(Boolean).join('\n');

            if (chatHistory.length > 0 && chatHistory[chatHistory.length - 1]?.role === 'user') {
                chatHistory[chatHistory.length - 1] = { role: 'user', content: enrichedText };
            } else {
                chatHistory.push({ role: 'user', content: enrichedText });
            }

            const currentMapJSON = getScopedMindMapAsJSON();

            const response = await aiService.chat(goal, chatHistory, currentMapJSON, undefined, undefined, {
                preEnrichedUserPrompt: true,
                forceContextual: true,
                maxTokens: intentAnalysis.type === 'question' ? 1250 : intentAnalysis.type === 'radical' ? 1900 : 1500,
                temperature: intentAnalysis.type === 'question' ? 0.48 : intentAnalysis.type === 'radical' ? 0.62 : 0.55,
            });
            processAIResponse(response, false);

        } catch (error) {
            console.error('[ChatPanel] AI Error', error);
            addMessage('assistant', "Sorry, I encountered an error connecting to the AI brain.");
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const visibleThreshold = 6;
    const isHistoryCompressed = messages.length > visibleThreshold;
    const olderMessages = isHistoryCompressed ? messages.slice(0, messages.length - visibleThreshold) : [];
    const recentMessages = isHistoryCompressed ? messages.slice(messages.length - visibleThreshold) : messages;

    return (
        <div className="flex flex-col h-full bg-transparent relative border-r border-white/5">
            {/* Global background handles texture */}

            <div className="p-4 border-b border-white/5 bg-background/80 backdrop-blur-md z-10 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                    <p className="text-xs text-text-muted ml-2">
                        {isIntakeSubmitting
                            ? `Applying intake: ${intakeJob.processed}/${intakeJob.total}`
                            : (isLoading && progress > 0 && progress < 1 ? `Loading Brain: ${(progress * 100).toFixed(0)}%` : "Powered by WebLLM")}
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowIntakeForm((prev) => !prev)}
                            disabled={isIntakeSubmitting}
                            className={clsx(
                                "text-[11px] px-2.5 py-1.5 rounded-full border transition-colors disabled:opacity-50",
                                showIntakeForm
                                    ? "border-blue-400/30 bg-blue-500/10 text-blue-200"
                                    : "border-blue-400/20 bg-transparent text-blue-300/85 hover:bg-blue-500/10"
                            )}
                            title="Open or collapse the project intake card"
                        >
                            {showIntakeForm ? 'Intake Open' : 'Project Intake'}
                        </button>
                        <button
                            onClick={() => setProposalMode(!proposalMode)}
                            className={clsx(
                                "text-[11px] px-2.5 py-1.5 rounded-full border transition-colors",
                                proposalMode
                                    ? "border-amber-400/30 bg-amber-500/10 text-amber-200"
                                    : "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                            )}
                            title={proposalMode ? "AI suggestions require approval" : "AI applies updates immediately"}
                        >
                            {proposalMode ? 'Review Mode' : 'Auto Apply'}
                        </button>
                        <LoginButton />
                        <div className="relative">
                            <ModelSelector />
                        </div>
                    </div>
                </div>
                {(isLoading || isIntakeSubmitting) && (
                    <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                            className={clsx(
                                "h-full transition-all",
                                isIntakeSubmitting ? "bg-blue-400" : "bg-emerald-400 animate-pulse"
                            )}
                            style={{
                                width: isIntakeSubmitting
                                    ? `${intakeJob.total > 0 ? (intakeJob.processed / intakeJob.total) * 100 : 8}%`
                                    : `${progress > 0 && progress <= 1 ? progress * 100 : 30}%`
                            }}
                        />
                    </div>
                )}
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth z-0 relative">
                {showIntakeForm && (
                    <div className="rounded-2xl border border-blue-400/20 bg-blue-500/10 p-4 space-y-3">
                        <p className="text-sm font-semibold text-blue-100">Project Intake</p>
                        <p className="text-xs text-blue-200/85">
                            Provide core project context once. I will pass it to all sections and refresh their nodes.
                        </p>
                        <label className="block text-xs text-blue-100">
                            Objective *
                            <textarea
                                value={intakeObjective}
                                onChange={(e) => setIntakeObjective(e.target.value)}
                                className="mt-1 w-full min-h-[64px] rounded-lg bg-zinc-900/70 border border-zinc-700 px-3 py-2 text-zinc-100 focus:outline-none focus:border-blue-400"
                                placeholder="What are you trying to achieve?"
                            />
                        </label>
                        <label className="block text-xs text-blue-100">
                            Target audience *
                            <input
                                value={intakeAudience}
                                onChange={(e) => setIntakeAudience(e.target.value)}
                                className="mt-1 w-full rounded-lg bg-zinc-900/70 border border-zinc-700 px-3 py-2 text-zinc-100 focus:outline-none focus:border-blue-400"
                                placeholder="Who is this for?"
                            />
                        </label>
                        <label className="block text-xs text-blue-100">
                            Key constraints
                            <input
                                value={intakeConstraints}
                                onChange={(e) => setIntakeConstraints(e.target.value)}
                                className="mt-1 w-full rounded-lg bg-zinc-900/70 border border-zinc-700 px-3 py-2 text-zinc-100 focus:outline-none focus:border-blue-400"
                                placeholder="Budget, timeline, stack, compliance..."
                            />
                        </label>
                        <label className="block text-xs text-blue-100">
                            Success signal
                            <input
                                value={intakeSuccessSignal}
                                onChange={(e) => setIntakeSuccessSignal(e.target.value)}
                                className="mt-1 w-full rounded-lg bg-zinc-900/70 border border-zinc-700 px-3 py-2 text-zinc-100 focus:outline-none focus:border-blue-400"
                                placeholder="How will you know this worked?"
                            />
                        </label>
                        {intakeError && <p className="text-xs text-red-300">{intakeError}</p>}
                        {intakeJob.status !== 'idle' && (
                            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                                <p className="text-xs text-zinc-100 font-medium">
                                    {intakeJob.status === 'running'
                                        ? `Updating section: ${intakeJob.currentSection || 'Preparing...'}`
                                        : intakeJob.status === 'done'
                                            ? `Completed: ${intakeJob.updatedSections}/${intakeJob.total} sections updated`
                                            : 'Update failed'}
                                </p>
                                <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-white/10">
                                    <div
                                        className="h-full bg-blue-400 transition-all"
                                        style={{ width: `${intakeJob.total > 0 ? (intakeJob.processed / intakeJob.total) * 100 : 0}%` }}
                                    />
                                </div>
                                <p className="mt-2 text-[11px] text-zinc-300">
                                    Processed {intakeJob.processed}/{intakeJob.total} • Added {intakeJob.addedNodes} nodes
                                </p>
                            </div>
                        )}
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleProjectIntakeSubmit}
                                disabled={isIntakeSubmitting || isLoading}
                                className="inline-flex items-center gap-2 rounded-lg bg-blue-500 hover:bg-blue-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                            >
                                {(isIntakeSubmitting || isLoading) && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                Apply To Sections
                            </button>
                            <button
                                onClick={() => setShowIntakeForm(false)}
                                disabled={isIntakeSubmitting}
                                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10 disabled:opacity-50"
                            >
                                {isIntakeSubmitting ? 'Working...' : 'Later'}
                            </button>
                        </div>
                    </div>
                )}
                {isHistoryCompressed && (
                    <div className="flex justify-center pb-2">
                        <button
                            onClick={() => setHistoryExpanded(!historyExpanded)}
                            className="text-xs bg-white/5 hover:bg-white/10 text-text-muted px-4 py-2 rounded-full transition-colors flex items-center gap-2 border border-white/5"
                        >
                            {historyExpanded ? '↓ Hide earlier conversation' : `↑ Earlier conversation (${olderMessages.length} messages)`}
                        </button>
                    </div>
                )}
                <AnimatePresence>
                    {historyExpanded && olderMessages.map((msg) => (
                        <motion.div
                            key={msg.id}
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={clsx(
                                "flex flex-col gap-2 max-w-[90%]",
                                msg.role === 'user' ? "ml-auto items-end" : "mr-auto items-start"
                            )}
                        >
                            <div className={clsx(
                                "flex gap-3",
                                msg.role === 'user' ? "flex-row-reverse" : "flex-row"
                            )}>
                                <div className={clsx(
                                    "w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm glass",
                                    msg.role === 'user'
                                        ? "text-primary"
                                        : "text-text-muted"
                                )}>
                                    {msg.role === 'user' ? <UserIcon size={14} /> : <Bot size={14} />}
                                </div>
                                <div className={clsx(
                                    "flex-1 px-4 py-3 text-sm leading-relaxed rounded-2xl shadow-sm border opacity-70",
                                    msg.role === 'user'
                                        ? "bg-primary/50 text-white/80 border-transparent rounded-tr-sm"
                                        : "glass border-white/5 text-text-muted rounded-tl-sm"
                                )}>
                                    {msg.role === 'assistant' ? <CollapsibleMessage content={msg.content} /> : msg.content}
                                </div>
                            </div>
                        </motion.div>
                    ))}

                    {recentMessages.map((msg) => (
                        <motion.div
                            key={msg.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={clsx(
                                "flex flex-col gap-2 max-w-[90%]",
                                msg.role === 'user' ? "ml-auto items-end" : "mr-auto items-start"
                            )}
                        >
                            <div className={clsx(
                                "flex gap-3",
                                msg.role === 'user' ? "flex-row-reverse" : "flex-row"
                            )}>
                                <div className={clsx(
                                    "w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm glass",
                                    msg.role === 'user'
                                        ? "text-primary"
                                        : "text-text-muted"
                                )}>
                                    {msg.role === 'user' ? <UserIcon size={14} /> : <Bot size={14} />}
                                </div>
                                <div className={clsx(
                                    "flex-1 px-4 py-3 text-sm leading-relaxed rounded-2xl shadow-sm border",
                                    msg.role === 'user'
                                        ? "bg-primary text-white border-transparent rounded-tr-sm shadow-[0_4px_14px_0_rgba(43,140,238,0.39)]"
                                        : "glass border-white/5 text-text-main dark:text-surface-light rounded-tl-sm shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]"
                                )}>
                                    {msg.role === 'assistant' ? <CollapsibleMessage content={msg.content} /> : msg.content}

                                    {/* Map Updated Indicator */}
                                    {msg.role === 'assistant' && msg.metadata?.nodesAdded && (
                                        <div className="mt-3 flex items-center gap-2 text-xs text-text-muted bg-white/5 rounded-full px-3 py-1.5 w-fit border border-white/10 select-none">
                                            <span>📍</span>
                                            <span className="font-medium text-white/80">{msg.metadata.nodesAdded} nodes added to {msg.metadata.sectionName}</span>
                                        </div>
                                    )}

                                    {/* Redirect UI */}
                                    {msg.role === 'assistant' && msg.metadata?.redirectTo && (
                                        <div className="mt-3 flex flex-col gap-2 p-3 rounded-xl border border-blue-500/20 bg-blue-500/5">
                                            <p className="text-sm font-medium text-blue-400">
                                                That sounds like it belongs in your <span className="font-bold">{msg.metadata.redirectTo}</span> section.
                                            </p>
                                            {msg.metadata.redirectReason && (
                                                <p className="text-xs text-blue-200/80">
                                                    {msg.metadata.redirectReason}
                                                </p>
                                            )}
                                            <button
                                                onClick={() => {
                                                    const targetName = msg.metadata?.redirectTo || '';
                                                    const nodes = useStore.getState().nodes;
                                                    const targetNode = nodes.find(n =>
                                                        (n.data.nodeClass === 'section' || n.type === 'section') &&
                                                        String(n.data.label).toLowerCase() === targetName.toLowerCase()
                                                    );
                                                    if (targetNode) {
                                                        useStore.getState().setActiveSection(targetNode.id);
                                                    } else {
                                                        // Inform AI failed or redirect is invalid
                                                        addMessage('system', `Could not find section "${targetName}"`);
                                                    }
                                                }}
                                                className="text-xs bg-blue-500 text-white rounded-lg px-3 py-2 w-fit font-medium hover:bg-blue-600 transition-colors shadow-lg shadow-blue-500/20"
                                            >
                                                Switch to {msg.metadata.redirectTo}
                                            </button>
                                        </div>
                                    )}

                                    {msg.role === 'assistant' && msg.metadata?.proposalId && (() => {
                                        const proposal = proposals[msg.metadata?.proposalId || ''];
                                        if (!proposal) return null;

                                        return (
                                            <div className="mt-3 flex flex-col gap-2 p-3 rounded-xl border border-amber-500/30 bg-amber-500/10">
                                                <p className="text-xs text-amber-100">{msg.metadata?.proposalSummary || 'Review suggested updates.'}</p>
                                                {typeof msg.metadata?.rejectedNodes === 'number' && msg.metadata.rejectedNodes > 0 && (
                                                    <p className="text-[11px] text-amber-200/80">
                                                        Filtered out {msg.metadata.rejectedNodes} low-quality nodes.
                                                    </p>
                                                )}
                                                {proposal.status === 'pending' ? (
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => approveProposal(proposal.id)}
                                                            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600"
                                                        >
                                                            <Check className="w-3 h-3" />
                                                            Approve
                                                        </button>
                                                        <button
                                                            onClick={() => rejectProposal(proposal.id)}
                                                            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600"
                                                        >
                                                            <X className="w-3 h-3" />
                                                            Reject
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <p className={clsx(
                                                        "text-[11px] font-medium",
                                                        proposal.status === 'approved' ? "text-emerald-200" : "text-red-200"
                                                    )}>
                                                        Proposal {proposal.status}.
                                                    </p>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>

                            {/* Suggestion Chips */}
                            {msg.role === 'assistant' && msg.options && msg.options.length > 0 && (
                                <div className="flex flex-wrap gap-2 ml-11 mt-1">
                                    {msg.options.map((option, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => handleSend(option)}
                                            disabled={isLoading}
                                            className="px-3 py-1.5 text-xs neumorphic-btn border border-transparent hover:border-primary/20 rounded-full transition-all active:scale-95 disabled:opacity-50"
                                        >
                                            {option}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </motion.div>
                    ))}
                    {isLoading && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="flex gap-3 mr-auto max-w-[90%]"
                        >
                            <div className="w-8 h-8 rounded-full glass flex items-center justify-center shrink-0">
                                <Bot size={14} className="text-text-muted" />
                            </div>
                            <div className="stone-node p-4 rounded-2xl rounded-tl-none flex items-center gap-2 text-text-muted text-sm px-6">
                                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                                {progress > 0 && progress < 1 ? loadingText : "Thinking..."}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <div className="p-4 bg-background border-t border-white/5 z-10 shrink-0">
                <div className="w-full max-w-4xl mx-auto flex gap-2 items-end">
                    <div className="input-groove flex-1 rounded-2xl p-2 pl-4 flex flex-col border border-white/5 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/50 transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.2)]">
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Type a message or add to your plan..."
                            className="w-full bg-transparent border-none text-text-main dark:text-surface-light placeholder:text-text-muted/50 resize-none focus:outline-none focus:ring-0 min-h-[44px] max-h-[200px] overflow-y-auto py-3"
                            rows={1}
                        />
                    </div>
                    <button
                        onClick={() => handleSend()}
                        disabled={!input.trim() || isLoading}
                        className={clsx(
                            "p-3 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 shadow-lg",
                            !input.trim() || isLoading
                                ? "bg-background-dark text-text-muted border border-white/5 shadow-none"
                                : "bg-primary text-white hover:bg-blue-500 hover:scale-105 active:scale-95 shadow-[0_4px_14px_0_rgba(43,140,238,0.39)]"
                        )}
                    >
                        {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                    </button>
                </div>
            </div>
        </div>
    );
}
