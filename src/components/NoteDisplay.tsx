import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { StickyNote, Pencil, Trash } from 'lucide-react';

interface NoteDisplayProps {
  note: string;
  onEdit: () => void;
  onDelete: () => void;
}

export const NoteDisplay: React.FC<NoteDisplayProps> = ({ note, onEdit, onDelete }) => {
  if (!note) return null;

  return (
    <div className="break-inside-avoid bg-yellow-50 dark:bg-yellow-950/30 p-4 rounded border border-yellow-200 dark:border-yellow-900/50 mb-4 group relative">
      <div className="flex justify-between items-start mb-2">
        <h5 className="font-semibold text-yellow-700 dark:text-yellow-400 flex items-center gap-2">
          <StickyNote size={16} /> Note
        </h5>
        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
           <button
            onClick={onEdit}
            className="p-1 text-yellow-700 dark:text-yellow-400 hover:text-yellow-900 dark:hover:text-yellow-200 hover:bg-yellow-100 dark:hover:bg-yellow-900/50 rounded"
            title="Edit note"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={onDelete}
            className="p-1 text-yellow-700 dark:text-yellow-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-yellow-100 dark:hover:bg-yellow-900/50 rounded"
            title="Delete note"
          >
            <Trash size={14} />
          </button>
        </div>
      </div>
      <div className="prose prose-sm dark:prose-invert max-w-none text-gray-800 dark:text-zinc-200">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {note}
        </ReactMarkdown>
      </div>
    </div>
  );
};
