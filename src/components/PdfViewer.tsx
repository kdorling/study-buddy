import { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { readFile } from '@tauri-apps/plugin-fs';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url
).toString();

interface PdfViewerProps {
    filePath: string;
    onTextSelected?: (text: string, page: number, positionData: object) => void;
}

export default function PdfViewer({ filePath, onTextSelected }: PdfViewerProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const textLayerRef = useRef<HTMLDivElement>(null);
    const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [scale, setScale] = useState(1.4);
    const [pageInput, setPageInput] = useState('1');

    // Load PDF
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const fileData = await readFile(filePath);
                const doc = await pdfjsLib.getDocument({ data: fileData }).promise;
                if (!cancelled) {
                    setPdfDoc(doc);
                    setTotalPages(doc.numPages);
                    setCurrentPage(1);
                    setPageInput('1');
                }
            } catch (err) {
                console.error('Failed to load PDF:', err);
            }
        })();
        return () => { cancelled = true; };
    }, [filePath]);

    // Render current page
    useEffect(() => {
        if (!pdfDoc || !canvasRef.current || !textLayerRef.current) return;
        let cancelled = false;

        (async () => {
            const page = await pdfDoc.getPage(currentPage);
            const viewport = page.getViewport({ scale });
            const canvas = canvasRef.current!;
            const ctx = canvas.getContext('2d')!;

            canvas.width = viewport.width;
            canvas.height = viewport.height;
            canvas.style.width = `${viewport.width}px`;
            canvas.style.height = `${viewport.height}px`;

            if (cancelled) return;

            await page.render({ canvasContext: ctx, viewport, canvas } as never).promise;

            // Render text layer
            const textContent = await page.getTextContent();
            const textLayer = textLayerRef.current!;
            textLayer.innerHTML = '';
            textLayer.style.width = `${viewport.width}px`;
            textLayer.style.height = `${viewport.height}px`;

            textContent.items.forEach((item) => {
                if (!('str' in item)) return;
                const tx = pdfjsLib.Util.transform(
                    viewport.transform,
                    item.transform
                );
                const span = document.createElement('span');
                span.textContent = item.str;
                span.style.left = `${tx[4]}px`;
                span.style.top = `${tx[5] - item.height * scale}px`;
                span.style.fontSize = `${item.height * scale}px`;
                span.style.fontFamily = item.fontName || 'sans-serif';
                if (item.width > 0) {
                    const textWidth = item.str.length * (item.height * scale * 0.6);
                    const scaleX = (item.width * scale) / textWidth;
                    span.style.transform = `scaleX(${scaleX})`;
                }
                textLayer.appendChild(span);
            });
        })();

        return () => { cancelled = true; };
    }, [pdfDoc, currentPage, scale]);

    // Handle text selection
    const handleMouseUp = useCallback(() => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || !selection.toString().trim()) return;

        const text = selection.toString().trim();
        const range = selection.getRangeAt(0);
        const rects = Array.from(range.getClientRects());

        if (onTextSelected && rects.length > 0) {
            const container = textLayerRef.current?.getBoundingClientRect();
            if (container) {
                const normalizedRects = rects.map(r => ({
                    x: (r.left - container.left) / container.width,
                    y: (r.top - container.top) / container.height,
                    w: r.width / container.width,
                    h: r.height / container.height,
                }));
                onTextSelected(text, currentPage, {
                    page: currentPage,
                    rects: normalizedRects,
                });
            }
        }
    }, [onTextSelected, currentPage]);

    const goToPage = (page: number) => {
        const p = Math.max(1, Math.min(totalPages, page));
        setCurrentPage(p);
        setPageInput(String(p));
    };

    const handlePageInputSubmit = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            const n = parseInt(pageInput, 10);
            if (!isNaN(n)) goToPage(n);
        }
    };

    return (
        <div className="viewer-container">
            <div className="viewer-toolbar">
                <div className="viewer-toolbar-group">
                    <button className="toolbar-btn" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1}>
                        ◀
                    </button>
                    <input
                        className="page-input"
                        value={pageInput}
                        onChange={(e) => setPageInput(e.target.value)}
                        onKeyDown={handlePageInputSubmit}
                        onBlur={() => setPageInput(String(currentPage))}
                    />
                    <span className="page-total">/ {totalPages}</span>
                    <button className="toolbar-btn" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages}>
                        ▶
                    </button>
                </div>

                <div className="viewer-toolbar-separator" />

                <div className="viewer-toolbar-group">
                    <button className="toolbar-btn" onClick={() => setScale(s => Math.max(0.5, s - 0.2))}>−</button>
                    <span className="page-total">{Math.round(scale * 100)}%</span>
                    <button className="toolbar-btn" onClick={() => setScale(s => Math.min(3, s + 0.2))}>+</button>
                </div>
            </div>

            <div className="viewer-scroll-container">
                <div className="pdf-page-wrapper" onMouseUp={handleMouseUp}>
                    <canvas ref={canvasRef} />
                    <div ref={textLayerRef} className="pdf-text-layer" />
                </div>
            </div>
        </div>
    );
}
