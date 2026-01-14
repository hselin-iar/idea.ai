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
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center">
                    <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-8 max-w-md w-full mx-4 text-center">
                        <Loader2 className="w-12 h-12 animate-spin text-indigo-400 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold text-zinc-100 mb-2">Downloading AI Model</h3>
                        <p className="text-sm text-zinc-400 mb-4">{loadingText}</p>
                        <div className="w-full bg-zinc-800 rounded-full h-2">
                            <div
                                className="bg-indigo-500 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${loadingProgress * 100}%` }}
                            />
                        </div>
                        <p className="text-xs text-zinc-500 mt-2">{Math.round(loadingProgress * 100)}%</p>
                    </div>
                </div>
            )}

            {/* Confirmation Dialog for 3B */}
            {showConfirm && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center">
                    <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-md w-full mx-4">
                        <div className="flex items-start gap-3 mb-4">
                            <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
                            <div>
                                <h3 className="text-lg font-semibold text-zinc-100">Switch to Quality Mode?</h3>
                                <p className="text-sm text-zinc-400 mt-1">
                                    The 3B model provides better responses but requires more resources.
                                </p>
                            </div>
                        </div>

                        <div className="bg-zinc-800/50 rounded-lg p-4 mb-4 space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-zinc-400">Download Size:</span>
                                <span className="text-amber-400 font-medium">~1.8GB</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-zinc-400">RAM Required:</span>
                                <span className="text-amber-400 font-medium">~4GB</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-zinc-400">First Load:</span>
                                <span className="text-zinc-300">~40-60 seconds</span>
                            </div>
                        </div>

                        <p className="text-xs text-zinc-500 mb-4">
                            The model is cached after first download. Subsequent visits will load faster.
                        </p>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowConfirm(false)}
                                className="flex-1 px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmSwitch}
                                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors flex items-center justify-center gap-2"
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
                className="p-2 bg-zinc-800/80 hover:bg-zinc-700 rounded-lg border border-zinc-700 transition-colors"
                title="Model Settings"
            >
                <Settings size={16} className="text-zinc-400" />
            </button>

            {/* Dropdown */}
            {isOpen && (
                <div className="absolute top-full right-0 mt-2 w-64 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl overflow-hidden z-40">
                    <div className="p-3 border-b border-zinc-800">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-zinc-200">AI Model</span>
                            <button onClick={() => setIsOpen(false)} className="text-zinc-500 hover:text-zinc-300">
                                <X size={14} />
                            </button>
                        </div>
                    </div>

                    <div className="p-2">
                        {(Object.keys(MODEL_OPTIONS) as ModelSize[]).map((size) => {
                            const model = MODEL_OPTIONS[size];
                            const isSelected = size === currentModel;

                            return (
                                <button
                                    key={size}
                                    onClick={() => handleModelSelect(size)}
                                    className={`w-full p-3 rounded-lg text-left transition-colors ${isSelected
                                        ? 'bg-indigo-600/20 border border-indigo-500/30'
                                        : 'hover:bg-zinc-800 border border-transparent'
                                        }`}
                                >
                                    <div className="flex items-center gap-2 mb-1">
                                        <Cpu size={14} className={isSelected ? 'text-indigo-400' : 'text-zinc-500'} />
                                        <span className={`text-sm font-medium ${isSelected ? 'text-indigo-300' : 'text-zinc-200'}`}>
                                            {model.name}
                                        </span>
                                        {isSelected && (
                                            <span className="ml-auto text-xs bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded">
                                                Active
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-zinc-500 ml-5">{model.description}</p>
                                    <p className="text-xs text-zinc-600 ml-5 mt-1">
                                        {model.downloadSize} • {model.ramRequired} RAM
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
