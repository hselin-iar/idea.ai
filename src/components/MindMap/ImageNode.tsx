import { memo, useState } from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { ImageIcon, MoreVertical, Trash2, Copy, ChevronDown, ChevronRight } from 'lucide-react';
import { useStore } from '@/lib/store';

// Define the custom data type extending Record<string, unknown> as required by React Flow
interface ImageNodeData extends Record<string, unknown> {
    label: string;
    imageUrl?: string;
    description?: string;
}

const ImageNode = ({ id, data }: NodeProps<Node<ImageNodeData>>) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const deleteNode = useStore((state) => state.deleteNode);
    const duplicateNode = useStore((state) => state.duplicateNode);

    return (
        <div className="shadow-lg rounded-xl bg-zinc-900 border border-zinc-700 w-[200px] overflow-visible group hover:border-indigo-500 transition-colors relative">
            <Handle type="target" position={Position.Top} className="!bg-zinc-500 !w-2 !h-2" />

            {/* Menu Trigger */}
            <button
                className="absolute top-2 right-2 bg-zinc-900/80 p-1 rounded-md text-zinc-400 hover:text-zinc-100 z-10 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
                <MoreVertical size={14} />
            </button>

            {/* Context Menu */}
            {isMenuOpen && (
                <div className="absolute right-0 top-8 z-50 w-32 bg-zinc-800 border border-zinc-700 rounded-lg shadow-2xl py-1 flex flex-col"
                    onClick={(e) => e.stopPropagation()}
                    onMouseLeave={() => setIsMenuOpen(false)}>

                    <button onClick={() => { duplicateNode(id); setIsMenuOpen(false); }} className="px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-700 text-left flex items-center gap-2">
                        <Copy size={12} /> Copy
                    </button>
                    <div className="h-px bg-zinc-700 my-1" />
                    <button onClick={() => { deleteNode(id); setIsMenuOpen(false); }} className="px-3 py-2 text-xs text-red-400 hover:bg-zinc-700 text-left flex items-center gap-2">
                        <Trash2 size={12} /> Delete
                    </button>
                </div>
            )}

            {/* Image Placeholder or Actual Image */}
            <div className="h-32 bg-zinc-800 relative flex items-center justify-center overflow-hidden rounded-t-xl">
                {data.imageUrl ? (
                    <img src={data.imageUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                    <div className="bg-gradient-to-br from-indigo-900 via-purple-900 to-zinc-900 w-full h-full flex flex-col items-center justify-center p-4 text-center">
                        <ImageIcon className="text-white/20 w-8 h-8 mb-2" />
                        <span className="text-[10px] text-white/30 font-medium uppercase tracking-wider">Concept Image</span>
                    </div>
                )}

                {/* Overlay gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/40 to-transparent" />
            </div>

            <div className="p-3">
                <div className="text-sm font-semibold text-zinc-100 mb-1">{data.label}</div>
                {data.description && (
                    <div className="text-xs text-zinc-400 line-clamp-2">{data.description}</div>
                )}
            </div>

            <Handle type="source" position={Position.Bottom} className="!bg-zinc-500 !w-2 !h-2" />
        </div>
    );
};

export default memo(ImageNode);
