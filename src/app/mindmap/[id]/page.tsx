'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useStore, type Message, type ProjectIntake, type SectionBrief } from '@/lib/store';
import ChatPanel from '@/components/Chat/ChatPanel';
import MindMapBoard from '@/components/MindMap/MindMapBoard';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '@/contexts/AuthContext';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Edge, Node } from '@xyflow/react';

export default function WorkspacePage() {
    const params = useParams();
    const id = params.id as string;

    // Auth State
    const { user, loading: authLoading } = useAuth();

    // Store Actions
    const setSessionData = useStore((state) => state.setSessionData);
    const resetSessionState = useStore((state) => state.resetSessionState);

    // Store State (for saving)
    const goal = useStore((state) => state.goal);
    const messages = useStore((state) => state.messages);
    const nodes = useStore((state) => state.nodes);
    const edges = useStore((state) => state.edges);
    const sectionBriefs = useStore((state) => state.sectionBriefs);
    const sectionBriefDismissed = useStore((state) => state.sectionBriefDismissed);
    const projectIntake = useStore((state) => state.projectIntake);
    const projectIntakePrompted = useStore((state) => state.projectIntakePrompted);
    const userConstraints = useStore((state) => state.userConstraints);
    const proposalMode = useStore((state) => state.proposalMode);

    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [isLoaded, setIsLoaded] = useState(false);

    // Ref to track if we are currently loading data to prevent overwriting it with empty state immediately
    const isHydratingRef = useRef(true);
    const lastSyncedCoreRef = useRef('');

    const serializeSessionCore = (data: {
        goal?: string;
        messages?: Message[];
        nodes?: Node[];
        edges?: Edge[];
        sectionBriefs?: Record<string, SectionBrief>;
        sectionBriefDismissed?: Record<string, boolean>;
        projectIntake?: ProjectIntake | null;
        projectIntakePrompted?: boolean;
        userConstraints?: string[];
        proposalMode?: boolean;
    }) => JSON.stringify({
        goal: data.goal || '',
        messages: data.messages || [],
        nodes: data.nodes || [],
        edges: data.edges || [],
        sectionBriefs: data.sectionBriefs || {},
        sectionBriefDismissed: data.sectionBriefDismissed || {},
        projectIntake: data.projectIntake || null,
        projectIntakePrompted: data.projectIntakePrompted ?? false,
        userConstraints: data.userConstraints || [],
        proposalMode: data.proposalMode ?? true,
    });

    // 1. Data Loading Effect
    useEffect(() => {
        if (authLoading) return;

        let unsubscribe: () => void = () => { };
        let loadTimer: ReturnType<typeof setTimeout> | undefined;
        isHydratingRef.current = true;
        resetSessionState();
        const markLoaded = () => {
            if (loadTimer) {
                clearTimeout(loadTimer);
            }
            loadTimer = setTimeout(() => setIsLoaded(true), 0);
        };

        if (user) {
            // Firestore is canonical for signed-in users.
            const sessionRef = doc(db, 'users', user.uid, 'sessions', id);
            unsubscribe = onSnapshot(sessionRef, (sessionDoc) => {
                let nextCore: {
                    goal: string;
                    messages: Message[];
                    nodes: Node[];
                    edges: Edge[];
                    sectionBriefs: Record<string, SectionBrief>;
                    sectionBriefDismissed: Record<string, boolean>;
                    projectIntake: ProjectIntake | null;
                    projectIntakePrompted: boolean;
                    userConstraints: string[];
                    proposalMode: boolean;
                };
                if (sessionDoc.exists()) {
                    const data = sessionDoc.data();
                    nextCore = {
                        goal: data.goal || '',
                        messages: data.messages || [],
                        nodes: data.nodes || [],
                        edges: data.edges || [],
                        sectionBriefs: data.sectionBriefs || {},
                        sectionBriefDismissed: data.sectionBriefDismissed || {},
                        projectIntake: data.projectIntake || null,
                        projectIntakePrompted: data.projectIntakePrompted ?? false,
                        userConstraints: data.userConstraints || [],
                        proposalMode: data.proposalMode ?? true,
                    };
                } else {
                    // New session document: start clean.
                    nextCore = {
                        goal: '',
                        messages: [],
                        nodes: [],
                        edges: [],
                        sectionBriefs: {},
                        sectionBriefDismissed: {},
                        projectIntake: null,
                        projectIntakePrompted: false,
                        userConstraints: [],
                        proposalMode: true,
                    };
                }

                const serializedCore = serializeSessionCore(nextCore);
                if (serializedCore !== lastSyncedCoreRef.current) {
                    setSessionData(nextCore);
                    lastSyncedCoreRef.current = serializedCore;
                }

                if (isHydratingRef.current) {
                    isHydratingRef.current = false;
                    markLoaded();
                }
            });
        } else {
            // Guest fallback: session-scoped local storage only.
            const storedSession = localStorage.getItem(`idea-ai-session-${id}`);
            if (storedSession) {
                try {
                    const data = JSON.parse(storedSession);
                    const nextCore = {
                        goal: data.goal || '',
                        messages: data.messages || [],
                        nodes: data.nodes || [],
                        edges: data.edges || [],
                        sectionBriefs: data.sectionBriefs || {},
                        sectionBriefDismissed: data.sectionBriefDismissed || {},
                        projectIntake: data.projectIntake || null,
                        projectIntakePrompted: data.projectIntakePrompted ?? false,
                        userConstraints: data.userConstraints || [],
                        proposalMode: data.proposalMode ?? true,
                    };
                    setSessionData(nextCore);
                    lastSyncedCoreRef.current = serializeSessionCore(nextCore);
                } catch (e) {
                    console.error("Local storage load error", e);
                }
            } else {
                setSessionData({});
                lastSyncedCoreRef.current = serializeSessionCore({});
            }
            isHydratingRef.current = false;
            markLoaded();
        }

        return () => {
            if (loadTimer) clearTimeout(loadTimer);
            unsubscribe();
        };
    }, [id, user, authLoading, setSessionData, resetSessionState]);

    // 2. Data Saving Effect (Debounced)
    useEffect(() => {
        if (authLoading || isHydratingRef.current || !isLoaded) return;

        const saveData = async () => {
            const core = {
                goal,
                messages,
                nodes,
                edges,
                sectionBriefs,
                sectionBriefDismissed,
                projectIntake,
                projectIntakePrompted,
                userConstraints,
                proposalMode
            };
            const serializedCore = serializeSessionCore(core);
            if (serializedCore === lastSyncedCoreRef.current) return;

            const sessionData = {
                id,
                goal,
                messages,
                nodes,
                edges,
                sectionBriefs,
                sectionBriefDismissed,
                projectIntake,
                projectIntakePrompted,
                userConstraints,
                proposalMode,
                updatedAt: Date.now(),
            };

            if (user) {
                // Save to Cloud
                const previousSyncedCore = lastSyncedCoreRef.current;
                try {
                    lastSyncedCoreRef.current = serializedCore;
                    await setDoc(doc(db, 'users', user.uid, 'sessions', id), sessionData, { merge: true });
                } catch (e) {
                    lastSyncedCoreRef.current = previousSyncedCore;
                    console.error("Cloud save failed", e);
                }
            } else {
                // Save to Local
                lastSyncedCoreRef.current = serializedCore;
                localStorage.setItem(`idea-ai-session-${id}`, JSON.stringify(sessionData));
            }
        };

        const timeoutId = setTimeout(saveData, 1000); // 1s debounce
        return () => clearTimeout(timeoutId);

    }, [
        id,
        user,
        authLoading,
        isLoaded,
        goal,
        messages,
        nodes,
        edges,
        sectionBriefs,
        sectionBriefDismissed,
        projectIntake,
        projectIntakePrompted,
        userConstraints,
        proposalMode
    ]);

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
                {/* Header with Login removed - moved to ChatPanel */}
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
