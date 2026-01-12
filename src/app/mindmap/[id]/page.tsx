'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useStore } from '@/lib/store';
import ChatPanel from '@/components/Chat/ChatPanel';
import MindMapBoard from '@/components/MindMap/MindMapBoard';
import LoginButton from '@/components/Auth/LoginButton';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '@/contexts/AuthContext';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function WorkspacePage() {
    const params = useParams();
    const id = params.id as string;

    // Auth State
    const { user, loading: authLoading } = useAuth();

    // Store Actions
    const setGoal = useStore((state) => state.setGoal);
    const setMessages = useStore((state) => state.setMessages);
    const setNodes = useStore((state) => state.setNodes);
    const setEdges = useStore((state) => state.setEdges);

    // Store State (for saving)
    const goal = useStore((state) => state.goal);
    const messages = useStore((state) => state.messages);
    const nodes = useStore((state) => state.nodes);
    const edges = useStore((state) => state.edges);

    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [isLoaded, setIsLoaded] = useState(false);

    // Ref to track if we are currently loading data to prevent overwriting it with empty state immediately
    const isHydratingRef = useRef(true);

    // 1. Data Loading Effect
    useEffect(() => {
        if (authLoading) return;

        let unsubscribe: () => void = () => { };

        const loadData = async () => {
            isHydratingRef.current = true;

            if (user) {
                // Cloud Sync
                const sessionRef = doc(db, 'users', user.uid, 'sessions', id);
                unsubscribe = onSnapshot(sessionRef, (doc) => {
                    if (doc.exists()) {
                        const data = doc.data();
                        // Only update if remote data makes sense (simple conflict resolution: last write wins via snapshot)
                        // Note: ideally we check timestamps, but for MVP snapshot is fine.
                        // We avoid loop by checking deep equality or trusting React state diffing, 
                        // but here we just set it. 
                        // WARN: This might cause "fighting" if we edit while multiple tabs open.
                        if (data.goal) setGoal(data.goal);
                        if (data.messages) setMessages(data.messages);
                        if (data.nodes) setNodes(data.nodes);
                        if (data.edges) setEdges(data.edges);
                    }
                    if (isHydratingRef.current) {
                        isHydratingRef.current = false;
                        setIsLoaded(true);
                    }
                });
            } else {
                // Local Storage
                const storedSession = localStorage.getItem(`idea-ai-session-${id}`);
                if (storedSession) {
                    try {
                        const data = JSON.parse(storedSession);
                        if (data.goal) setGoal(data.goal);
                        if (data.messages) setMessages(data.messages);
                        if (data.nodes) setNodes(data.nodes);
                        if (data.edges) setEdges(data.edges);
                    } catch (e) {
                        console.error("Local storage load error", e);
                    }
                }
                isHydratingRef.current = false;
                setIsLoaded(true);
            }
        };

        loadData();

        return () => unsubscribe();
    }, [id, user, authLoading, setGoal, setMessages, setNodes, setEdges]);

    // 2. Data Saving Effect (Debounced)
    useEffect(() => {
        if (authLoading || isHydratingRef.current || !isLoaded) return;

        const saveData = async () => {
            const sessionData = {
                id,
                goal,
                messages,
                nodes,
                edges,
                updatedAt: Date.now(),
            };

            if (user) {
                // Save to Cloud
                try {
                    await setDoc(doc(db, 'users', user.uid, 'sessions', id), sessionData, { merge: true });
                } catch (e) {
                    console.error("Cloud save failed", e);
                }
            } else {
                // Save to Local
                localStorage.setItem(`idea-ai-session-${id}`, JSON.stringify(sessionData));
            }
        };

        const timeoutId = setTimeout(saveData, 1000); // 1s debounce
        return () => clearTimeout(timeoutId);

    }, [id, user, authLoading, isLoaded, goal, messages, nodes, edges]);

    if (authLoading || !isLoaded) {
        return <div className="flex h-screen items-center justify-center bg-zinc-950 text-zinc-500">
            <span className="animate-pulse">Loading Workspace...</span>
        </div>;
    }

    return (
        <div className="flex h-screen w-screen overflow-hidden bg-zinc-950">
            {/* Sidebar (Chat) */}
            <div
                className={clsx(
                    "shrink-0 transition-all duration-300 ease-in-out border-r border-zinc-800 relative flex flex-col",
                    isSidebarOpen ? "w-[400px]" : "w-0 opacity-0 overflow-hidden"
                )}
            >
                {/* Header with Login */}
                <div className="absolute top-4 right-4 z-50">
                    <LoginButton />
                </div>
                <ChatPanel />
            </div>

            {/* Main Board (Mind Map) */}
            <div className="flex-1 relative">
                <button
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    className="absolute top-4 left-4 z-10 p-2 bg-zinc-800/80 backdrop-blur text-zinc-400 hover:text-white rounded-lg border border-zinc-700 hover:bg-zinc-700 transition-colors"
                >
                    {isSidebarOpen ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
                </button>
                <MindMapBoard />
            </div>
        </div>
    );
}
