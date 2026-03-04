import { useEffect, useRef, useState } from 'react';

interface SelectionToolbarProps {
    selectedText: string;
    onExplain: () => void;
    onDismiss: () => void;
}

export default function SelectionToolbar({ selectedText, onExplain, onDismiss }: SelectionToolbarProps) {
    const toolbarRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

    useEffect(() => {
        if (!selectedText) {
            setPosition(null);
            return;
        }

        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) {
            setPosition(null);
            return;
        }

        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        setPosition({
            top: rect.top - 50,
            left: rect.left + rect.width / 2 - 60,
        });
    }, [selectedText]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
                onDismiss();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onDismiss]);

    if (!position || !selectedText) return null;

    return (
        <div
            ref={toolbarRef}
            className="selection-toolbar"
            style={{ top: position.top, left: position.left }}
        >
            <button onClick={onExplain}>
                💡 Explain
            </button>
        </div>
    );
}
