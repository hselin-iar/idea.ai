'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowRight, Sparkles, Brain, Zap, Map } from 'lucide-react';
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

    setGoal(inputGoal);
    const sessionId = uuidv4();

    if (typeof window !== 'undefined') {
      localStorage.setItem(`idea-ai-session-${sessionId}`, JSON.stringify({
        goal: inputGoal,
        timestamp: Date.now(),
      }));
    }

    router.push(`/mindmap/${sessionId}`);
  };

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center relative overflow-hidden p-4">
      {/* Animated Background */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-[-30%] left-[-20%] w-[60%] h-[60%] bg-gradient-to-br from-violet-900/40 to-indigo-900/40 rounded-full blur-[100px] animate-pulse" />
        <div className="absolute bottom-[-30%] right-[-20%] w-[60%] h-[60%] bg-gradient-to-br from-indigo-900/40 to-purple-900/40 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-[20%] right-[10%] w-[30%] h-[30%] bg-gradient-to-br from-cyan-900/20 to-blue-900/20 rounded-full blur-[80px] animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      {/* Grid overlay */}
      <div className="absolute inset-0 z-0 opacity-[0.03]" style={{
        backgroundImage: 'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)',
        backgroundSize: '50px 50px'
      }} />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="z-10 text-center max-w-3xl w-full"
      >
        {/* Logo */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="flex items-center justify-center gap-3 mb-8"
        >
          <div className="p-3 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 shadow-2xl shadow-purple-500/30">
            {mounted && <Brain className="w-8 h-8 text-white" />}
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-white">
            idea<span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">.ai</span>
          </h1>
        </motion.div>

        {/* Headline */}
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="text-5xl md:text-7xl font-bold mb-6 leading-tight"
        >
          <span className="text-white">Think it.</span>{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">Map it.</span>{' '}
          <span className="text-white">Do it.</span>
        </motion.h2>

        {/* Subheadline */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.6 }}
          className="text-lg md:text-xl text-zinc-400 mb-12 max-w-xl mx-auto leading-relaxed"
        >
          Chat with AI to explore your ideas. Watch your goals transform into
          visual mind maps — instantly and intelligently.
        </motion.p>

        {/* Input Form */}
        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          onSubmit={handleSubmit}
          className="relative w-full max-w-xl mx-auto"
        >
          <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-500" />
          <div className="relative">
            <input
              type="text"
              value={inputGoal}
              onChange={(e) => setInputGoal(e.target.value)}
              placeholder="What's your next big idea?"
              className={clsx(
                "w-full px-6 py-5 rounded-2xl outline-none text-lg transition-all duration-300",
                "bg-zinc-900/80 backdrop-blur-xl border border-zinc-700/50",
                "focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/20",
                "placeholder:text-zinc-500 text-white",
                "shadow-2xl shadow-black/20"
              )}
              autoFocus
            />
            <button
              type="submit"
              className={clsx(
                "absolute right-2 top-2 bottom-2 px-6 rounded-xl",
                "bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500",
                "text-white font-medium flex items-center gap-2 transition-all duration-300",
                "disabled:opacity-0 disabled:pointer-events-none",
                "shadow-lg shadow-indigo-500/25",
                inputGoal.trim() ? "opacity-100 translate-x-0" : "opacity-0 translate-x-4"
              )}
              disabled={!inputGoal.trim()}
            >
              Start <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </motion.form>

        {/* Feature Pills */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.5 }}
          className="mt-12 flex flex-wrap items-center justify-center gap-4 text-sm"
        >
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-800/50 border border-zinc-700/50 text-zinc-300">
            <Zap className="w-4 h-4 text-yellow-400" />
            Runs locally — 100% private
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-800/50 border border-zinc-700/50 text-zinc-300">
            <Map className="w-4 h-4 text-green-400" />
            Real-time mind mapping
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-800/50 border border-zinc-700/50 text-zinc-300">
            <Sparkles className="w-4 h-4 text-purple-400" />
            AI-powered planning
          </div>
        </motion.div>
      </motion.div>
    </main>
  );
}
