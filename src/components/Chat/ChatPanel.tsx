'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User as UserIcon, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@/lib/store';
import { aiService, parseAIResponse } from '@/services/ai';
import { InitProgressReport } from '@mlc-ai/web-llm';

export default function ChatPanel() {
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [loadingText, setLoadingText] = useState('');
    const [progress, setProgress] = useState(0);

    // V23: Get all required store methods
    const messages = useStore((state) => state.messages);
    const addMessage = useStore((state) => state.addMessage);
    const goal = useStore((state) => state.goal);
    const nodes = useStore((state) => state.nodes);
    const getMindMapAsJSON = useStore((state) => state.getMindMapAsJSON);
    const setMindMapFromJSON = useStore((state) => state.setMindMapFromJSON);
    const getMessagesForAI = useStore((state) => state.getMessagesForAI);

    // Proactive Greeting Ref to ensure it only runs once
    const hasInitializedRef = useRef(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const lastUserMessageRef = useRef<string>('');

    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    // Proactive Greeting Effect (V23: Full context injection)
    useEffect(() => {
        const initChat = async () => {
            if (!hasInitializedRef.current && messages.length === 0 && goal) {
                hasInitializedRef.current = true;

                setIsLoading(true);
                try {
                    // V23: Pass full context to AI
                    const chatHistory = [{ role: 'user', content: `My goal is: "${goal}".` }];
                    const currentMapJSON = getMindMapAsJSON();

                    const response = await aiService.chat(
                        goal,
                        chatHistory,
                        currentMapJSON,
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
    }, [goal, messages.length]);

    // V42: Process AI response using parser
    const processAIResponse = (response: string, isFirstTurn: boolean = false) => {
        console.log("V42 DEBUG: Raw AI response:", response);

        // V42: Try to parse as simple text format first
        const newNodeId = `node-${Date.now()}-user`;
        const parentId = nodes.length > 0 ? nodes[0].id : 'root';
        const lastUserMsg = lastUserMessageRef.current;

        let parsedData;

        // First try JSON parsing (backwards compatibility)
        try {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsedData = JSON.parse(jsonMatch[0]);
                console.log("V42 DEBUG: Parsed as JSON:", parsedData);
            }
        } catch (e) {
            // Not JSON, use text parser
        }

        // If no JSON or JSON failed, use text parser
        if (!parsedData || !parsedData.assistantResponse) {
            console.log("V42 DEBUG: Using text parser");
            parsedData = parseAIResponse(response, goal, nodes, newNodeId, parentId, lastUserMsg);
            console.log("V42 DEBUG: Parsed result:", parsedData);
        }

        let cleanResponse = parsedData.assistantResponse || "What would you like to explore?";
        let suggestions = parsedData.suggestions || [];

        // Clean up suggestions
        suggestions = suggestions
            .filter((s: string) => s && typeof s === 'string')
            .map((s: string) => s.replace(/[\[\]]/g, '').trim())
            .filter((s: string) => s.length > 0 && s.length < 100);

        // Update mind map
        if (parsedData.updatedMindMap) {
            console.log("V42 DEBUG: Updating mind map:", parsedData.updatedMindMap);
            setMindMapFromJSON(parsedData.updatedMindMap);
        }

        addMessage('assistant', cleanResponse, suggestions);
        setIsLoading(false);
        setLoadingText('');
        setProgress(0);
    };

    // V42: Send message with debug logging
    const handleSend = async (textOverride?: string) => {
        const textToSend = typeof textOverride === 'string' ? textOverride : input;

        if (!textToSend.trim() || isLoading) return;

        setInput('');
        addMessage('user', textToSend);
        setIsLoading(true);

        // V42: Store last user message for parser
        lastUserMessageRef.current = textToSend;

        try {
            const chatHistory = getMessagesForAI();
            chatHistory.push({ role: 'user', content: textToSend });
            console.log("V42 DEBUG: Chat history being sent:", chatHistory);

            const currentMapJSON = getMindMapAsJSON();
            console.log("V42 DEBUG: Current map being sent:", currentMapJSON);

            const response = await aiService.chat(goal, chatHistory, currentMapJSON);
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

    return (
        <div className="flex flex-col h-full bg-zinc-900 border-r border-zinc-800">
            <div className="p-4 border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">
                <h2 className="text-lg font-semibold flex items-center gap-2 text-zinc-100">
                    <Bot className="w-5 h-5 text-indigo-400" />
                    idea.ai
                </h2>
                <p className="text-xs text-zinc-500">
                    {isLoading && progress > 0 && progress < 1 ? `Loading Brain: ${(progress * 100).toFixed(0)}%` : "Powered by WebLLM"}
                </p>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth">
                <AnimatePresence>
                    {/* Loading / Empty State handled by proactive greeting mainly */}
                    {messages.map((msg) => (
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
                                    "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                                    msg.role === 'user' ? "bg-indigo-600" : "bg-zinc-700"
                                )}>
                                    {msg.role === 'user' ? <UserIcon size={14} /> : <Bot size={14} />}
                                </div>
                                <div className={clsx(
                                    "p-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap shadow-sm",
                                    msg.role === 'user'
                                        ? "bg-indigo-600/20 text-indigo-100 rounded-tr-none border border-indigo-500/20"
                                        : "bg-zinc-800 text-zinc-300 rounded-tl-none border border-zinc-700"
                                )}>
                                    {msg.content}
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
                                            className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-indigo-900/40 text-indigo-300 border border-zinc-700 hover:border-indigo-500/30 rounded-full transition-all active:scale-95 disabled:opacity-50"
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
                            <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center shrink-0">
                                <Bot size={14} />
                            </div>
                            <div className="bg-zinc-800 p-3 rounded-2xl rounded-tl-none border border-zinc-700 flex items-center gap-2 text-zinc-400 text-sm">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                {progress > 0 && progress < 1 ? loadingText : "Thinking..."}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <div className="p-4 bg-zinc-900/50 backdrop-blur-sm border-t border-zinc-800">
                <div className="relative">
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Describe your step..."
                        className="w-full bg-zinc-800/50 text-zinc-200 rounded-xl px-4 py-3 pr-12 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/50 border border-zinc-700 h-14 max-h-32"
                        disabled={isLoading}
                    />
                    <button
                        // Pass undefined so it uses input state
                        onClick={() => handleSend()}
                        disabled={!input.trim() || isLoading}
                        className="absolute right-2 top-2 p-2 bg-indigo-600 rounded-lg text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <Send size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
}
