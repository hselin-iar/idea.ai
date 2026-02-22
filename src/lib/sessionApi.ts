import {
    FirestoreError,
    Unsubscribe,
    collection,
    deleteDoc,
    doc,
    onSnapshot,
    orderBy,
    query,
    setDoc,
} from 'firebase/firestore';
import type { Edge, Node } from '@xyflow/react';
import { db } from '@/lib/firebase';
import type { Message, ProjectIntake, SectionBrief } from '@/lib/store';

export interface SessionCore {
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
}

export interface SessionDocument extends SessionCore {
    id: string;
    updatedAt: number;
}

export interface SessionSummary {
    id: string;
    goal: string;
    updatedAt: number;
    nodesCount: number;
}

export function subscribeToSessionSummaries(
    uid: string,
    onData: (sessions: SessionSummary[]) => void,
    onError?: (error: FirestoreError) => void
): Unsubscribe {
    const sessionsRef = collection(db, 'users', uid, 'sessions');
    const sessionsQuery = query(sessionsRef, orderBy('updatedAt', 'desc'));

    return onSnapshot(sessionsQuery, (snapshot) => {
        const sessions = snapshot.docs.map((sessionDoc) => {
            const data = sessionDoc.data();
            return {
                id: sessionDoc.id,
                goal: data.goal || 'Untitled session',
                updatedAt: data.updatedAt || 0,
                nodesCount: Array.isArray(data.nodes) ? data.nodes.length : 0,
            } satisfies SessionSummary;
        });
        onData(sessions);
    }, onError);
}

export function subscribeToSession(
    uid: string,
    sessionId: string,
    onData: (session: SessionCore) => void,
    onError?: (error: FirestoreError) => void
): Unsubscribe {
    const sessionRef = doc(db, 'users', uid, 'sessions', sessionId);
    return onSnapshot(sessionRef, (sessionDoc) => {
        if (!sessionDoc.exists()) {
            onData({
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
            });
            return;
        }

        const data = sessionDoc.data();
        onData({
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
    }, onError);
}

export async function saveSession(uid: string, sessionId: string, data: SessionDocument): Promise<void> {
    await setDoc(doc(db, 'users', uid, 'sessions', sessionId), data, { merge: true });
}

export async function deleteSessionById(uid: string, sessionId: string): Promise<void> {
    await deleteDoc(doc(db, 'users', uid, 'sessions', sessionId));
}
