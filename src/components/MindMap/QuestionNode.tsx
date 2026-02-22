'use client';

import { memo, useEffect, useState } from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { Loader2, Send } from 'lucide-react';
import { motion } from 'framer-motion';
import { useStore } from '@/lib/store';
import { aiService, ChatMessage, MindMapNode, parseAIResponse } from '@/services/ai';

interface QuestionNodeData extends Record<string, unknown> {
    label: string;
    description?: string;
    answer?: string;
    isAnswered?: boolean;
}

/**
 * QuestionNode Component
 * 
 * A node type for AI-generated questions that users can answer inline.
 * Submitting an answer triggers AI continuation to advance the plan.
 */
const QuestionNode = ({ id, data }: NodeProps<Node<QuestionNodeData>>) => {
    const [answer, setAnswer] = useState(data.answer || '');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isAnswered, setIsAnswered] = useState(data.isAnswered || false);

    useEffect(() => {
        setAnswer(data.answer || '');
        setIsAnswered(data.isAnswered || false);
    }, [data.answer, data.isAnswered]);

    const updateNodeContent = useStore((state) => state.updateNodeContent);
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [editTitle, setEditTitle] = useState(data.label);

    const handleSaveTitle = () => {
        updateNodeContent(id, editTitle.trim() || 'Untitled Question', (data.description as string) || '');
        setIsEditingTitle(false);
    };

    const addMessage = useStore((state) => state.addMessage);
    const goal = useStore((state) => state.goal);
    const getScopedMindMapAsJSON = useStore((state) => state.getScopedMindMapAsJSON);
    const setMindMapFromJSON = useStore((state) => state.setMindMapFromJSON);
    const thinkingMode = useStore((state) => state.thinkingMode);
    const updateNodeQuestion = useStore((state) => state.updateNodeQuestion);
    const getMessagesForAI = useStore((state) => state.getMessagesForAI);

    const handleSubmitAnswer = async () => {
        if (!answer.trim() || isSubmitting) return;

        setIsSubmitting(true);
        addMessage('user', `Answer to "${data.label}": ${answer}`);

        try {
            const recentHistory = (getMessagesForAI() as ChatMessage[]).slice(-6);
            const activeSectionId = useStore.getState().activeSection;
            const activeSectionLabel = activeSectionId
                ? String(useStore.getState().nodes.find((node) => node.id === activeSectionId)?.data.label || '')
                : '';
            const answerPrompt = activeSectionLabel
                ? `[Section: ${activeSectionLabel}] Question: ${data.label}\nMy answer: ${answer}`
                : `Question: ${data.label}\nMy answer: ${answer}`;
            const chatHistory: ChatMessage[] = recentHistory.length > 0 && recentHistory[recentHistory.length - 1]?.role === 'user'
                ? [...recentHistory.slice(0, -1), { role: 'user', content: answerPrompt }]
                : [...recentHistory, { role: 'user', content: answerPrompt }];

            const response = await aiService.chat(
                goal,
                chatHistory,
                getScopedMindMapAsJSON(),
                thinkingMode,
                undefined,
                { forceContextual: true }
            );

            // Mark as answered
            setIsAnswered(true);
            updateNodeQuestion(id, answer, true);

            // Parse and update mind map using the robust parser (Fix #24, #25)
            try {
                const aiNodes: MindMapNode[] = useStore.getState().nodes.map((node) => ({
                    id: node.id,
                    label: String(node.data.label || ''),
                    description: String(node.data.description || ''),
                    nodeClass: ((node.data.nodeClass as MindMapNode['nodeClass']) || 'idea'),
                    nodeType: (typeof node.type === 'string' ? node.type : 'expandable') as MindMapNode['nodeType'],
                    items: Array.isArray(node.data.items) ? node.data.items as { id: string; text: string; completed: boolean }[] : undefined,
                }));
                const parsedData = parseAIResponse(
                    response,
                    goal,
                    aiNodes,
                    `qn_resp_${Date.now()}`,
                    id,
                    answer
                );

                if (!parsedData.redirectTo && parsedData.updatedMindMap && parsedData.updatedMindMap.nodes?.length > 0) {
                    setMindMapFromJSON(parsedData.updatedMindMap);
                }

                // Add AI response as message
                if (parsedData.assistantResponse) {
                    addMessage('assistant', parsedData.assistantResponse, undefined, {
                        redirectTo: parsedData.redirectTo,
                        redirectReason: parsedData.redirectReason
                    });
                }
            } catch (err) {
                console.error('[QuestionNode] Response parsing failed', err);
            }

        } catch (error) {
            console.error('[QuestionNode] Error:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmitAnswer();
        }
    };

    const isComplete = isAnswered;
    const borderColorClass = isComplete ? 'border-emerald-500/30' : 'border-amber-500/30';

    return (
        <div className={`plan-card group relative border-l-4 ${borderColorClass}`}>
            <Handle type="target" position={Position.Top} className="opacity-0" />

            {/* Header / Class Badge Row */}
            <div className="flex items-center justify-between mb-2 opacity-70">
                <div className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                    question
                </div>
            </div>

            {/* Title Area (The Question itself) */}
            {isEditingTitle ? (
                <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="font-bold text-base w-full bg-black/5 dark:bg-white/5 border border-black/20 dark:border-white/20 rounded px-1 outline-none text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500 mb-2"
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

            {/* Answer Input */}
            <motion.div
                className="w-full"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
            >
                {isAnswered ? (
                    <div className="text-xs text-text-muted flex items-start gap-2 bg-emerald-500/10 p-2 rounded border border-emerald-500/20">
                        <span className="text-emerald-500 mt-0.5">✓</span>
                        <div className="break-words w-full italic">{answer}</div>
                    </div>
                ) : (
                    <div className="flex gap-2">
                        <div className="flex-1 rounded border border-white/10 focus-within:border-amber-500/50 bg-white/5 transition-colors">
                            <input
                                type="text"
                                value={answer}
                                onChange={(e) => setAnswer(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Type your answer..."
                                disabled={isSubmitting}
                                className="w-full bg-transparent border-none px-2 py-1.5 text-xs text-white focus:outline-none placeholder-text-muted/50"
                            />
                        </div>
                        <button
                            onClick={handleSubmitAnswer}
                            disabled={!answer.trim() || isSubmitting}
                            className="px-2 py-1.5 bg-amber-500/20 hover:bg-amber-500/40 border border-amber-500/50 disabled:opacity-50 disabled:cursor-not-allowed rounded text-amber-400 transition-all flex items-center justify-center"
                        >
                            {isSubmitting ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                                <Send className="w-3 h-3" />
                            )}
                        </button>
                    </div>
                )}
            </motion.div>

            <Handle type="source" position={Position.Bottom} className="opacity-0" />
        </div>
    );
};

export default memo(QuestionNode);
