import { useState, useCallback } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import './App.css';
import PdfViewer from './components/PdfViewer';
import EpubViewer from './components/EpubViewer';
import AiPanel from './components/AiPanel';
import SelectionToolbar from './components/SelectionToolbar';
import SettingsDialog from './components/SettingsDialog';
import {
  insertDocument,
  insertAnnotation,
  insertConversation,
  getRecentDocuments,
  getAnnotationsForDocument,
  getConversationsForAnnotation,
  type Document,
  type Annotation,
} from './services/database';
import { getApiKey } from './services/settings';
import { useEffect } from 'react';

interface ActiveSelection {
  text: string;
  pageOrChapter: string;
  positionData: object;
}

interface ActiveConversation {
  conversationId: string;
  annotationId: string;
  selectedText: string;
  existingMessages: Array<{ role: 'user' | 'model'; text: string }>;
}

function generateId(): string {
  return crypto.randomUUID();
}

function getFileType(path: string): 'pdf' | 'epub' | null {
  const lower = path.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.epub')) return 'epub';
  return null;
}

function getFileName(path: string): string {
  return path.split('/').pop()?.replace(/\.(pdf|epub)$/i, '') || 'Untitled';
}

export default function App() {
  const [currentFile, setCurrentFile] = useState<{ path: string; type: 'pdf' | 'epub'; docId: string } | null>(null);
  const [selection, setSelection] = useState<ActiveSelection | null>(null);
  const [conversation, setConversation] = useState<ActiveConversation | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recentFiles, setRecentFiles] = useState<Document[]>([]);
  const [highlights, setHighlights] = useState<Annotation[]>([]);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' } | null>(null);

  // Load recent files on mount
  useEffect(() => {
    loadRecentFiles();
  }, []);

  // Load highlights when document changes
  useEffect(() => {
    if (currentFile) {
      loadHighlights(currentFile.docId);
    }
  }, [currentFile]);

  const loadRecentFiles = async () => {
    try {
      const docs = await getRecentDocuments();
      setRecentFiles(docs);
    } catch {
      // DB may not be ready yet on first launch
    }
  };

  const loadHighlights = async (documentId: string) => {
    try {
      const annotations = await getAnnotationsForDocument(documentId);
      setHighlights(annotations);
    } catch (err) {
      console.error('Failed to load highlights:', err);
    }
  };

  const showToast = (message: string, type: 'error' | 'success' = 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleOpenFile = async () => {
    const selected = await open({
      multiple: false,
      filters: [
        { name: 'Documents', extensions: ['pdf', 'epub'] },
      ],
    });

    if (selected && typeof selected === 'string') {
      await openDocument(selected);
    }
  };

  const openDocument = async (path: string) => {
    const type = getFileType(path);
    if (!type) {
      showToast('Unsupported file type. Please open a PDF or EPUB file.');
      return;
    }

    const docId = generateId();
    const title = getFileName(path);

    try {
      await insertDocument({
        id: docId,
        title,
        file_path: path,
        file_hash: docId, // simplified hash for now
        file_type: type,
        metadata: '{}',
      });
    } catch {
      // Document may already exist — that's fine
    }

    setCurrentFile({ path, type, docId });
    setConversation(null);
    setSelection(null);
    await loadRecentFiles();
  };

  const handleTextSelected = useCallback((text: string, pageOrChapter: string | number, positionData: object) => {
    setSelection({
      text,
      pageOrChapter: String(pageOrChapter),
      positionData,
    });
  }, []);

  const handleExplain = async () => {
    if (!selection || !currentFile) return;

    // Check for API key
    const apiKey = await getApiKey();
    if (!apiKey) {
      showToast('Please configure your Gemini API key in Settings.');
      setSettingsOpen(true);
      return;
    }

    // Create annotation
    const annotationId = generateId();
    await insertAnnotation({
      id: annotationId,
      document_id: currentFile.docId,
      page_or_chapter: selection.pageOrChapter,
      selection_type: 'text',
      selected_text: selection.text,
      region_image: null,
      position_data: JSON.stringify(selection.positionData),
    });

    // Create conversation
    const conversationId = generateId();
    await insertConversation({
      id: conversationId,
      annotation_id: annotationId,
      mode: 'explain',
      messages: '[]',
      summary: '',
    });

    setConversation({
      conversationId,
      annotationId,
      selectedText: selection.text,
      existingMessages: [],
    });
    setSelection(null);
    await loadHighlights(currentFile.docId);
  };

  const handleHighlightClick = async (annotation: Annotation) => {
    try {
      const conversations = await getConversationsForAnnotation(annotation.id);
      if (conversations.length > 0) {
        const conv = conversations[0];
        const messages = JSON.parse(conv.messages) as Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>;
        setConversation({
          conversationId: conv.id,
          annotationId: annotation.id,
          selectedText: annotation.selected_text || '',
          existingMessages: messages.map(m => ({
            role: m.role,
            text: m.parts[0]?.text || '',
          })),
        });
      }
    } catch (err) {
      console.error('Failed to load conversation:', err);
    }
  };

  // Suppress unused variable warning — will be used when highlight rendering is added
  void highlights;
  void handleHighlightClick;

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <div className="sidebar">
        <button className="sidebar-btn" onClick={handleOpenFile} title="Open File">
          📂
        </button>
        <button
          className="sidebar-btn"
          onClick={() => {
            setCurrentFile(null);
            setConversation(null);
            setSelection(null);
          }}
          title="Home"
        >
          🏠
        </button>
        <div className="sidebar-spacer" />
        <button className="sidebar-btn" onClick={() => setSettingsOpen(true)} title="Settings">
          ⚙️
        </button>
      </div>

      {/* Main Content */}
      <div className="content-area">
        {!currentFile ? (
          /* Welcome Screen */
          <div className="welcome-screen">
            <div className="welcome-logo">📚</div>
            <h1 className="welcome-title">Study Buddy</h1>
            <p className="welcome-subtitle">
              Open a PDF or EPUB, highlight any passage you don't understand,
              and let AI explain it to you.
            </p>
            <button className="open-file-btn" onClick={handleOpenFile}>
              📂 Open a Document
            </button>

            {recentFiles.length > 0 && (
              <div className="recent-files">
                <div className="recent-files-header">Recent Files</div>
                {recentFiles.map(doc => (
                  <div
                    key={doc.id}
                    className="recent-file-item"
                    onClick={() => openDocument(doc.file_path)}
                  >
                    <div className={`recent-file-icon ${doc.file_type}`}>
                      {doc.file_type.toUpperCase()}
                    </div>
                    <div className="recent-file-info">
                      <div className="recent-file-title">{doc.title}</div>
                      <div className="recent-file-path">{doc.file_path}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Document Viewer */
          <>
            {currentFile.type === 'pdf' ? (
              <PdfViewer
                filePath={currentFile.path}
                onTextSelected={(text, page, posData) => handleTextSelected(text, page, posData)}
              />
            ) : (
              <EpubViewer
                filePath={currentFile.path}
                onTextSelected={(text, chapter, posData) => handleTextSelected(text, chapter, posData)}
              />
            )}

            {/* Selection Toolbar */}
            {selection && (
              <SelectionToolbar
                selectedText={selection.text}
                onExplain={handleExplain}
                onDismiss={() => setSelection(null)}
              />
            )}

            {/* AI Panel */}
            {conversation && (
              <AiPanel
                selectedText={conversation.selectedText}
                conversationId={conversation.conversationId}
                annotationId={conversation.annotationId}
                existingMessages={conversation.existingMessages}
                onClose={() => setConversation(null)}
              />
            )}
          </>
        )}
      </div>

      {/* Settings Dialog */}
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Toast */}
      {toast && (
        <div className={`toast ${toast.type}`}>{toast.message}</div>
      )}
    </div>
  );
}
