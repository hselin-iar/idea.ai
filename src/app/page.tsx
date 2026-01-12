'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowRight, Sparkles } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { clsx } from 'clsx';
import { useStore } from '@/lib/store';

export default function LandingPage() {
  const [inputGoal, setInputGoal] = useState('');
  const router = useRouter();
  const setGoal = useStore((state) => state.setGoal);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputGoal.trim()) return;

    // Save goal to store
    setGoal(inputGoal);

    // Create session ID
    const sessionId = uuidv4();

    // Persist to local storage (basic persistence for now)
    // We will load this in the workspace
    if (typeof window !== 'undefined') {
      localStorage.setItem(`idea-ai-session-${sessionId}`, JSON.stringify({
        goal: inputGoal,
        timestamp: Date.now(),
      }));
    }

    // Redirect
    router.push(`/mindmap/${sessionId}`);
  };

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center relative overflow-hidden p-4">
      {/* Background Decor */}
      <div className="absolute inset-0 z-0 opacity-20">
        <div className="absolute top-[-20%] left-[-20%] w-[50%] h-[50%] bg-purple-900 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-20%] w-[50%] h-[50%] bg-indigo-900 rounded-full blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="z-10 text-center max-w-2xl w-full"
      >
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="p-2 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-purple-500/20">
            {mounted && <Sparkles className="w-6 h-6 text-white" />}
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Idea.ai</h1>
        </div>

        <h2 className="text-5xl md:text-7xl font-bold mb-6 text-transparent bg-clip-text bg-gradient-to-r from-white via-indigo-100 to-purple-200 drop-shadow-sm">
          Turn your goals into <span className="text-indigo-400">plans</span>
        </h2>

        <p className="text-lg md:text-xl text-zinc-400 mb-12 max-w-lg mx-auto">
          Idea.ai is your intelligent mind-mapping companion. Type a goal, chat with AI, and watch your roadmap visualize instantly.
        </p>

        <form onSubmit={handleSubmit} className="relative w-full max-w-lg mx-auto group">
          <input
            type="text"
            value={inputGoal}
            onChange={(e) => setInputGoal(e.target.value)}
            placeholder="What do you want to achieve today?"
            className={clsx(
              "w-full px-6 py-5 rounded-2xl outline-none text-lg transition-all duration-300",
              "bg-zinc-900/50 backdrop-blur-md border border-zinc-800",
              "focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10 focus:bg-zinc-900/80",
              "placeholder:text-zinc-600 text-white"
            )}
            autoFocus
          />
          <button
            type="submit"
            className={clsx(
              "absolute right-2 top-2 bottom-2 aspect-square rounded-xl",
              "bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700",
              "text-white flex items-center justify-center transition-all duration-200",
              "disabled:opacity-0 disabled:pointer-events-none",
              inputGoal.trim() ? "opacity-100 translate-x-0" : "opacity-0 translate-x-4"
            )}
            disabled={!inputGoal.trim()}
          >
            <ArrowRight className="w-6 h-6" suppressHydrationWarning />
          </button>
        </form>

        <div className="mt-12 flex items-center justify-center gap-6 text-sm text-zinc-600">
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            Free & Unlimited
          </span>
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            Local AI (Private)
          </span>
        </div>
      </motion.div>
    </main>
  );
}
