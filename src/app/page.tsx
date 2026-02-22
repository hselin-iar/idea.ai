'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';
import { useStore } from '@/lib/store';
import ThinkingModeSelector from '@/components/ThinkingModeSelector';

export default function LandingPage() {
  const [inputGoal, setInputGoal] = useState('');
  const router = useRouter();
  const setGoal = useStore((state) => state.setGoal);
  const createSession = () => {
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createSession();
  };

  return (
    <div className="relative min-h-screen bg-transparent text-foreground font-display selection:bg-primary/30 overflow-x-hidden">
      <div className="relative z-10 flex flex-col min-h-screen">

        {/* Header */}
        <header className="w-full px-6 py-6 flex justify-center sticky top-0 z-50 pointer-events-none">
          <nav className="pointer-events-auto bg-background-dark/80 backdrop-blur-md rounded-full px-6 py-2 flex items-center justify-between gap-6 shadow-neumorphic-dark border border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary shadow-sm glass">
                <span className="material-symbols-outlined text-[18px]">spa</span>
              </div>
              <span className="font-bold text-lg tracking-tight text-surface-light">Idea.ai</span>
            </div>

            <div className="flex items-center gap-3">
              <button className="neumorphic-btn px-5 py-2 rounded-full text-primary font-bold text-xs tracking-wide flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                Watch Demo
              </button>
              <button className="neumorphic-btn w-9 h-9 rounded-full flex items-center justify-center text-text-muted hover:text-primary">
                <span className="material-symbols-outlined text-[18px]">settings</span>
              </button>
            </div>
          </nav>
        </header>

        <main className="flex-grow flex flex-col items-center w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 gap-16">

          {/* Hero Section */}
          <section className="text-center flex flex-col items-center gap-6 max-w-4xl w-full">
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.1] text-gradient mt-8">
              Let your thoughts <br /> flow naturally.
            </h1>

            <form onSubmit={handleSubmit} className="w-full max-w-2xl mt-4 flex flex-col items-center gap-6">
              <div className="input-groove rounded-full p-2 pl-6 flex items-center gap-3 w-full max-w-xl mx-auto">
                <span className="material-symbols-outlined text-primary/70">magic_button</span>
                <input
                  className="bg-transparent border-none outline-none w-full text-surface-light placeholder-text-muted/70 text-sm focus:ring-0"
                  placeholder="Type a concept to expand..."
                  type="text"
                  value={inputGoal}
                  onChange={(e) => setInputGoal(e.target.value)}
                />
                <button type="submit" className="w-8 h-8 rounded-full bg-primary/20 hover:bg-primary text-primary hover:text-white flex items-center justify-center transition-colors shrink-0">
                  <span className="material-symbols-outlined text-[18px]">arrow_upward</span>
                </button>
              </div>

              <div className="w-full max-w-xl mx-auto bg-background/50 p-4 rounded-2xl border border-white/5 shadow-neumorphic-dark">
                <p className="text-xs text-text-muted uppercase tracking-wider font-bold mb-3 text-left pl-2">Select Initial Thinking Framework</p>
                <ThinkingModeSelector />
              </div>
            </form>

            <p className="text-lg md:text-xl text-text-muted max-w-2xl leading-relaxed mt-4">
              AI-powered ideation that feels like play, not work. Organize your mind in a workspace designed for calm focus and organic growth.
            </p>
          </section>

          {/* Visualization Section */}
          <section className="w-full relative py-10">
            <div className="relative w-full aspect-[16/9] md:aspect-[2/1] rounded-3xl overflow-hidden engraved-card border border-white/5 p-8 md:p-12">
              <div className="absolute top-12 left-12 z-20">
                <h2 className="text-7xl md:text-9xl font-black text-stroke-white tracking-[0.1em] leading-tight opacity-20 select-none">YOUR SMART<br />PLANNER</h2>
              </div>
              <div className="absolute inset-0 border-[1.5px] border-white/10 rounded-2xl pointer-events-none m-6 border-t-0"></div>

              <div className="absolute left-6 top-1/2 -translate-y-1/2 flex flex-col gap-4 z-20 mt-4">
                <button className="w-12 h-12 rounded-full neumorphic-btn flex items-center justify-center text-text-muted hover:text-primary" title="Add Node">
                  <span className="material-symbols-outlined">add</span>
                </button>
                <button className="w-12 h-12 rounded-full neumorphic-btn flex items-center justify-center text-text-muted hover:text-primary" title="AI Expand">
                  <span className="material-symbols-outlined">auto_awesome</span>
                </button>
                <button className="w-12 h-12 rounded-full neumorphic-btn flex items-center justify-center text-text-muted hover:text-primary" title="Connect">
                  <span className="material-symbols-outlined">timeline</span>
                </button>
              </div>

              <div className="relative w-full h-full flex items-center justify-center mt-12">
                <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <filter height="140%" id="glow" width="140%" x="-20%" y="-20%">
                      <feGaussianBlur result="coloredBlur" stdDeviation="3"></feGaussianBlur>
                      <feMerge>
                        <feMergeNode in="coloredBlur"></feMergeNode>
                        <feMergeNode in="SourceGraphic"></feMergeNode>
                      </feMerge>
                    </filter>
                    <linearGradient id="threadGradient" x1="0%" x2="100%" y1="0%" y2="0%">
                      <stop offset="0%" stopColor="#2b8cee" stopOpacity="0"></stop>
                      <stop offset="50%" stopColor="#2b8cee" stopOpacity="0.4"></stop>
                      <stop offset="100%" stopColor="#2b8cee" stopOpacity="0"></stop>
                    </linearGradient>
                  </defs>
                  <path d="M400,200 C500,200 500,100 620,100" fill="none" filter="url(#glow)" stroke="url(#threadGradient)" strokeWidth="2"></path>
                  <path d="M400,200 C500,200 500,300 620,300" fill="none" filter="url(#glow)" stroke="url(#threadGradient)" strokeWidth="2"></path>
                  <path d="M400,200 C300,200 320,200 220,240" fill="none" filter="url(#glow)" stroke="url(#threadGradient)" strokeWidth="2"></path>
                </svg>

                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                  <div className="stone-node w-40 h-32 flex flex-col items-center justify-center text-center p-4 cursor-pointer group">
                    <span className="text-sm font-bold text-surface-light mb-1">Sustainable<br />Living</span>
                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_8px_rgba(43,140,238,0.6)]"></div>
                  </div>
                </div>

                <div className="absolute right-[18%] top-[20%] z-10">
                  <div className="stone-node w-32 h-24 flex items-center justify-center text-center p-3 cursor-pointer opacity-90 hover:opacity-100">
                    <span className="text-xs font-medium text-gray-300">Renewable<br />Energy</span>
                  </div>
                </div>
                <div className="absolute right-[18%] bottom-[20%] z-10">
                  <div className="stone-node w-32 h-24 flex items-center justify-center text-center p-3 cursor-pointer opacity-90 hover:opacity-100">
                    <span className="text-xs font-medium text-gray-300">Zero<br />Waste</span>
                  </div>
                </div>
                <div className="absolute left-[20%] top-[45%] z-10">
                  <div className="stone-node w-32 h-24 flex items-center justify-center text-center p-3 cursor-pointer opacity-90 hover:opacity-100">
                    <span className="text-xs font-medium text-gray-300">Mindful<br />Consumption</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="w-full text-center mb-8">
            <h2 className="text-3xl md:text-4xl font-bold text-surface-light">Harness Your Creative Flow</h2>
          </div>

          <section className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full py-10">
            <div className="flex flex-col gap-4 p-8 rounded-2xl raised-card-green border border-white/5 transition-transform hover:-translate-y-1">
              <div className="w-12 h-12 rounded-xl bg-surface-dark flex items-center justify-center text-primary mb-2 shadow-inner">
                <span className="material-symbols-outlined">water_drop</span>
              </div>
              <h3 className="text-xl font-bold text-surface-light">Organic Layouts</h3>
              <p className="text-text-muted text-sm leading-relaxed">Nodes drift into place like leaves on water, auto-arranging for clarity without rigid grids.</p>
            </div>
            <div className="flex flex-col gap-4 p-8 rounded-2xl raised-card-green border border-white/5 transition-transform hover:-translate-y-1">
              <div className="w-12 h-12 rounded-xl bg-surface-dark flex items-center justify-center text-primary mb-2 shadow-inner">
                <span className="material-symbols-outlined">psychology</span>
              </div>
              <h3 className="text-xl font-bold text-surface-light">AI Synthesis</h3>
              <p className="text-text-muted text-sm leading-relaxed">Our AI gently connects related concepts, revealing hidden patterns in your thinking.</p>
            </div>
            <div className="flex flex-col gap-4 p-8 rounded-2xl raised-card-green border border-white/5 transition-transform hover:-translate-y-1">
              <div className="w-12 h-12 rounded-xl bg-surface-dark flex items-center justify-center text-primary mb-2 shadow-inner">
                <span className="material-symbols-outlined">self_improvement</span>
              </div>
              <h3 className="text-xl font-bold text-surface-light">Design Thinking</h3>
              <p className="text-text-muted text-sm leading-relaxed">Uses design thinking and ideation tools to get you the best responses and think out of the box.</p>
            </div>
          </section>

          <div className="flex flex-col sm:flex-row gap-8 w-full justify-center">
            <button onClick={createSession} className="neumorphic-btn px-10 py-4 rounded-xl text-white bg-primary font-bold text-lg tracking-wide shadow-lg hover:shadow-primary/30 hover:bg-primary/90 transition-all border-none">
              Get Started Free
            </button>
            <button className="px-10 py-4 rounded-xl text-surface-light font-medium text-lg tracking-wide hover:bg-surface-dark/50 transition-colors flex items-center justify-center gap-2">
              <span className="material-symbols-outlined">play_circle</span>
              Watch Demo
            </button>
          </div>

          <section className="w-full py-16">
            <div className="flex flex-col gap-4 mb-10 text-center">
              <h2 className="text-3xl md:text-4xl font-bold text-surface-light">Articles on Design Thinking</h2>
              <p className="text-text-muted">Explore our curated collection of insights and methodologies.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <a href="#" className="relative group rounded-3xl overflow-hidden aspect-video raised-card block">
                <img src="https://lh3.googleusercontent.com/aida-public/AB6AXuAG2JxnYe1wf7kFYDX7q86G1h4ALZ70Bqos5cEQcYaFpvuR5DetITeqAd59hxLN6QJqgsZZQGBJTrYqhhQwWeKsdCW_YFe4wqyeEIE_4KdLhMWdhPTi5AFMGfyJwAguQ-hFbFdjaM3BAvU8LfBR0TDF-5zLkdA9QDcInlJ318hUL6u2aEdgyWrdmN5ZmfI5qtjj769UmcD0vSOxbkv2NyALito2loJBubLS_SjeWugjrh3NDbe0H5kfWxLdBwRAGcWQNsNbhf1QrcnW" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 opacity-80 group-hover:opacity-100" alt="Stacked stones representing structured design thinking" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex flex-col justify-end p-8">
                  <h3 className="text-white text-2xl font-bold mb-2">The Architecture of Balance</h3>
                  <p className="text-white/80 text-sm">How to structure complex thoughts into manageable concepts.</p>
                </div>
              </a>
              <a href="#" className="relative group rounded-3xl overflow-hidden aspect-video raised-card block">
                <img src="https://lh3.googleusercontent.com/aida-public/AB6AXuBI3WA5bC159mMGf2k_u3Evil5Gi1kj80uCMrObejmwRCdBSgTiXfwarEVDlWaHKcHBJrizqSx6-LRfmJ-uhUX8olkWnLjCBOc_UUJtiKcUmRkg2uwDVqAI13f2FxoqKmq0gjJVftTiUQaE_mGfIpOK9BlUfnZwHlx2k_hPtMCEaV5arRJytyJaJic0rqqVBEF0iLOTnTq5PwfO3oXkqUL6YexdSQFu3B09SqpqZMv8OKoL7LFjfLLciWXIXRdWEwrsxgS-Gcya2GrF" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 opacity-80 group-hover:opacity-100" alt="Fluid shapes representing creative flow" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex flex-col justify-end p-8">
                  <h3 className="text-white text-2xl font-bold mb-2">Embracing the Void</h3>
                  <p className="text-white/80 text-sm">Using minimalist spaces to amplify creative potential.</p>
                </div>
              </a>
            </div>
          </section>

          <div className="w-full text-center mb-8">
            <h2 className="text-3xl md:text-4xl font-bold text-surface-light">Community Impressions</h2>
          </div>

          <section className="w-full pb-20">
            <div className="flex flex-wrap gap-8 justify-center">
              <div className="engraved-card px-12 py-8 rounded-2xl flex flex-col items-center gap-2 min-w-[220px]">
                <p className="text-4xl font-bold text-primary">12k+</p>
                <p className="text-text-muted text-sm font-medium uppercase tracking-wider">Active Minds</p>
              </div>
              <div className="engraved-card px-12 py-8 rounded-2xl flex flex-col items-center gap-2 min-w-[220px]">
                <p className="text-4xl font-bold text-primary">1.5M</p>
                <p className="text-text-muted text-sm font-medium uppercase tracking-wider">Ideas Generated</p>
              </div>
              <div className="engraved-card px-12 py-8 rounded-2xl flex flex-col items-center gap-2 min-w-[220px]">
                <p className="text-4xl font-bold text-primary">850k+</p>
                <p className="text-text-muted text-sm font-medium uppercase tracking-wider">Zen Hours</p>
              </div>
            </div>
          </section>

        </main>

        <footer className="w-full bg-background-dark py-12 px-6 border-t border-white/5 relative z-10">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary shadow-sm">
                <span className="material-symbols-outlined text-lg">spa</span>
              </div>
              <span className="font-bold text-lg text-surface-light">Idea.ai</span>
            </div>
            <div className="flex gap-8 text-sm text-text-muted">
              <a href="#" className="hover:text-primary transition-colors">Privacy</a>
              <a href="#" className="hover:text-primary transition-colors">Terms</a>
              <a href="#" className="hover:text-primary transition-colors">Contact</a>
            </div>
            <div className="text-sm text-text-muted">
              © 2023 Idea.ai Inc. All rights reserved.
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
