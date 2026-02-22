'use client';

import { useMemo, useState } from 'react';
import type { SectionBrief } from '@/lib/store';
import { Loader2 } from 'lucide-react';

interface SectionBriefPanelProps {
    sectionLabel: string;
    initialBrief?: SectionBrief;
    isSubmitting: boolean;
    onClose: () => void;
    onSkip: () => void;
    onSubmit: (payload: {
        sectionLabel: string;
        focus: string;
        mustInclude: string;
    }) => Promise<void>;
}

export default function SectionBriefPanel({
    sectionLabel,
    initialBrief,
    isSubmitting,
    onClose,
    onSkip,
    onSubmit,
}: SectionBriefPanelProps) {
    const [focus, setFocus] = useState(initialBrief?.focus || '');
    const [mustInclude, setMustInclude] = useState(initialBrief?.mustInclude || '');
    const [localError, setLocalError] = useState('');

    const canSubmit = useMemo(() => {
        return focus.trim().length >= 10;
    }, [focus]);

    const handleSubmit = async () => {
        if (!canSubmit) {
            setLocalError('Add a focused intent for this section.');
            return;
        }
        setLocalError('');
        await onSubmit({
            sectionLabel,
            focus: focus.trim(),
            mustInclude: mustInclude.trim(),
        });
    };

    return (
        <div className="absolute inset-0 z-[120] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-zinc-900/95 shadow-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-wider text-blue-300/80">Section Intake</p>
                        <h2 className="text-lg font-semibold text-white">{sectionLabel}</h2>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="text-xs px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-200 disabled:opacity-50"
                    >
                        Close
                    </button>
                </div>

                <div className="p-6 space-y-4 text-sm">
                    <p className="text-zinc-300">
                        Add only the highest-value context. Detailed discovery happens in chat and gets shared globally.
                    </p>
                    <label className="block">
                        <span className="text-zinc-200">Section focus *</span>
                        <textarea
                            value={focus}
                            onChange={(e) => setFocus(e.target.value)}
                            className="mt-1 w-full min-h-[72px] rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-zinc-100 focus:outline-none focus:border-blue-400"
                            placeholder="What should this section optimize or solve?"
                        />
                    </label>
                    <label className="block">
                        <span className="text-zinc-200">Must include (optional)</span>
                        <textarea
                            value={mustInclude}
                            onChange={(e) => setMustInclude(e.target.value)}
                            className="mt-1 w-full min-h-[64px] rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-zinc-100 focus:outline-none focus:border-blue-400"
                            placeholder="One key requirement for this section."
                        />
                    </label>
                </div>

                <div className="px-6 py-4 border-t border-white/10 flex items-center justify-between">
                    <p className="text-xs text-red-300">{localError}</p>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onSkip}
                            disabled={isSubmitting}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Skip for now
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={isSubmitting || !canSubmit}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                            Generate Section Plan
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
