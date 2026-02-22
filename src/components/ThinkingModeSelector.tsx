'use client';

import { clsx } from 'clsx';
import { useStore, ThinkingMode, THINKING_MODE_CONFIG } from '@/lib/store';

/**
 * Mode configuration for consistent rendering
 */
interface ModeButtonConfig {
    mode: ThinkingMode;
    label: string;
    icon: string;
    description: string;
    activeGradient: string;
    activeShadow: string;
}

/**
 * ThinkingModeSelector Component
 * 
 * Displays thinking mode buttons that change AI behavior.
 * Responsive: shows only icons on small screens, full labels on larger screens.
 */
export default function ThinkingModeSelector() {
    const thinkingMode = useStore((state) => state.thinkingMode);
    const setThinkingMode = useStore((state) => state.setThinkingMode);

    // Build mode configs with styling
    const modeConfigs: ModeButtonConfig[] = [
        {
            mode: 'explore',
            ...THINKING_MODE_CONFIG.explore,
            activeGradient: 'from-purple-600 to-purple-500',
            activeShadow: 'shadow-purple-500/25',
        },
        {
            mode: 'analyze',
            ...THINKING_MODE_CONFIG.analyze,
            activeGradient: 'from-blue-600 to-blue-500',
            activeShadow: 'shadow-blue-500/25',
        },
        {
            mode: 'create',
            ...THINKING_MODE_CONFIG.create,
            activeGradient: 'from-amber-500 to-orange-500',
            activeShadow: 'shadow-orange-500/25',
        },
        {
            mode: 'execute',
            ...THINKING_MODE_CONFIG.execute,
            activeGradient: 'from-emerald-600 to-emerald-500',
            activeShadow: 'shadow-emerald-500/25',
        },
    ];

    return (
        <div
            className="flex items-center justify-start gap-1 overflow-x-auto scrollbar-hide bg-background-dark/50 backdrop-blur-md border border-white/5 rounded-full p-1.5 shadow-engraved"
            role="radiogroup"
            aria-label="Thinking Framework"
        >
            {modeConfigs.map((config) => {
                const isActive = thinkingMode === config.mode;

                return (
                    <button
                        key={config.mode}
                        onClick={() => setThinkingMode(config.mode)}
                        title={config.description}
                        role="radio"
                        aria-checked={isActive}
                        aria-label={`${config.label}: ${config.description}`}
                        className={clsx(
                            // Base styles
                            'flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold tracking-wide transition-all duration-300 whitespace-nowrap flex-shrink-0',
                            // Active vs inactive styles
                            isActive
                                ? 'bg-background-dark text-primary shadow-[inset_2px_2px_4px_#1f1e1c,inset_-2px_-2px_4px_#35322e] border border-white/5'
                                : 'text-text-muted hover:text-text-main hover:bg-white/5 border border-transparent',
                        )}
                    >
                        <span className="text-sm opacity-80" aria-hidden="true">{config.icon}</span>
                        <span>{config.label}</span>
                    </button>
                );
            })}
        </div>
    );
}
