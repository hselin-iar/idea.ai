'use client';

import {
    ReactFlow,
    Controls,
    Background,
    MiniMap,
    useReactFlow,
    Panel,
    BackgroundVariant,
    Edge,
    Connection,
    getNodesBounds,
    getViewportForBounds,
} from '@xyflow/react';
import { toPng } from 'html-to-image';
import { Download, Undo2, Redo2 } from 'lucide-react';
import ExpandableNode from './ExpandableNode';
import QuestionNode from './QuestionNode';
import ChecklistNode from './ChecklistNode';
import MetricNode from './MetricNode';
import SectionNode from './SectionNode'; // New Phase B component
import ImageNode from './ImageNode';
import DecisionNode from './DecisionNode';
import TradeoffNode from './TradeoffNode';
import '@xyflow/react/dist/style.css';
import { useStore } from '@/lib/store';
import { useForceLayout } from '@/hooks/useForceLayout';
import SectionBreadcrumb from '../Navigation/SectionBreadcrumb'; // New Phase B component
import SectionBriefPanel from '../Navigation/SectionBriefPanel';
import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { aiService, ChatMessage, MindMapNode, parseAIResponse } from '@/services/ai';
import { applyQualityGate } from '@/lib/aiQuality';
import type { ProjectIntake, SectionBrief } from '@/lib/store';
import { optimizeSectionGraph } from '@/lib/sectionOptimizer';

const nodeTypes = {
    expandable: ExpandableNode,
    question: QuestionNode,
    checklist: ChecklistNode,
    metric: MetricNode,
    section: SectionNode,
    image: ImageNode,
    decision: DecisionNode,
    tradeoff: TradeoffNode,
};

function buildSectionBriefText(brief?: SectionBrief): string {
    if (!brief) return '';
    return [
        `Focus: ${brief.focus}`,
        `Must include: ${brief.mustInclude}`
    ].filter((line) => !line.endsWith(': ')).join(' | ');
}

function buildProjectIntakeText(intake?: ProjectIntake | null): string {
    if (!intake) return '';
    return [
        `Objective: ${intake.objective}`,
        `Target audience: ${intake.targetAudience}`,
        `Constraints: ${intake.constraints}`,
        `Success signal: ${intake.successSignal}`,
    ].filter((line) => !line.endsWith(': ')).join(' | ');
}

function TopRightControls({
    prepareForExport,
}: {
    prepareForExport: () => Promise<() => void>;
}) {
    const undo = useStore((state) => state.undo);
    const redo = useStore((state) => state.redo);
    const past = useStore((state) => state.past);
    const future = useStore((state) => state.future);
    const allNodes = useStore((state) => state.nodes);
    const [isExporting, setIsExporting] = useState(false);

    const onExportClick = async () => {
        const viewportElement = document.querySelector('.react-flow__viewport') as HTMLElement | null;
        if (!viewportElement || allNodes.length === 0 || isExporting) return;

        let cleanupExportContext: (() => void) | null = null;

        try {
            setIsExporting(true);
            cleanupExportContext = await prepareForExport();

            const bounds = getNodesBounds(allNodes);
            const imageWidth = Math.max(2400, Math.min(9000, Math.ceil(bounds.width + 520)));
            const imageHeight = Math.max(1400, Math.min(7000, Math.ceil(bounds.height + 520)));
            const viewport = getViewportForBounds(bounds, imageWidth, imageHeight, 0.16, 2, 0.05);

            const dataUrl = await toPng(viewportElement, {
                backgroundColor: '#09090b',
                width: imageWidth,
                height: imageHeight,
                style: {
                    width: `${imageWidth}px`,
                    height: `${imageHeight}px`,
                    transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
                },
                cacheBust: true,
            });
            const a = document.createElement('a');
            a.setAttribute('download', 'idea-ai-mindmap.png');
            a.setAttribute('href', dataUrl);
            a.click();
        } catch (err) {
            console.error("Failed to export image", err);
        } finally {
            cleanupExportContext?.();
            setIsExporting(false);
        }
    };

    return (
        <Panel position="top-right" className="flex items-center gap-2">
            <div className="flex bg-background/80 backdrop-blur-md border border-white/5 shadow-neumorphic-dark rounded-xl overflow-hidden p-1">
                <button
                    className={`p-2 rounded-lg transition-all ${past.length === 0 ? 'text-white/20 cursor-not-allowed' : 'text-text-muted hover:text-primary hover:bg-primary/10'}`}
                    onClick={() => past.length > 0 && undo()}
                    disabled={past.length === 0}
                    title="Undo (Cmd+Z)"
                >
                    <Undo2 size={16} />
                </button>
                <button
                    className={`p-2 rounded-lg transition-all ${future.length === 0 ? 'text-white/20 cursor-not-allowed' : 'text-text-muted hover:text-primary hover:bg-primary/10'}`}
                    onClick={() => future.length > 0 && redo()}
                    disabled={future.length === 0}
                    title="Redo (Cmd+Y)"
                >
                    <Redo2 size={16} />
                </button>
            </div>
            <button
                className="flex items-center gap-2 neumorphic-btn px-4 py-2.5 rounded-xl text-text-muted hover:text-primary transition-all font-medium text-sm border border-transparent hover:border-white/20 bg-background/80 backdrop-blur-md"
                onClick={onExportClick}
                title="Export map as PNG"
                disabled={isExporting}
            >
                <Download size={16} />
                {isExporting ? 'Exporting...' : 'Export PNG'}
            </button>
        </Panel>
    );
}

export default function MindMapBoard() {
    const nodes = useStore((state) => state.nodes);
    const edges = useStore((state) => state.edges);
    const onNodesChange = useStore((state) => state.onNodesChange);
    const onEdgesChange = useStore((state) => state.onEdgesChange);
    const onConnect = useStore((state) => state.onConnect);
    const setNodes = useStore((state) => state.setNodes);
    const setEdges = useStore((state) => state.setEdges);
    const pushToHistory = useStore((state) => state.pushToHistory);
    const activeSection = useStore((state) => state.activeSection);
    const reconnectEdge = useStore((state) => state.reconnectEdge);
    const removeEdge = useStore((state) => state.removeEdge);
    const undo = useStore((state) => state.undo);
    const redo = useStore((state) => state.redo);
    const goal = useStore((state) => state.goal);
    const sectionBriefs = useStore((state) => state.sectionBriefs);
    const sectionBriefDraftFor = useStore((state) => state.sectionBriefDraftFor);
    const setSectionBrief = useStore((state) => state.setSectionBrief);
    const closeSectionBriefDraft = useStore((state) => state.closeSectionBriefDraft);
    const setSectionBriefDismissed = useStore((state) => state.setSectionBriefDismissed);
    const sectionLoadingIds = useStore((state) => state.sectionLoadingIds);
    const setSectionLoading = useStore((state) => state.setSectionLoading);
    const getScopedMindMapAsJSONForSection = useStore((state) => state.getScopedMindMapAsJSONForSection);
    const setMindMapFromJSON = useStore((state) => state.setMindMapFromJSON);
    const getMessagesForAI = useStore((state) => state.getMessagesForAI);
    const userConstraints = useStore((state) => state.userConstraints);
    const projectIntake = useStore((state) => state.projectIntake);
    const addMessage = useStore((state) => state.addMessage);
    const [isFullView, setIsFullView] = useState(false);
    const [isBriefSubmitting, setIsBriefSubmitting] = useState(false);
    const [isOptimizingSection, setIsOptimizingSection] = useState(false);
    const [sectionUpdateJob, setSectionUpdateJob] = useState<{
        running: boolean;
        total: number;
        processed: number;
        current: string;
    }>({
        running: false,
        total: 0,
        processed: 0,
        current: '',
    });
    const lastAutoFitRef = useRef(0);

    // Filter nodes based on activeSection
    const { visibleNodes, visibleEdges } = useMemo(() => {
        // Fix #10: In Full View, show ALL nodes unconditionally
        if (isFullView) {
            return { visibleNodes: nodes, visibleEdges: edges };
        }

        if (!activeSection) {
            // OVERVIEW MODE: Show only Root (goal) and top-level Sections.
            const sectionNodeIds = nodes.filter(n => n.data.nodeClass === 'section' || n.type === 'section').map(n => n.id);
            const overviewNodes = nodes.filter(n =>
                n.data.nodeClass === 'goal' || sectionNodeIds.includes(n.id)
            );

            // Only show edges connecting to the overview nodes
            const overviewEdges = edges.filter(e =>
                overviewNodes.some(n => n.id === e.source) && overviewNodes.some(n => n.id === e.target)
            );

            return { visibleNodes: overviewNodes, visibleEdges: overviewEdges };
        }

        // SECTION MODE: Show the open Section node + all descendants
        const sectionDescendantIds = new Set<string>();
        const nodeById = new Map(nodes.map((node) => [node.id, node]));
        const adjacency = new Map<string, string[]>();
        edges.forEach((edge) => {
            const children = adjacency.get(edge.source) || [];
            children.push(edge.target);
            adjacency.set(edge.source, children);
        });
        const queue = [activeSection];

        while (queue.length > 0) {
            const current = queue.shift()!;
            if (sectionDescendantIds.has(current)) continue;
            sectionDescendantIds.add(current);
            const children = adjacency.get(current) || [];
            for (const child of children) {
                const childNode = nodeById.get(child);
                const isGoal = childNode?.data.nodeClass === 'goal';
                const isOtherSection = (childNode?.data.nodeClass === 'section' || childNode?.type === 'section') && child !== activeSection;
                if (!isGoal && !isOtherSection && !sectionDescendantIds.has(child)) {
                    queue.push(child);
                }
            }
        }

        // Include goal node for global context reference even in section mode
        const sectionNodes = nodes.filter(n => sectionDescendantIds.has(n.id) || n.data.nodeClass === 'goal');
        const sectionEdges = edges.filter(e => sectionDescendantIds.has(e.source) && sectionDescendantIds.has(e.target));

        return { visibleNodes: sectionNodes, visibleEdges: sectionEdges };
    }, [nodes, edges, activeSection, isFullView]);

    // Activate force layout, scoped ONLY to the visible elements to save CPU
    useForceLayout(visibleNodes, visibleEdges);

    // Get react flow instance to trigger fitView programmatically
    const reactFlowInstance = useReactFlow();

    const prepareFullMapExport = useCallback(async () => {
        const wasFullView = isFullView;

        if (!wasFullView) {
            setIsFullView(true);
            await new Promise<void>((resolve) => {
                requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
            });
        }

        reactFlowInstance.fitView({ padding: 0.2, duration: 0 });
        await new Promise((resolve) => window.setTimeout(resolve, 90));

        return () => {
            if (!wasFullView) {
                setIsFullView(false);
                window.setTimeout(() => {
                    reactFlowInstance.fitView({ padding: 0.2, duration: 250 });
                }, 60);
            }
        };
    }, [isFullView, reactFlowInstance]);

    // Undo/Redo keyboard shortcuts (Fix #38)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Check for Cmd (Mac) or Ctrl (Windows/Linux)
            const isModifier = e.metaKey || e.ctrlKey;

            if (isModifier) {
                if (e.key === 'z') {
                    if (e.shiftKey) {
                        redo(); // Cmd+Shift+Z
                        e.preventDefault();
                    } else {
                        undo(); // Cmd+Z
                        e.preventDefault();
                    }
                } else if (e.key === 'y') {
                    redo(); // Cmd+Y
                    e.preventDefault();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [undo, redo]);

    useEffect(() => {
        if (!activeSection && sectionBriefDraftFor) {
            closeSectionBriefDraft();
        }
    }, [activeSection, sectionBriefDraftFor, closeSectionBriefDraft]);

    // Auto fit-view when new nodes appear (Fix #1, #2, #19)
    useEffect(() => {
        if (visibleNodes.length > 0) {
            const now = Date.now();
            if (now - lastAutoFitRef.current < 1100) return;
            lastAutoFitRef.current = now;
            const timer = setTimeout(() => {
                reactFlowInstance.fitView({ padding: 0.2, duration: 800 });
            }, 300); // Give the D3 layout a fraction of a second to spread nodes before zooming
            return () => clearTimeout(timer);
        }
    }, [visibleNodes.length, reactFlowInstance]);

    // V48: Handle edge reconnection (dragging edge to new target or to empty = delete)
    const onReconnect = (oldEdge: Edge, newConnection: Connection) => {
        // If new connection has valid source and target, reconnect
        if (newConnection.source && newConnection.target) {
            reconnectEdge(oldEdge.id, newConnection.source, newConnection.target);
        }
    };

    // V48: Delete edge when dragged to empty space
    const onReconnectEnd = (_: unknown, edge: Edge, handleType: string | null) => {
        // If handleType is undefined, the edge was dropped in empty space - delete it
        if (!handleType) {
            removeEdge(edge.id);
        }
    };

    const runSectionUpdateFromBrief = useCallback(async (
        targetSectionId: string,
        sectionLabel: string,
        briefText: string,
        source: 'brief' | 'background'
    ) => {
        const currentNodes = useStore.getState().nodes;
        const allBriefs = useStore.getState().sectionBriefs;
        const crossSectionBriefs = Object.values(allBriefs)
            .filter((brief) => brief.sectionId !== targetSectionId)
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, 4)
            .map((brief) => `${brief.sectionLabel}: focus=${brief.focus}${brief.mustInclude ? `, must=${brief.mustInclude}` : ''}`)
            .join(' | ');
        const aiNodes: MindMapNode[] = currentNodes.map((node) => ({
            id: node.id,
            label: String(node.data.label || ''),
            description: String(node.data.description || ''),
            nodeClass: ((node.data.nodeClass as MindMapNode['nodeClass']) || 'idea'),
            nodeType: (typeof node.type === 'string' ? node.type : 'expandable') as MindMapNode['nodeType'],
            items: Array.isArray(node.data.items) ? node.data.items as { id: string; text: string; completed: boolean }[] : undefined,
        }));
        const intakeText = buildProjectIntakeText(projectIntake);
        const sectionPrompt = [
            `[Section: ${sectionLabel}]`,
            `Use this section brief to update only this section with high-impact nodes.`,
            `Section Brief: ${briefText}`,
            crossSectionBriefs ? `Other sections context: ${crossSectionBriefs}` : '',
            intakeText ? `Project Intake: ${intakeText}` : '',
            userConstraints.length > 0 ? `Global Constraints: ${userConstraints.join(' | ')}` : '',
            source === 'background'
                ? 'Create 3-5 meaningful improvements and include at least one concrete execution node.'
                : 'Create 7-12 concrete, relevant nodes; avoid redundancy and fill obvious section gaps.'
            ,
            'When suitable, include at least one question, decision, or tradeoff node.'
        ].filter(Boolean).join('\n');

        const history = (getMessagesForAI() as ChatMessage[]).slice(-3);
        const chatHistory: ChatMessage[] = [...history, { role: 'user', content: sectionPrompt }];
        const response = await aiService.chat(
            goal,
            chatHistory,
            getScopedMindMapAsJSONForSection(targetSectionId),
            undefined,
            undefined,
            {
                forceContextual: true,
                preEnrichedUserPrompt: true,
                maxTokens: source === 'background' ? 840 : 1300,
                temperature: source === 'background' ? 0.54 : 0.6,
            }
        );

        const parsed = parseAIResponse(
            response,
            goal,
            aiNodes,
            `brief_${Date.now()}`,
            targetSectionId,
            sectionPrompt
        );

        if (parsed.redirectTo) return 0;
        const quality = applyQualityGate(parsed.updatedMindMap, {
            goal,
            userPrompt: sectionPrompt,
            sectionLabel,
            sectionBriefText: `${briefText}${briefText && intakeText ? ' | ' : ''}${intakeText}`,
            userConstraints,
            existingNodes: aiNodes,
        });

        if (quality.updatedMindMap.nodes.length > 0) {
            setMindMapFromJSON(quality.updatedMindMap);
            if (source !== 'background') {
                addMessage('assistant', `Updated ${sectionLabel} using your section brief.`);
            }
        } else if (source !== 'background') {
            addMessage('assistant', `I need a bit more detail to improve ${sectionLabel}.`);
        }
        return quality.updatedMindMap.nodes.length;
    }, [
        goal,
        userConstraints,
        projectIntake,
        getMessagesForAI,
        getScopedMindMapAsJSONForSection,
        setMindMapFromJSON,
        addMessage
    ]);

    const handleBriefSubmit = useCallback(async (payload: {
        sectionLabel: string;
        focus: string;
        mustInclude: string;
    }) => {
        if (!sectionBriefDraftFor) return;
        setIsBriefSubmitting(true);
        setSectionBrief(sectionBriefDraftFor, payload);
        const targetSectionId = sectionBriefDraftFor;
        const briefText = buildSectionBriefText({
            sectionId: targetSectionId,
            sectionLabel: payload.sectionLabel,
            focus: payload.focus,
            mustInclude: payload.mustInclude,
            updatedAt: Date.now(),
        });

        // Close immediately so user can continue navigating while updates run.
        closeSectionBriefDraft();
        setIsBriefSubmitting(false);

        const sectionNodes = nodes.filter((node) =>
            (node.data.nodeClass === 'section' || node.type === 'section') &&
            node.id !== targetSectionId
        );
        const scoreText = `${payload.focus} ${payload.mustInclude}`.toLowerCase();
        const relatedSections = sectionNodes
            .map((node) => ({
                id: node.id,
                label: String(node.data.label || ''),
                score: String(node.data.label || '').toLowerCase().split(/\s+/).reduce((acc, token) => {
                    return acc + (token.length > 2 && scoreText.includes(token) ? 1 : 0);
                }, 0)
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 3)
            .filter((entry) => entry.score > 0);

        const queue = [{ id: targetSectionId, label: payload.sectionLabel, source: 'brief' as const }, ...relatedSections.map((entry) => ({
            id: entry.id,
            label: entry.label,
            source: 'background' as const,
        }))];

        setSectionUpdateJob({
            running: true,
            total: queue.length,
            processed: 0,
            current: queue[0]?.label || '',
        });

        void (async () => {
            let processed = 0;
            let totalAdded = 0;
            let failed = 0;
            try {
                for (const entry of queue) {
                    setSectionLoading(entry.id, true);
                    setSectionUpdateJob((prev) => ({
                        ...prev,
                        current: entry.label,
                    }));
                    try {
                        const added = await runSectionUpdateFromBrief(entry.id, entry.label, briefText, entry.source);
                        totalAdded += added;
                    } catch (error) {
                        failed += 1;
                        console.error(`[SectionBrief] update failed for ${entry.label}`, error);
                    } finally {
                        processed += 1;
                        setSectionLoading(entry.id, false);
                        setSectionUpdateJob((prev) => ({
                            ...prev,
                            processed,
                        }));
                    }
                    await new Promise((resolve) => window.setTimeout(resolve, 0));
                }
                addMessage(
                    'assistant',
                    `Background section updates completed. Processed ${queue.length} sections, added ${totalAdded} nodes${failed > 0 ? `, failed ${failed}` : ''}.`
                );
            } catch (error) {
                console.error('[SectionBrief] background update failed', error);
                addMessage('assistant', 'Section background update failed. You can retry from the section info button.');
            } finally {
                window.setTimeout(() => {
                    setSectionUpdateJob({
                        running: false,
                        total: 0,
                        processed: 0,
                        current: '',
                    });
                }, 500);
            }
        })();
    }, [
        sectionBriefDraftFor,
        setSectionBrief,
        closeSectionBriefDraft,
        runSectionUpdateFromBrief,
        nodes,
        setSectionLoading,
        addMessage
    ]);

    const sectionDraftNode = sectionBriefDraftFor
        ? nodes.find((node) => node.id === sectionBriefDraftFor)
        : null;

    const handleOptimizeSection = useCallback(async () => {
        if (!activeSection || isOptimizingSection) return;
        setIsOptimizingSection(true);
        setSectionLoading(activeSection, true);

        try {
            await new Promise((resolve) => window.setTimeout(resolve, 16));
            const currentState = useStore.getState();
            const sectionNode = currentState.nodes.find((node) => node.id === activeSection);
            const sectionLabel = String(sectionNode?.data.label || 'Section');
            const sectionEdgeTargets = new Set(
                currentState.edges
                    .filter((edge) => edge.source === activeSection)
                    .map((edge) => edge.target)
            );
            const sectionSizeHint = Math.max(1, sectionEdgeTargets.size);
            const optimizeMaxTokens = sectionSizeHint > 18 ? 1500 : 1850;

            const result = optimizeSectionGraph(currentState.nodes, currentState.edges, activeSection);
            let totalAddedFromAI = 0;

            if (result.changed) {
                pushToHistory();
                setNodes(result.nodes);
                setEdges(result.edges);
                await new Promise((resolve) => window.setTimeout(resolve, 0));
            }

            // Deeper pass: ask AI to fill gaps and upgrade node quality after structural cleanup.
            const refreshedNodes = useStore.getState().nodes;
            const aiNodes: MindMapNode[] = refreshedNodes.map((node) => ({
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

            const optimizePrompt = [
                `[Section: ${sectionLabel}]`,
                'Optimize this section deeply.',
                '1) Keep all important information.',
                '2) Only remove nodes when redundancy is very high-confidence; otherwise merge, retype, or rewrite.',
                '3) Improve weak descriptions into concrete language.',
                '4) Add 6-12 missing high-impact nodes if the section has gaps.',
                '5) Include at least one decision or tradeoff node when useful.',
                '6) Add checklist/metric nodes when execution or measurement is missing.',
                '7) Avoid generic placeholders.'
            ].join('\n');
            const history = (getMessagesForAI() as ChatMessage[]).slice(-4);
            const response = await aiService.chat(
                goal,
                [...history, { role: 'user', content: optimizePrompt }],
                getScopedMindMapAsJSONForSection(activeSection),
                undefined,
                undefined,
                {
                    forceContextual: true,
                    preEnrichedUserPrompt: true,
                    maxTokens: optimizeMaxTokens,
                    temperature: 0.58,
                }
            );

            const parsed = parseAIResponse(
                response,
                goal,
                aiNodes,
                `opt_${Date.now()}`,
                activeSection,
                optimizePrompt
            );

            if (!parsed.redirectTo) {
                const quality = applyQualityGate(parsed.updatedMindMap, {
                    goal,
                    userPrompt: optimizePrompt,
                    sectionLabel,
                    sectionBriefText: buildSectionBriefText(sectionBriefs[activeSection]),
                    userConstraints,
                    existingNodes: aiNodes,
                });
                if (quality.updatedMindMap.nodes.length > 0) {
                    setMindMapFromJSON(quality.updatedMindMap);
                    totalAddedFromAI = quality.updatedMindMap.nodes.length;
                }
            }

            if (!result.changed && totalAddedFromAI === 0) {
                addMessage('assistant', 'Section is already tight. No meaningful optimization changes found.');
                return;
            }
            addMessage(
                'assistant',
                `Section optimized: merged ${result.summary.merged}, converted ${result.summary.converted}, removed ${result.summary.removed}, compacted ${result.summary.collapsed}, repositioned ${result.summary.repositioned}, added ${totalAddedFromAI} new nodes.`
            );

            window.setTimeout(() => {
                reactFlowInstance.fitView({ padding: 0.2, duration: 350 });
            }, 80);
        } catch (error) {
            console.error('[SectionOptimize] failed', error);
            addMessage('assistant', 'Section optimization failed. Try again in a moment.');
        } finally {
            setIsOptimizingSection(false);
            setSectionLoading(activeSection, false);
        }
    }, [
        activeSection,
        isOptimizingSection,
        addMessage,
        pushToHistory,
        setNodes,
        setEdges,
        reactFlowInstance,
        setSectionLoading,
        getMessagesForAI,
        goal,
        getScopedMindMapAsJSONForSection,
        userConstraints,
        sectionBriefs,
        setMindMapFromJSON
    ]);

    const activeBackgroundLoads = Object.keys(sectionLoadingIds).length;
    const isActiveSectionBusy = !!(activeSection && sectionLoadingIds[activeSection]);
    const sectionProgress = sectionUpdateJob.total > 0
        ? (sectionUpdateJob.processed / sectionUpdateJob.total) * 100
        : 0;

    return (
        <div className="w-full h-full bg-transparent relative selection:bg-primary/30">
            {/* Phase B: Breadcrumb overlay */}
            <SectionBreadcrumb
                isFullView={isFullView}
                setIsFullView={setIsFullView}
                onOptimizeSection={handleOptimizeSection}
                isOptimizingSection={isOptimizingSection || isActiveSectionBusy}
            />

            {(sectionUpdateJob.running || activeBackgroundLoads > 0) && (
                <div className="absolute top-0 left-0 right-0 z-[130]">
                    <div className="h-1 w-full bg-white/10">
                        <div
                            className="h-full bg-emerald-400 transition-all"
                            style={{ width: `${Math.max(8, sectionProgress)}%` }}
                        />
                    </div>
                    <div className="px-4 py-1 text-[11px] text-emerald-200/90 bg-black/25 backdrop-blur-sm">
                        {sectionUpdateJob.running
                            ? `Updating sections in background: ${sectionUpdateJob.processed}/${sectionUpdateJob.total} (${sectionUpdateJob.current || 'working...'})`
                            : `${activeBackgroundLoads} section update${activeBackgroundLoads > 1 ? 's' : ''} in progress`}
                    </div>
                </div>
            )}

            {sectionBriefDraftFor && sectionDraftNode && (
                <SectionBriefPanel
                    key={sectionBriefDraftFor}
                    sectionLabel={String(sectionDraftNode.data.label || 'Section')}
                    initialBrief={sectionBriefs[sectionBriefDraftFor]}
                    isSubmitting={isBriefSubmitting}
                    onClose={() => {
                        setSectionBriefDismissed(sectionBriefDraftFor, true);
                        closeSectionBriefDraft();
                    }}
                    onSkip={() => {
                        setSectionBriefDismissed(sectionBriefDraftFor, true);
                        closeSectionBriefDraft();
                    }}
                    onSubmit={handleBriefSubmit}
                />
            )}

            <div className="absolute inset-0 z-10 pt-16">
                <ReactFlow
                    nodes={visibleNodes}
                    edges={visibleEdges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onReconnect={onReconnect}
                    onReconnectEnd={onReconnectEnd}
                    nodeTypes={nodeTypes}
                    colorMode="dark"
                    fitView
                    minZoom={0.03}
                    maxZoom={2.8}
                    edgesReconnectable={true}
                    defaultEdgeOptions={{
                        type: 'bezier',
                        animated: false, // Fix #7 - noisy marching ants
                        style: { strokeWidth: 2, stroke: 'rgba(230, 226, 221, 0.5)' } // Fix #9 - edge legibility
                    }}
                    className="bg-transparent"
                >
                    <Controls className="!bg-background/80 !backdrop-blur-md !border-white/5 !text-text-muted shadow-neumorphic-dark rounded-xl overflow-hidden [&>button]:!border-b-white/5 hover:[&>button]:!bg-primary/10 hover:[&>button]:!text-primary" />
                    <MiniMap
                        className="!bg-background/80 !backdrop-blur-md !border-white/5 !rounded-xl shadow-neumorphic-dark"
                        maskColor="rgba(42, 40, 38, 0.8)"
                        nodeColor="#2b8cee"
                    />
                    <Background
                        color="#75716b"
                        gap={20}
                        size={1}
                        variant={BackgroundVariant.Dots}
                        className="opacity-40" // Fix #18 - canvas too dark
                    />
                    <TopRightControls prepareForExport={prepareFullMapExport} />
                </ReactFlow>
            </div>
        </div>
    );
}
