import { useEffect, useRef, useState, useCallback } from 'react';
import { ReactReader } from 'react-reader';
import { readFile } from '@tauri-apps/plugin-fs';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rendition = any;

interface EpubViewerProps {
    filePath: string;
    onTextSelected?: (text: string, chapter: string, positionData: object) => void;
}

export default function EpubViewer({ filePath, onTextSelected }: EpubViewerProps) {
    const [location, setLocation] = useState<string | number>(0);
    const [epubUrl, setEpubUrl] = useState<string | null>(null);
    const renditionRef = useRef<Rendition | null>(null);
    const [, setCurrentChapter] = useState('');

    // Load EPUB from file system
    useEffect(() => {
        let cancelled = false;
        let objectUrl: string | null = null;

        (async () => {
            try {
                const fileData = await readFile(filePath);
                const blob = new Blob([fileData], { type: 'application/epub+zip' });
                objectUrl = URL.createObjectURL(blob);
                if (!cancelled) {
                    setEpubUrl(objectUrl);
                }
            } catch (err) {
                console.error('Failed to load EPUB:', err);
            }
        })();

        return () => {
            cancelled = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [filePath]);

    const handleLocationChange = useCallback((loc: string) => {
        setLocation(loc);
    }, []);

    const handleRendition = useCallback((rendition: Rendition) => {
        renditionRef.current = rendition;

        // Apply dark theme styling to EPUB content
        rendition.themes.override('color', '#e8e6f0');
        rendition.themes.override('background', '#1a1a24');

        // Listen for text selection
        rendition.on('selected', (cfiRange: string, contents: { window: Window }) => {
            const selection = contents.window.getSelection();
            if (selection && selection.toString().trim()) {
                const text = selection.toString().trim();
                const chapter = rendition.location?.start?.href || '';
                setCurrentChapter(chapter);

                if (onTextSelected) {
                    onTextSelected(text, chapter, {
                        cfi: cfiRange,
                        chapter,
                    });
                }
            }
        });
    }, [onTextSelected]);

    if (!epubUrl) {
        return (
            <div className="viewer-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="text-muted">Loading EPUB...</span>
            </div>
        );
    }

    return (
        <div className="viewer-container">
            <div className="epub-container" style={{ height: '100%' }}>
                <ReactReader
                    url={epubUrl}
                    location={location}
                    locationChanged={handleLocationChange}
                    getRendition={handleRendition}
                    epubOptions={{
                        allowScriptedContent: true,
                    }}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    readerStyles={{
                        container: {
                            overflow: 'hidden',
                            height: '100%',
                        },
                        readerArea: {
                            backgroundColor: '#1a1a24',
                            transition: 'none',
                        },
                        reader: {
                            color: '#e8e6f0',
                        },
                        tocArea: {
                            background: '#16161d',
                            color: '#e8e6f0',
                        },
                        tocButtonBar: {
                            background: '#16161d',
                        },
                        tocButton: {
                            color: '#9a97ad',
                        },
                    } as never}
                />
            </div>
        </div>
    );
}
