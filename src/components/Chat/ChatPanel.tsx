'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Bot, User as UserIcon, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@/lib/store';
import { aiService, parseAIResponse, ChatMessage, ParsedAIResponse, MindMapNode } from '@/services/ai';
import { InitProgressReport } from '@mlc-ai/web-llm';
import ModelSelector from '@/components/ModelSelector';
import LoginButton from '@/components/Auth/LoginButton';
import ThinkingModeSelector from '@/components/ThinkingModeSelector';
import { v4 as uuidv4 } from 'uuid';

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

export default function ChatPanel() {
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [loadingText, setLoadingText] = useState('');
    const [progress, setProgress] = useState(0);
    const [historyExpanded, setHistoryExpanded] = useState(false);

    // V23: Get all required store methods
    const messages = useStore((state) => state.messages);
    const addMessage = useStore((state) => state.addMessage);
    const goal = useStore((state) => state.goal);
    const getScopedMindMapAsJSON = useStore((state) => state.getScopedMindMapAsJSON);
    const setMindMapFromJSON = useStore((state) => state.setMindMapFromJSON);
    const getMessagesForAI = useStore((state) => state.getMessagesForAI);
    const thinkingMode = useStore((state) => state.thinkingMode);

    // Proactive Greeting Ref to ensure it only runs once
    const hasInitializedRef = useRef(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const lastUserMessageRef = useRef<string>('');

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

    // V44: Process AI response using parser with robust fallback
    const processAIResponse = useCallback((response: string, isFirstTurn: boolean = false) => {
        console.log("V44 DEBUG: Raw AI response:", response);

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
                console.log("V44 DEBUG: Parsed as JSON:", parsedData);
            }
        } catch {
            // Not JSON, use text parser
        }

        // If no JSON or JSON failed, use text parser
        if (!parsedData || !parsedData.assistantResponse) {
            console.log("V44 DEBUG: Using text parser");
            parsedData = parseAIResponse(response, goal, aiNodes, newNodeId, parentId, lastUserMsg);
            console.log("V44 DEBUG: Parsed result:", parsedData);
        }

        if (!parsedData) {
            parsedData = parseAIResponse(response, goal, aiNodes, newNodeId, parentId, lastUserMsg);
        }

        if (isFirstTurn && parsedData.updatedMindMap?.nodes?.length > 0) {
            parsedData.updatedMindMap = normalizeInitialScaffold(goal, parsedData.updatedMindMap);
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

        // V44: Always update mind map when response is in the active context
        if (!shouldOfferRedirect && parsedData.updatedMindMap && parsedData.updatedMindMap.nodes?.length > 0) {
            console.log("V44 DEBUG: Updating mind map:", parsedData.updatedMindMap);
            setMindMapFromJSON(parsedData.updatedMindMap);
        } else if (!shouldOfferRedirect && !isFirstTurn && lastUserMsg) {
            // V44: Fallback - create node from user message anyway
            console.log("V44 DEBUG: Fallback - creating node from user message");
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

        let sectionName = goal || 'Project Overview'; // Fix #15: Default to Goal instead of generic 'Plan'
        if (currentSectionNode) {
            sectionName = String(currentSectionNode.data.label);
        }

        const metadata = {
            nodesAdded: nodesAdded > 0 ? nodesAdded : undefined,
            sectionName,
            redirectTo: shouldOfferRedirect ? parsedData.redirectTo : undefined,
            redirectReason: shouldOfferRedirect ? parsedData.redirectReason : undefined
        };

        addMessage('assistant', cleanResponse, suggestions, metadata);
        setIsLoading(false);
        setLoadingText('');
        setProgress(0);
    }, [goal, addMessage, setMindMapFromJSON]);

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
                        thinkingMode,
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
    }, [goal, messages.length, addMessage, getScopedMindMapAsJSON, processAIResponse, thinkingMode]);

    // V42: Send message with debug logging
    const handleSend = async (textOverride?: string) => {
        const textToSend = typeof textOverride === 'string' ? textOverride : input;

        if (!textToSend.trim() || isLoading) return;

        setInput('');

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
        setIsLoading(true);

        // V42: Store last user message for parser (using the un-prefixed one for node generation fallback)
        lastUserMessageRef.current = textToSend;

        try {
            // Get messages and cast to ChatMessage[] for AI service
            const chatHistory = getMessagesForAI() as ChatMessage[];
            console.log("V42 DEBUG: Chat history being sent:", chatHistory);

            const currentMapJSON = getScopedMindMapAsJSON();
            console.log("V42 DEBUG: Current map being sent:", currentMapJSON);

            const response = await aiService.chat(goal, chatHistory, currentMapJSON, thinkingMode);
            processAIResponse(response, false);

        } catch (error) {
            console.error("V34 DEBUG: AI Error:", error);
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
                {/* Thinking Mode Selector - Moved to Top */}
                <div className="w-full">
                    <ThinkingModeSelector />
                </div>

                <div className="flex items-center justify-between">
                    <p className="text-xs text-text-muted ml-2">
                        {isLoading && progress > 0 && progress < 1 ? `Loading Brain: ${(progress * 100).toFixed(0)}%` : "Powered by WebLLM"}
                    </p>
                    <div className="flex items-center gap-2">
                        <LoginButton />
                        <div className="relative">
                            <ModelSelector />
                        </div>
                    </div>
                </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth z-0 relative">
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
