'use client';

import { useAuth } from '@/contexts/AuthContext';
import { LogIn, LogOut, User as UserIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { FirebaseError } from 'firebase/app';
import { isFirebaseConfigured } from '@/lib/firebase';

export default function LoginButton() {
    const { user, signInWithGoogle, signOut, loading } = useAuth();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isMenuOpen) return;

        const handlePointerDown = (event: MouseEvent) => {
            if (!menuRef.current?.contains(event.target as globalThis.Node)) {
                setIsMenuOpen(false);
            }
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsMenuOpen(false);
            }
        };

        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [isMenuOpen]);

    if (loading) return <div className="w-8 h-8 rounded-full bg-zinc-800 animate-pulse" />;

    if (user) {
        return (
            <div
                ref={menuRef}
                className="relative group z-50"
            >
                <button
                    onClick={() => setIsMenuOpen((open) => !open)}
                    className="flex items-center gap-2"
                    aria-haspopup="menu"
                    aria-expanded={isMenuOpen}
                    aria-label="User profile menu"
                >
                    {user.photoURL ? (
                        <img
                            src={user.photoURL}
                            alt={user.displayName || "User"}
                            className="w-8 h-8 rounded-full border border-zinc-700 hover:border-indigo-500 transition-colors"
                        />
                    ) : (
                        <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold border border-indigo-500">
                            {user.displayName ? user.displayName[0].toUpperCase() : <UserIcon size={14} />}
                        </div>
                    )}
                </button>

                {isMenuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-48 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl overflow-hidden py-1">
                        <div className="px-4 py-2 border-b border-zinc-800">
                            <p className="text-sm font-medium text-zinc-200 truncate">{user.displayName}</p>
                            <p className="text-xs text-zinc-500 truncate">{user.email}</p>
                        </div>
                        <button
                            onClick={() => {
                                setIsMenuOpen(false);
                                signOut();
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-zinc-800 flex items-center gap-2 transition-colors"
                        >
                            <LogOut size={14} />
                            Sign Out
                        </button>
                    </div>
                )}
            </div>
        );
    }

    const signIn = async () => {
        if (!isFirebaseConfigured) {
            alert("Firebase is not configured. Add NEXT_PUBLIC_FIREBASE_* values in .env.local.");
            return;
        }
        try {
            await signInWithGoogle();
        } catch (e: unknown) {
            console.error("Login failed", e);
            if (e instanceof FirebaseError && (e.code === 'auth/invalid-api-key' || e.code === 'auth/configuration-not-found')) {
                alert("Login Failed: Missing Firebase Configuration.\n\nPlease check your .env.local file and ensure all keys are set correctly.");
            } else {
                const message = e instanceof Error ? e.message : 'Unknown error';
                alert(`Login Failed: ${message}`);
            }
        }
    };

    return (
        <button
            onClick={signIn}
            className="flex items-center gap-2 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white px-4 py-2 rounded-full text-sm font-medium border border-zinc-700 hover:border-zinc-600 transition-all shadow-sm backdrop-blur-sm"
        >
            <LogIn size={14} />
            Sign in
        </button>
    );
}
