import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface NoteModalProps {
  isOpen: boolean;
  initialNote: string;
  onClose: () => void;
  onSave: (note: string) => void;
}

const NoteModal: React.FC<NoteModalProps> = ({ isOpen, initialNote, onClose, onSave }) => {
  const [note, setNote] = useState(initialNote);
  const modalRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setNote(initialNote);
  }, [initialNote, isOpen]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        textareaRef.current?.focus();
        // Move cursor to end
        if (textareaRef.current) {
            textareaRef.current.selectionStart = textareaRef.current.value.length;
            textareaRef.current.selectionEnd = textareaRef.current.value.length;
        }
      }, 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center backdrop-blur-sm">
      <div
        ref={modalRef}
        className="bg-white dark:bg-zinc-800 rounded-lg shadow-xl w-full max-w-lg text-gray-900 dark:text-white border border-gray-200 dark:border-zinc-700 flex flex-col"
      >
        <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-zinc-700">
          <h2 className="text-lg font-semibold">Edit Note</h2>
          <button onClick={onClose} className="text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="p-4">
          <textarea
            ref={textareaRef}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note to this flow..."
            className="w-full text-sm p-3 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded focus:ring-2 focus:ring-orange-500 focus:outline-none resize-none h-40 dark:text-zinc-200"
          />
        </div>

        <div className="flex justify-end items-center p-4 border-t border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900 rounded-b-lg">
          <button
            onClick={onClose}
            className="text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white px-4 py-2 rounded-md transition-colors text-sm"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(note)}
            className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 px-4 rounded-md ml-2 transition-colors text-sm"
          >
            Save Note
          </button>
        </div>
      </div>
    </div>
  );
};

export default NoteModal;
