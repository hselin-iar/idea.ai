'use client';

import { useState } from 'react';
import { Settings, Cpu, AlertTriangle, X, Check, Loader2 } from 'lucide-react';
import { MODEL_OPTIONS, ModelSize, aiService } from '@/services/ai';
import { InitProgressReport } from '@mlc-ai/web-llm';

export default function ModelSelector() {
    const [isOpen, setIsOpen] = useState(false);
    const [currentModel, setCurrentModel] = useState<ModelSize>('1.5B');
    const [showConfirm, setShowConfirm] = useState(false);
    const [pendingModel, setPendingModel] = useState<ModelSize | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingProgress, setLoadingProgress] = useState(0);
    const [loadingText, setLoadingText] = useState('');

    const handleModelSelect = (size: ModelSize) => {
        if (size === currentModel) {
            setIsOpen(false);
            return;
        }

        if (size === '3B') {
            // Show confirmation for 3B
            setPendingModel(size);
            setShowConfirm(true);
        } else {
            // Direct switch for 1.5B
            switchToModel(size);
        }
    };

    const switchToModel = async (size: ModelSize) => {
        setIsLoading(true);
        setLoadingProgress(0);
        setLoadingText('Initializing...');
        setShowConfirm(false);
        setIsOpen(false);

        try {
            await aiService.switchModel(size, (report: InitProgressReport) => {
                setLoadingText(report.text);
                if (report.progress) setLoadingProgress(report.progress);
            });
            setCurrentModel(size);
        } catch (error) {
            console.error('Failed to switch model:', error);
        } finally {
            setIsLoading(false);
            setLoadingProgress(0);
            setLoadingText('');
        }
    };

    const confirmSwitch = () => {
        if (pendingModel) {
            switchToModel(pendingModel);
        }
    };

    return (
        <>
            {/* Loading Overlay */}
            {isLoading && (
                <div className="fixed inset-0 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-sm z-50 flex items-center justify-center">
                    <div className="glass rounded-2xl p-8 max-w-md w-full mx-4 text-center shadow-neumorphic dark:shadow-neumorphic-dark">
                        <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
                        <h3 className="text-lg font-semibold text-text-main dark:text-surface-light mb-2">Downloading AI Model</h3>
                        <p className="text-sm text-text-muted mb-4">{loadingText}</p>
                        <div className="w-full bg-surface-light dark:bg-surface-dark rounded-full h-2 overflow-hidden input-groove">
                            <div
                                className="bg-primary h-2 rounded-full transition-all duration-300"
                                style={{ width: `${loadingProgress * 100}%` }}
                            />
                        </div>
                        <p className="text-xs text-text-muted mt-2">{Math.round(loadingProgress * 100)}%</p>
                    </div>
                </div>
            )}

            {/* Confirmation Dialog for 3B */}
            {showConfirm && (
                <div className="fixed inset-0 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-sm z-50 flex items-center justify-center">
                    <div className="glass rounded-2xl p-6 max-w-md w-full mx-4 shadow-neumorphic dark:shadow-neumorphic-dark">
                        <div className="flex items-start gap-3 mb-4">
                            <AlertTriangle className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
                            <div>
                                <h3 className="text-lg font-semibold text-text-main dark:text-surface-light">Switch to Quality Mode?</h3>
                                <p className="text-sm text-text-muted mt-1">
                                    The 3B model provides better responses but requires more resources.
                                </p>
                            </div>
                        </div>

                        <div className="bg-surface-light/50 dark:bg-surface-dark/50 rounded-xl p-4 mb-6 space-y-2 border border-white/20 dark:border-white/5">
                            <div className="flex justify-between text-sm">
                                <span className="text-text-muted">Download Size:</span>
                                <span className="text-amber-600 dark:text-amber-400 font-medium">~1.8GB</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-text-muted">RAM Required:</span>
                                <span className="text-amber-600 dark:text-amber-400 font-medium">~4GB</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-text-muted">First Load:</span>
                                <span className="text-text-main dark:text-surface-light">~40-60 seconds</span>
                            </div>
                        </div>

                        <p className="text-xs text-text-muted mb-6">
                            The model is cached after first download. Subsequent visits will load faster.
                        </p>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowConfirm(false)}
                                className="flex-1 px-4 py-2.5 rounded-xl text-text-muted hover:text-text-main hover:bg-surface-light dark:hover:bg-surface-dark transition-colors font-medium"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmSwitch}
                                className="flex-1 px-4 py-2.5 bg-primary text-white rounded-xl hover:bg-primary/90 transition-all shadow-lg shadow-primary/25 flex items-center justify-center gap-2 font-medium"
                            >
                                <Check size={16} />
                                Continue
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Settings Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-10 h-10 neumorphic-btn rounded-full flex items-center justify-center text-text-muted hover:text-primary active:scale-95 transition-all"
                title="Model Settings"
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                aria-label="Select AI Model"
            >
                <Settings size={18} />
            </button>

            {/* Dropdown */}
            {isOpen && (
                <div className="absolute top-12 right-0 mt-2 w-72 glass rounded-2xl shadow-neumorphic dark:shadow-neumorphic-dark overflow-hidden z-40 animate-fade-in">
                    <div className="p-4 border-b border-white/20 dark:border-white/5 bg-surface-light/30 dark:bg-surface-dark/30">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-text-main dark:text-surface-light">AI Model Configuration</span>
                            <button onClick={() => setIsOpen(false)} aria-label="Close Model Configuration" className="text-text-muted hover:text-text-main transition-colors">
                                <X size={16} />
                            </button>
                        </div>
                    </div>

                    <div className="p-2 space-y-1" role="listbox" aria-label="AI Models">
                        {(Object.keys(MODEL_OPTIONS) as ModelSize[]).map((size) => {
                            const model = MODEL_OPTIONS[size];
                            const isSelected = size === currentModel;

                            return (
                                <button
                                    key={size}
                                    onClick={() => handleModelSelect(size)}
                                    role="option"
                                    aria-selected={isSelected}
                                    className={`w-full p-3 rounded-xl text-left transition-all ${isSelected
                                        ? 'bg-primary/10 border border-primary/20 shadow-sm'
                                        : 'hover:bg-surface-light/50 dark:hover:bg-surface-dark/50 border border-transparent'
                                        }`}
                                >
                                    <div className="flex items-center gap-2 mb-1">
                                        <Cpu size={16} className={isSelected ? 'text-primary' : 'text-text-muted'} />
                                        <span className={`text-sm font-bold ${isSelected ? 'text-primary' : 'text-text-main dark:text-surface-light'}`}>
                                            {model.name}
                                        </span>
                                        {isSelected && (
                                            <span className="ml-auto text-[10px] uppercase tracking-wider bg-primary/20 text-primary px-2 py-0.5 rounded-full font-bold">
                                                Active
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-text-muted ml-6 mb-1">{model.description}</p>
                                    <p className="text-[10px] text-text-muted/70 ml-6 flex items-center gap-2">
                                        <span className="bg-surface-light dark:bg-surface-dark px-1.5 py-0.5 rounded text-text-main dark:text-surface-light/80">{model.downloadSize}</span>
                                        <span className="bg-surface-light dark:bg-surface-dark px-1.5 py-0.5 rounded text-text-main dark:text-surface-light/80">{model.ramRequired} RAM</span>
                                    </p>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </>
    );
}
