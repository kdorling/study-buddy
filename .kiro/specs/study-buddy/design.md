# Design Document: Study Buddy

## Overview

Study Buddy is a cross-platform desktop application built with Tauri 2 (Rust backend) and React 19 (TypeScript frontend). The application enables students to read PDF and EPUB documents, select passages they find difficult, and receive AI-powered explanations through Google's Gemini API. The architecture follows a clear separation between the Tauri backend (file system access, database operations) and the React frontend (UI rendering, user interactions).

The application uses a local SQLite database to persist documents, annotations, and conversation history, ensuring that students can return to their study sessions and review previous explanations. The design emphasizes simplicity and clarity, with a dark-themed interface optimized for extended reading sessions.

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     React Frontend (TypeScript)              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  App.tsx     │  │  PDF Viewer  │  │  EPUB Viewer │      │
│  │  (Main)      │  │              │  │              │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  AI Panel    │  │  Selection   │  │  Settings    │      │
│  │              │  │  Toolbar     │  │  Dialog      │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Database    │  │  LLM         │  │  Settings    │      │
│  │  Service     │  │  Service     │  │  Service     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ Tauri IPC
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     Tauri Backend (Rust)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  File System │  │  SQLite      │  │  HTTP Client │      │
│  │  Plugin      │  │  Plugin      │  │  Plugin      │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│  ┌──────────────┐  ┌──────────────┐                         │
│  │  Dialog      │  │  Store       │                         │
│  │  Plugin      │  │  Plugin      │                         │
│  └──────────────┘  └──────────────┘                         │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
                  ┌──────────────────────┐
                  │  External Services   │
                  │  - Gemini API        │
                  └──────────────────────┘
```

### Component Responsibilities

**Frontend Components:**
- **App.tsx**: Main application orchestrator, manages global state (current document, active selection, conversation state), handles navigation between screens
- **PdfViewer**: Renders PDF pages using PDF.js, handles page navigation and zoom, manages text layer for selection
- **EpubViewer**: Renders EPUB content using react-reader library, handles chapter navigation, applies dark theme styling
- **AiPanel**: Displays conversation history, handles message input, renders markdown with math support
- **SelectionToolbar**: Floating toolbar that appears on text selection, provides "Explain" action
- **SettingsDialog**: Configuration interface for API key and model selection, connection testing
- **LibraryScreen**: Lists all stored documents (including hidden-from-recent); supports opening, restoring to recent, and deleting stored data

**Service Modules:**
- **database.ts**: Abstracts all SQLite operations, provides typed interfaces for documents, annotations, and conversations
- **llm.ts**: Thin frontend shim that invokes the Rust `call_gemini` command and listens for streamed chunk events; contains no API key handling or HTTP logic
- **settings.ts**: Manages persistent user settings using Tauri Store plugin

**Backend (Tauri):**
- Provides secure access to file system, database, and network
- Enforces security boundaries between web content and system resources
- Handles database migrations on application startup
- Exposes a `compute_file_hash` command that accepts a file path and returns the SHA-256 hex digest asynchronously, keeping hash computation off the UI thread
- Exposes a `call_gemini` command (`src-tauri/src/llm.rs`) that reads the API key from the store, makes SSE requests to Gemini, and emits chunk events back to the frontend — the API key never enters the webview context

**Error Boundaries:**
- A React error boundary component wraps `PdfViewer` and `EpubViewer` independently, so a rendering crash in one viewer (e.g., a malformed PDF) does not bring down the whole app
- The boundary renders a fallback UI with an error message and a "Close document" button that resets state to the home screen
- `AiPanel` is also wrapped so a markdown/KaTeX rendering failure is contained

## Components and Interfaces

### App Component

The main application component manages global state and orchestrates interactions between child components.

**State:**
```typescript
// State management via zustand store (src/store/appStore.ts)
// Split into logical slices for better organization and selective subscriptions

interface DocumentSlice {
  currentFile: { path: string; type: 'pdf' | 'epub'; docId: string } | null;
  recentFiles: Document[];
  highlights: Annotation[];
  lastPosition: string | null;  // Saved page number (PDF) or CFI (EPUB) for current document
  documentState: 'loading' | 'loaded' | 'error';  // Explicit state machine for document lifecycle
  
  setCurrentFile: (file: DocumentSlice['currentFile']) => void;
  setDocumentState: (state: DocumentSlice['documentState']) => void;
  loadRecentFiles: () => Promise<void>;
  loadHighlights: (docId: string) => Promise<void>;
}

interface UISlice {
  selection: ActiveSelection | null;
  conversation: ActiveConversation | null;
  settingsOpen: boolean;
  annotationsPanelOpen: boolean;
  toast: { message: string; type: 'error' | 'success'; autoDismiss: boolean } | null;
  
  setSelection: (sel: ActiveSelection | null) => void;
  openConversation: (conv: ActiveConversation) => void;
  closeConversation: () => void;
  showToast: (message: string, type: 'error' | 'success') => void;
}

interface ConversationSlice {
  activeConversationId: string | null;
  streamingText: string;
  conversationState: 'idle' | 'streaming' | 'complete' | 'error';
  
  setConversationState: (state: ConversationSlice['conversationState']) => void;
  appendStreamingText: (chunk: string) => void;
  resetStreamingText: () => void;
}

// Combined store type
type AppStore = DocumentSlice & UISlice & ConversationSlice;
```

**State Management:**
- Use zustand with slices pattern for better organization and to prevent unnecessary re-renders
- Each component subscribes only to the state slices it needs using selectors
- The PDF canvas re-renders only when page/zoom changes, not on every app state update
- Document lifecycle follows explicit state machine: loading → loaded → error
- Conversation lifecycle follows explicit state machine: idle → streaming → complete → error

```typescript
type PositionData =
  | { type: 'pdf'; page: number; rects: Array<{ x: number; y: number; w: number; h: number }> }
  | { type: 'epub'; cfi: string; chapter: string };

interface ActiveSelection {
  text: string;
  pageOrChapter: string;
  positionData: PositionData;
}

interface ActiveConversation {
  conversationId: string;
  annotationId: string;
  selectedText: string;
  existingMessages: Array<{ role: 'user' | 'model'; text: string }>;
}
```

**Key Methods:**
- `handleOpenFile()`: Opens file picker dialog, validates file type, calls `openDocument()`
- `openDocument(path)`: Creates document record, updates state, loads recent files
- `handleTextSelected(text, location, posData)`: Updates selection state, triggers toolbar display
- `handleAnnotate()`: Creates annotation without conversation, dismisses toolbar
- `handleExplain()`: Validates API key, creates annotation and conversation, opens AI panel
- `handleAnnotationClick(annotation)`: Loads all conversations for the annotation; opens the most recent one in the AI panel, with UI affordance to switch to other conversations or start a new one
- `showToast(message, type)`: Displays temporary notification

### PDF Viewer Component

Renders PDF documents using PDF.js library with text selection support.

**Props:**
```typescript
interface PdfViewerProps {
  filePath: string;
  annotations?: Annotation[];
  onTextSelected?: (text: string, page: number, positionData: object) => void;
  onAnnotationClick?: (annotation: Annotation) => void;
}
```

**State:**
```typescript
interface PdfViewerState {
  pdfDoc: PDFDocumentProxy | null;
  currentPage: number;
  totalPages: number;
  scale: number;
  pageInput: string;
}
```

**Rendering Process:**
1. Load PDF file from file system using Tauri FS plugin
2. Parse PDF using PDF.js `getDocument()`
3. Render current page to canvas at specified scale
4. Extract text content and create text layer overlay
5. Position text spans to match PDF layout using transform matrices

**PDF.js Worker Configuration:**
- PDF.js requires a web worker for parsing to avoid blocking the main thread
- In Tauri's webview context, configure the worker URL explicitly: `pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.js'`
- Copy `pdf.worker.js` from `pdfjs-dist/build/` to the `public/` directory during build
- Ensure CSP (Content Security Policy) in `tauri.conf.json` allows `worker-src 'self'` to permit worker instantiation
- Test worker loading on all target platforms (Windows, macOS, Linux) as path resolution can differ

**Text Selection:**
- Listen for `mouseup` events on text layer
- Capture browser selection using `window.getSelection()`
- Extract bounding rectangles for selected text
- Normalize coordinates relative to page dimensions (0-1 range)
- Invoke `onTextSelected` callback with text, page number, and normalized rectangles

**Navigation:**
- Previous/Next buttons: Increment/decrement page number with bounds checking
- Page input: Allow direct page number entry with Enter key submission
- Zoom controls: Adjust scale factor (0.5x to 3.0x) and re-render current page

**Annotation Display:**
- Render highlight overlays for annotations on current page
- Use position data to draw semi-transparent rectangles over annotated text
- Apply distinct styling (e.g., yellow highlight with 30% opacity)
- Make annotation overlays clickable to trigger `onAnnotationClick` callback
- Update annotation display when page changes or zoom level adjusts

### EPUB Viewer Component

Renders EPUB documents using react-reader library with CFI-based location tracking.

**Props:**
```typescript
interface EpubViewerProps {
  filePath: string;
  annotations?: Annotation[];
  onTextSelected?: (text: string, chapter: string, positionData: object) => void;
  onAnnotationClick?: (annotation: Annotation) => void;
}
```

**State:**
```typescript
interface EpubViewerState {
  location: string | number;
  epubUrl: string | null;
  currentChapter: string;
}
```

**Rendering Process:**
1. Load EPUB file from file system using Tauri FS plugin
2. Create Blob from file data with MIME type `application/epub+zip`
3. Generate object URL for Blob
4. Pass URL to ReactReader component
5. Apply dark theme overrides to EPUB content

**Text Selection:**
- Register `selected` event listener on rendition
- Capture CFI (Canonical Fragment Identifier) range
- Extract selected text from iframe window
- Invoke `onTextSelected` callback with text, chapter href, and CFI

**Known Limitations:**
- react-reader wraps epub.js, which renders content into an iframe
- Text selection across iframe boundaries can be unreliable on some platforms
- The `selected` event may not fire consistently on all operating systems (known issue with Chromium-based webviews on Linux)
- **Fallback strategy for broken selection events:**
  - If `selected` events are not firing, implement a polling fallback: on `mouseup` events, poll `window.getSelection()` within the iframe context every 100ms for up to 500ms
  - If no selection is detected after polling, accept that EPUB text selection may be broken on this platform
  - For MVP, EPUB text selection is best-effort; if it fails on Linux, document the limitation and prioritize PDF support
  - Post-MVP: Consider alternative EPUB rendering libraries (e.g., Foliate's approach) or native text layer extraction
- Cross-iframe selection (spanning multiple chapters) is not supported by epub.js

**CFI (Canonical Fragment Identifier):**
- Standard format for identifying locations in EPUB documents
- Persists across different renderings and devices
- Format: `/6/4[chap01ref]!/4/2/42:3` (example)
- Used for annotation position tracking

**Annotation Display:**
- Use react-reader's annotation API to display highlights
- Apply CFI ranges from annotation position data
- Render highlights with semi-transparent styling
- Make annotation highlights clickable to trigger `onAnnotationClick` callback
- Persist annotation display across chapter navigation

### AI Panel Component

Displays conversation history and handles user input for follow-up questions.

**Props:**
```typescript
interface AiPanelProps {
  selectedText: string | null;
  annotationId: string | null;
  conversations: Conversation[];      // All conversations for this annotation, ordered by created_at
  activeConversationId: string | null; // Which conversation is currently displayed
  onSwitchConversation: (id: string) => void;
  onNewConversation: () => void;       // Start a fresh conversation for the same annotation
  onClose: () => void;
}

interface DisplayMessage {
  role: 'user' | 'model';
  text: string;
}
```

**Multiple Conversations:**
- An annotation can accumulate multiple conversations over time (e.g., the student revisits a passage later and wants a fresh explanation)
- The panel header shows a conversation picker when more than one conversation exists, allowing the user to switch between them
- "New conversation" starts a new conversation record for the same annotation; it does not delete previous ones
- The most recent conversation is shown by default when opening an annotation

**State:**
```typescript
interface AiPanelState {
  messages: DisplayMessage[];
  streamingText: string;   // Accumulates the in-progress AI response during streaming;
                           // rendered as a temporary trailing message, then committed
                           // to `messages` and reset to '' on stream completion
  input: string;
  loading: boolean;
  error: string | null;
}
```

**Conversation Flow:**
1. On mount with new selection: Auto-send initial "explain" request
2. Display loading indicator while waiting for response
3. Render AI response with markdown and math support
4. Persist messages to database after each exchange
5. Allow follow-up questions with full conversation context

**Message Rendering:**
- User messages: Plain text display
- AI messages: Markdown rendering with react-markdown
- Math support: remark-math + rehype-katex for LaTeX rendering
- Inline math: `$equation$` syntax
- Block math: `$$equation$$` syntax

**Input Handling:**
- Enter key: Send message
- Shift+Enter: Insert newline without sending
- Disable input while loading
- Clear input field after sending

### Selection Toolbar Component

Floating toolbar that appears when text is selected, offering options to annotate or explain.

**Props:**
```typescript
interface SelectionToolbarProps {
  selectedText: string;
  onAnnotate: () => void;
  onExplain: () => void;
  onDismiss: () => void;
}
```

**Buttons:**
- "Annotate": Saves the selection without triggering AI explanation
- "Explain": Saves the selection and immediately requests AI explanation

**Positioning:**
- Calculate position based on selection bounding rectangle
- Center toolbar horizontally relative to selection
- Position toolbar 50px above selection
- Update position when selection changes

**Interaction:**
- Click "Annotate" button: Invoke `onAnnotate` callback, dismiss toolbar
- Click "Explain" button: Invoke `onExplain` callback
- Click outside toolbar: Invoke `onDismiss` callback
- Dismiss on document scroll or window resize

### Settings Dialog Component

Modal dialog for configuring API key and model selection.

**Props:**
```typescript
interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}
```

**State:**
```typescript
interface SettingsDialogState {
  apiKey: string;
  selectedModel: string;
  showKey: boolean;
  testing: boolean;
  testResult: { ok: boolean; message: string } | null;
}
```

**Available Models:**
- Default models: gemini-2.5-flash, gemini-2.5-pro, gemini-2.5-flash-lite
- Model list should be configurable without code changes:
  - Option 1: Store model list in `settings.json` with a default fallback
  - Option 2: Fetch available models from Gemini API on Settings dialog open (requires API key)
- For MVP, use a hardcoded list with a TODO comment to make it configurable post-MVP
- Future enhancement: Add a "Refresh Models" button in Settings that queries the API for the latest available models

**Connection Testing:**
1. Temporarily save API key and model
2. Send test message: "Say 'Connection successful!' in exactly those words."
3. Wait for response
4. Display success or error feedback
5. Keep settings if test succeeds

### Database Service

Provides typed interfaces for all database operations.

**Interface:**
```typescript
interface DatabaseService {
  // Documents
  insertDocument(doc: Omit<Document, 'last_opened' | 'hidden_from_recent'>): Promise<void>;
  getRecentDocuments(limit?: number, offset?: number): Promise<Document[]>;  // Returns only hidden_from_recent = 0
  getAllDocuments(limit?: number, offset?: number): Promise<Document[]>;      // Library view — returns all rows
  updateLastOpened(id: string): Promise<void>;
  updateLastPosition(id: string, position: string): Promise<void>;  // Callers must debounce; recommended interval: 500ms
  hideFromRecent(id: string): Promise<void>;    // Sets hidden_from_recent = 1; data preserved
  restoreToRecent(id: string): Promise<void>;   // Sets hidden_from_recent = 0
  deleteDocument(id: string): Promise<void>;    // Full delete with cascade — used from Library only

  // Annotations
  insertAnnotation(ann: Omit<Annotation, 'created_at'>): Promise<void>;
  getAnnotationsForDocument(documentId: string): Promise<Annotation[]>;
  updateAnnotationNote(id: string, note: string): Promise<void>;

  // Conversations
  insertConversation(conv: Omit<Conversation, 'created_at' | 'updated_at'>): Promise<void>;
  updateConversationMessages(id: string, messages: string): Promise<void>;
  getConversationsForAnnotation(annotationId: string): Promise<Conversation[]>;

  // Annotation management
  deleteAnnotation(id: string): Promise<void>;  // Cascades to conversations via ON DELETE CASCADE
}
```

**Remove-from-Recent vs Delete:**
These are two distinct operations:
- **Hide from recent** (`hideFromRecent`): Sets `hidden_from_recent = 1`. The document row and all its annotations and conversations are preserved. The document no longer appears in the recent list but is visible in the Library screen. No confirmation needed.
- **Delete stored data** (`deleteDocument`): Fully removes the document row with `ON DELETE CASCADE`, discarding all annotations and conversations. Only available from the Library screen. Requires a confirmation dialog warning the user the action is permanent.

**Pagination:**
`getRecentDocuments` accepts optional `limit` and `offset` for pagination. The home screen should load an initial page of 20 documents, with a "Show more" button or infinite scroll for users with large libraries.

**Connection Management:**
- Lazy initialization: Create connection on first use
- Singleton pattern: Reuse connection across calls
- Database file: `studybuddy.db` in app data directory

**Error Handling:**
- Gracefully handle database not ready on first launch
- Use INSERT OR REPLACE for idempotent document insertion
- Log errors to console for debugging

### LLM Service

Handles communication with Google Gemini API. All HTTP traffic and API key access live in the Tauri Rust backend; the frontend service is a thin IPC shim.

**Architecture:**
- The Rust command `call_gemini` (in `src-tauri/src/llm.rs`) reads the API key from the Tauri Store, constructs the request, opens an SSE stream to Gemini, and emits a Tauri event for each text chunk
- The frontend `llm.ts` invokes `call_gemini` via `invoke()` and subscribes to the chunk events via `listen()`
- The API key never enters the webview context and is not visible in DevTools

**Frontend Interface (`llm.ts`):**
```typescript
interface LLMService {
  streamMessage(
    messages: ChatMessage[],
    systemPrompt: string,
    onChunk: (chunk: string) => void,
    onComplete: () => void,
    onError: (error: string) => void,
    streamId: string  // Unique ID used to match chunk events to this request
  ): Promise<UnlistenFn>;  // Returns the unlisten function; call it to cancel the stream
  createExplainPrompt(): string;
}
```

**Streaming Implementation:**
- Frontend calls `invoke('call_gemini', { messages, systemPrompt, streamId })`
- Rust emits `gemini_chunk_<streamId>` events for each text delta and a final `gemini_done_<streamId>` or `gemini_error_<streamId>` event
- Frontend listens for these events and invokes `onChunk`, `onComplete`, or `onError` accordingly
- To cancel mid-stream (e.g., panel closed), the frontend calls the returned `UnlistenFn` and invokes `invoke('cancel_gemini', { streamId })`; the Rust side aborts the HTTP request using an `AbortHandle`
- On cancel, preserve partial response text already rendered; do not persist the incomplete exchange to the database

**Cancellation and Race Conditions:**
- Each stream is identified by a unique `streamId` (UUID generated by frontend)
- The Rust backend maintains a `HashMap<String, AbortHandle>` to track active streams
- When `cancel_gemini` is called, the backend removes the `AbortHandle` and drops the HTTP request
- Race condition handling: If `cancel_gemini` arrives after `gemini_done` has been emitted but before the frontend processes it, the frontend should check the conversation state before persisting
- If two streams are started for the same annotation in quick succession (user clicks "Explain" twice), the second invocation should cancel the first by calling `cancel_gemini` with the previous `streamId` before starting a new stream

```typescript
interface ChatMessage {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}
```

**Rust Request Format (sent by `src-tauri/src/llm.rs`):**
```json
{
  "system_instruction": { "parts": [{ "text": "<systemPrompt>" }] },
  "contents": "<messages>",
  "generationConfig": { "temperature": 0.7, "maxOutputTokens": 4096 }
}
```

**System Prompt:**
```
You are a knowledgeable tutor helping a student understand difficult passages
from textbooks, research papers, and classic works.

When the student highlights a passage, explain it clearly:
- Define any jargon or technical terms
- Use analogies and examples where helpful
- Break complex ideas into simpler parts
- If it contains math, render equations in LaTeX (use $...$ for inline and $$...$$ for block)

Be thorough but concise. Aim for clarity above all else.
```

**System Prompt Versioning:**
- The system prompt is currently hardcoded in the Rust backend
- For MVP, prompt changes require a code update and recompilation
- Future enhancement: Store prompt in database with version tracking, allowing A/B testing and rollback
- Existing conversations are not affected by prompt changes (they use the prompt that was active when created)
- Consider adding a `prompt_version` field to the conversations table post-MVP to track which prompt was used

**Error Handling:**
- The Rust command checks that an API key is configured before making any request; returns an error event if not set
- Parse error responses from Gemini and emit a descriptive `gemini_error_<streamId>` event
- API errors displayed in the AI panel should remain visible until dismissed by the user; reserve the 4-second auto-dismiss for success toasts only

### Settings Service

Manages persistent user settings using Tauri Store plugin.

**Interface:**
```typescript
interface SettingsService {
  getApiKey(): Promise<string | null>;
  setApiKey(key: string): Promise<void>;
  getModel(): Promise<string>;
  setModel(model: string): Promise<void>;
}
```

**Storage:**
- File: `settings.json` in app data directory
- Format: JSON key-value pairs
- Keys: `gemini_api_key`, `gemini_model`
- Lazy initialization: Load store on first access
- Auto-save: Call `save()` after each update

**Security Note:**
- The API key is stored as plaintext in the Tauri app data directory (`settings.json`)
- This is acceptable for a local desktop app where the user controls their own machine
- On macOS, consider using the Keychain via Tauri's stronghold plugin for enhanced security in a future release
- The API key is read exclusively by the Rust backend (`src-tauri/src/llm.rs`); it is never passed to or readable from the frontend webview
- Do not transmit the API key to any third-party service other than Google's Gemini API

## Data Models

### Document

Represents a PDF or EPUB file opened by the user.

```typescript
interface Document {
  id: string;                    // UUID
  title: string;                 // Extracted from filename
  file_path: string;             // Absolute path to file
  file_hash: string;             // SHA-256 hash of file contents for deduplication
  file_type: 'pdf' | 'epub';     // File format
  last_opened: string;           // ISO 8601 timestamp
  last_position: string | null;  // Last saved page number (PDF) or CFI (EPUB)
  hidden_from_recent: boolean;   // True when removed from recent list; data is preserved
  metadata: string;              // JSON string for extensibility
}
```

**Database Schema:**
```sql
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  file_path TEXT NOT NULL UNIQUE,
  file_hash TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK(file_type IN ('pdf', 'epub')),
  last_opened TEXT NOT NULL,
  last_position TEXT DEFAULT NULL,
  hidden_from_recent INTEGER NOT NULL DEFAULT 0,  -- 0 = visible, 1 = hidden (SQLite boolean)
  metadata TEXT DEFAULT '{}'
);
```

**Deduplication Strategy:**
`file_path` is the primary uniqueness constraint — each physical file location maps to exactly one document record. `file_hash` (SHA-256) is retained as a non-unique advisory column: when a user opens a file whose hash matches an existing record at a *different* path, the app can warn "This appears to be a copy of [title] — do you want to open the original instead?" without enforcing it. This allows a user to maintain separate annotation sets for two copies of the same content (e.g., different editions of a textbook). Hash computation must run asynchronously (via a Tauri command) to avoid blocking the UI on large files.

**File Path Fragility and Moved Files:**
The `file_path UNIQUE` constraint means that if a user moves a file and reopens it from the new location, a new document record is created, orphaning the old record's annotations. This is a known limitation of the MVP design. Mitigation strategies:
- When a file is opened and its hash matches an existing document with a different path, offer to migrate annotations to the new path
- In the Library view, detect missing files (file no longer exists at `file_path`) and offer to "Reconnect" by selecting the new location
- A future enhancement could use `file_hash` as the primary key and track multiple paths per document, but this adds complexity beyond MVP scope

**Database Migration Versioning:**
- Maintain a `schema_version` table with a single row containing the current version number
- On application startup, compare `schema_version` to the latest known version in the code
- If versions differ, run migration scripts sequentially (e.g., `001_initial_schema.sql`, `002_add_hidden_column.sql`)
- Each migration script updates the `schema_version` row after successful execution
- Use Tauri's SQL plugin migration support or implement a custom migration runner in Rust
- Log all migration attempts and results for debugging

### Annotation

Represents a text selection made by the user.

```typescript
interface Annotation {
  id: string;                    // UUID
  document_id: string;           // Foreign key to documents
  page_or_chapter: string;       // Page number (PDF) or chapter href (EPUB)
  selected_text: string;         // The selected text content
  position_data: string;         // JSON string with position information
  note: string | null;           // Optional personal note added by the user
  created_at: string;            // ISO 8601 timestamp
}
```

**Position Data Format (PDF):**
```typescript
{
  page: number;
  rects: Array<{
    x: number;  // Normalized 0-1
    y: number;  // Normalized 0-1
    w: number;  // Normalized 0-1
    h: number;  // Normalized 0-1
  }>;
}
```

**Position Data Format (EPUB):**
```typescript
{
  cfi: string;      // Canonical Fragment Identifier
  chapter: string;  // Chapter href
}
```

**Database Schema:**
```sql
CREATE TABLE annotations (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page_or_chapter TEXT NOT NULL,
  selected_text TEXT NOT NULL,
  position_data TEXT NOT NULL,
  note TEXT DEFAULT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_annotations_document ON annotations(document_id);
```

**Position Data Requirement:**
`position_data` is `NOT NULL` without a default value, forcing callers to provide valid position information. An annotation without position data cannot be rendered as a highlight in the document, so requiring it at creation time prevents invalid states. The frontend must always compute position data before creating an annotation.

### Conversation

Represents a chat session between the user and AI about a specific annotation.

```typescript
interface Conversation {
  id: string;                    // UUID
  annotation_id: string;         // Foreign key to annotations
  mode: 'explain';  // Conversation type; reserved for future modes (e.g. 'quiz', 'summarize')
  messages: string;              // JSON array of ChatMessage objects
  summary: string;               // Reserved for future conversation summarization
  created_at: string;            // ISO 8601 timestamp
  updated_at: string;            // ISO 8601 timestamp
}
```

**Messages Format:**
```typescript
Array<{
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}>
```

**Database Schema:**
```sql
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  annotation_id TEXT NOT NULL REFERENCES annotations(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK(mode IN ('explain')),
  messages TEXT NOT NULL DEFAULT '[]',
  summary TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_conversations_annotation ON conversations(annotation_id);
```

**Mode Column Design:**
The `mode` column uses a `CHECK` constraint limited to `('explain')` for the MVP. Future modes like `'quiz'` or `'summarize'` will require a schema migration to extend the enum. This is intentional: speculative schema design (adding unused modes now) creates migration debt if those modes work differently than anticipated. Add modes only when implementing them.

**Messages Storage Trade-off:**
Messages are stored as a JSON-serialized array in a single `TEXT` column rather than a normalized `messages` table. This is an intentional MVP simplification:
- **Pros:** Simple reads/writes; no joins; the entire conversation is one row fetch
- **Cons:** Cannot query individual messages; cannot paginate long conversations; a single JSON corruption loses the whole conversation history
- **Acceptable for MVP because** conversations are expected to be short (10–30 exchanges) and always loaded in full; the `updated_at` timestamp allows detecting stale data
- **Migration path if needed:** introduce a `messages` table with `(id, conversation_id, role, text, created_at)` and migrate the JSON arrays into rows

## Performance Targets

To ensure a responsive user experience, the following performance targets guide implementation decisions:

**Document Rendering:**
- PDF page render: < 3 seconds for pages up to 10MB
- EPUB chapter load: < 2 seconds for chapters up to 5MB
- Display loading indicator if rendering exceeds 500ms

**AI Response Latency:**
- First token from Gemini API: < 2 seconds (network dependent)
- Token streaming rate: Display chunks as received with < 100ms UI update latency
- Conversation history load: < 500ms for conversations with up to 50 messages

**Database Operations:**
- Document list query: < 200ms for up to 1000 documents
- Annotation load: < 300ms for up to 500 annotations per document
- Conversation save: < 100ms for messages up to 10KB

**Document Size Limits:**
- PDF: Up to 2000 pages supported; warn if exceeded
- EPUB: Up to 50MB file size supported; warn if exceeded
- Annotations: Up to 500 per document with pagination/virtual scrolling
- Database: Warn when database exceeds 1GB

These targets are guidelines, not hard requirements. Performance testing should validate these on representative hardware (mid-range laptop, 8GB RAM).

## Data Backup and Recovery

**SQLite Database Backup:**
- The database file (`studybuddy.db`) contains all annotations and conversations, which have high academic value
- Implement periodic backup: On application startup, if the database was last backed up > 7 days ago, spawn a background task to copy `studybuddy.db` to `studybuddy.db.backup.<timestamp>`
- The backup operation MUST run asynchronously on a background thread to avoid blocking application launch
- Keep the 3 most recent backups; delete older ones to avoid consuming excessive disk space
- Provide a "Restore from Backup" option in Settings that lists available backups and allows the user to select one
- On restore, copy the selected backup to `studybuddy.db` and restart the application

**Database Corruption Recovery:**
- If SQLite reports corruption on startup, display an error dialog offering to restore from the most recent backup
- If no backup exists, offer to create a new empty database (user loses all data)
- Log corruption events for debugging

**Export/Import (Future Enhancement):**
- Consider adding JSON export of all annotations and conversations for portability
- Deferred to post-MVP

## Cross-Platform Considerations

**File Dialogs:**
- Tauri's file dialog plugin behaves consistently across platforms, but default directories differ (Documents on Windows, Home on macOS/Linux)
- Test file picker on all target platforms to ensure filters work correctly

**Database Location:**
- Tauri's app data directory resolves to platform-specific locations:
  - Windows: `%APPDATA%\com.studybuddy.app\`
  - macOS: `~/Library/Application Support/com.studybuddy.app/`
  - Linux: `~/.local/share/com.studybuddy.app/`
- Ensure database path is logged on first launch for debugging

**API Key Storage:**
- Current design stores API key in plaintext `settings.json` in app data directory
- On macOS, consider using Keychain via Tauri's stronghold plugin for enhanced security (post-MVP enhancement)
- Windows Credential Manager and Linux Secret Service integration are also possible future enhancements

**CSP (Content Security Policy):**
- Tauri's default CSP is restrictive; ensure it allows:
  - `worker-src 'self'` for PDF.js worker
  - `img-src 'self' data:` for embedded images in EPUBs
- Note: Gemini API calls go through the Rust backend, not the webview, so no `connect-src` entry is needed for the API
- Test CSP on all platforms as enforcement can differ

## Correctness Properties


A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.

### Document Management Properties

Property 1: File type validation
*For any* file path, if the file extension is not .pdf or .epub, then attempting to open it should result in an error message and the file should not be opened
**Validates: Requirements 1.3**

Property 2: Document persistence
*For any* valid document file, when opened, a corresponding record should exist in the database with all required fields populated (id, title, file_path, file_hash, file_type, last_opened, metadata)
**Validates: Requirements 1.4, 1.5**

Property 3: Recent documents ordering
*For any* set of documents in the database, when retrieved as recent documents, they should be ordered by last_opened timestamp in descending order (most recent first)
**Validates: Requirements 1.6**

Property 4: Document reopening
*For any* document in the recent files list, clicking it should open that document and display it in the appropriate viewer
**Validates: Requirements 1.7**

### PDF Viewer Properties

Property 5: PDF initial page
*For any* valid PDF file, when opened, the viewer should display page 1
**Validates: Requirements 2.1**

Property 6: PDF page navigation bounds
*For any* PDF document, the next button should be disabled when on the last page, and the previous button should be disabled when on the first page
**Validates: Requirements 2.9, 2.10**

Property 7: PDF page navigation
*For any* PDF document and any valid page number N (where 1 ≤ N ≤ total pages), navigating to page N should display that page
**Validates: Requirements 2.3, 2.4, 2.5**

Property 8: PDF zoom rendering
*For any* PDF page and any zoom level Z (where 0.5 ≤ Z ≤ 3.0), setting the zoom to Z should re-render the page at that scale
**Validates: Requirements 2.7**

Property 9: PDF coordinate normalization
*For any* text selection in a PDF, the position data should contain coordinates normalized to the range [0, 1] relative to page dimensions
**Validates: Requirements 4.4**

### EPUB Viewer Properties

Property 10: EPUB initial chapter
*For any* valid EPUB file, when opened, the viewer should display the first chapter
**Validates: Requirements 3.1**

Property 11: EPUB chapter navigation
*For any* EPUB document, navigating between chapters should update the display to show the selected chapter
**Validates: Requirements 3.4**

Property 12: EPUB CFI tracking
*For any* EPUB document, the viewer should maintain a valid CFI (Canonical Fragment Identifier) representing the current reading location
**Validates: Requirements 3.5**

### Text Selection Properties

Property 13: PDF text selection capture
*For any* text selection in a PDF, the system should capture the selected text, page number, and normalized position rectangles
**Validates: Requirements 4.1**

Property 14: EPUB text selection capture
*For any* text selection in an EPUB, the system should capture the selected text, chapter href, and CFI location
**Validates: Requirements 4.2**

Property 15: Selection toolbar positioning
*For any* text selection, the selection toolbar should appear positioned relative to the selection bounding rectangle
**Validates: Requirements 4.3**

### Annotation Properties

Property 16: Annotation creation without conversation
*For any* text selection where "Annotate" is clicked, an annotation record should be created in the database without creating a conversation record
**Validates: Requirements 5.2**

Property 17: Annotation data storage
*For any* annotation created, the database record should contain the selected text, page or chapter location, and position data
**Validates: Requirements 5.3**

Property 18: Annotation-document association
*For any* annotation in the database, it must have a valid document_id that references an existing document
**Validates: Requirements 5.4**

Property 19: Annotation timestamps
*For any* annotation in the database, it must have a created_at timestamp in ISO 8601 format
**Validates: Requirements 5.5**

Property 20: Annotation toolbar dismissal
*For any* annotation created via "Annotate" button, the selection toolbar should be dismissed and the text selection should be cleared
**Validates: Requirements 5.6**

Property 21: Annotation retrieval
*For any* document, loading annotations should return all annotations associated with that document ordered by creation time
**Validates: Requirements 5.7**

Property 22: Annotation visual indicators
*For any* document with saved annotations, opening the document should display visual indicators (highlights) for all annotations
**Validates: Requirements 5.8**

Property 23: Annotation detail display
*For any* saved annotation, clicking on its visual indicator should display the annotation details
**Validates: Requirements 5.9**

### AI Explanation Properties

Property 24: Annotation creation with explanation
*For any* text selection where "Explain" is clicked, an annotation record should be created in the database and a conversation should be initiated
**Validates: Requirements 6.1**

Property 25: Deferred explanation creation
*For any* annotation without an associated conversation, clicking "Explain" should create a new conversation for that annotation
**Validates: Requirements 6.2**

Property 26: Existing conversation loading
*For any* annotation with an associated conversation, clicking on the annotation should open the AI panel with the existing conversation displayed
**Validates: Requirements 6.3**

### Conversation Properties

Property 27: Conversation creation
*For any* annotation where "Explain" is clicked with a valid API key, a conversation record should be created in the database
**Validates: Requirements 7.3**

Property 28: Conversation persistence round-trip
*For any* conversation, saving messages to the database and then retrieving them should produce equivalent message content
**Validates: Requirements 7.8, 10.1**

Property 29: Conversation context preservation
*For any* conversation with N messages, sending a new message should include all N previous messages in the API request
**Validates: Requirements 8.2, 8.3**

Property 30: Conversation message accumulation
*For any* conversation, after receiving N AI responses, the conversation should contain at least N user messages and N model messages
**Validates: Requirements 8.4, 8.5**

Property 31: Conversation retrieval
*For any* annotation with associated conversations, loading the annotation should retrieve all conversation records ordered by creation time
**Validates: Requirements 10.2, 10.3**

Property 32: Conversation continuation
*For any* existing conversation, adding a new user message and receiving a response should append to the existing message history without losing previous messages
**Validates: Requirements 10.4**

### Markdown and Math Rendering Properties

Property 33: Markdown rendering
*For any* AI response containing markdown syntax (headers, lists, code blocks, emphasis), the rendered output should display the formatted elements correctly
**Validates: Requirements 9.1, 9.5**

Property 34: Inline math rendering
*For any* AI response containing inline LaTeX expressions (enclosed in single $), the rendered output should display the mathematical notation
**Validates: Requirements 9.2**

Property 35: Block math rendering
*For any* AI response containing block LaTeX expressions (enclosed in double $$), the rendered output should display the mathematical notation as a centered block
**Validates: Requirements 9.3**

### Settings Properties

Property 36: Settings persistence round-trip
*For any* API key and model selection, saving to settings and then retrieving should return the same values
**Validates: Requirements 11.6**

### Database Schema Properties

Property 37: Foreign key cascade
*For any* document with associated annotations, deleting the document should cascade delete all associated annotations and their conversations
**Validates: Requirements 12.4**

Property 38: Check constraint enforcement
*For any* attempt to insert a document with file_type not in ('pdf', 'epub'), the database should reject the insertion
**Validates: Requirements 12.5**

### Error Handling Properties

Property 39: Error toast display
*For any* error that occurs during operation, a toast notification should be displayed with the error message
**Validates: Requirements 13.1**

### UI Routing Properties

Property 40: Viewer selection
*For any* document opened, the system should display the PDF viewer if file_type is 'pdf' and the EPUB viewer if file_type is 'epub'
**Validates: Requirements 14.5**

## Error Handling

### File System Errors

**File Not Found:**
- Scenario: User attempts to open a file that has been moved or deleted
- Handling: Display toast notification with error message, remain on current screen
- Recovery: User can select a different file or dismiss the error

**File Read Permission Denied:**
- Scenario: Application lacks permission to read the selected file
- Handling: Display toast notification explaining permission issue
- Recovery: User must grant file system permissions or select a different file

**Corrupted File:**
- Scenario: PDF or EPUB file is corrupted and cannot be parsed
- Handling: Display toast notification indicating file corruption
- Recovery: User must obtain a valid copy of the file

### Database Errors

**Database Not Initialized:**
- Scenario: First application launch before migrations run
- Handling: Gracefully handle missing tables, allow application to continue
- Recovery: Database migrations will run automatically

**Database Write Failure:**
- Scenario: Disk full or database locked by another process
- Handling: Log error to console, display toast notification
- Recovery: User can retry operation or restart application

**Foreign Key Violation:**
- Scenario: Attempt to create annotation for non-existent document
- Handling: Log error to console, prevent annotation creation
- Recovery: Ensure document exists before creating annotations

### API Errors

**Missing API Key:**
- Scenario: User attempts to use AI features without configuring API key
- Handling: Display toast notification, automatically open Settings dialog
- Recovery: User must enter valid API key in Settings

**Invalid API Key:**
- Scenario: User enters incorrect or expired API key
- Handling: Display error message from API response
- Recovery: User must enter valid API key in Settings

**Network Error:**
- Scenario: No internet connection or API endpoint unreachable
- Handling: Display toast notification with network error message
- Recovery: User can retry when connection is restored

**API Rate Limit:**
- Scenario: User exceeds Gemini API rate limits
- Handling: Display error message from API response
- Recovery: User must wait before making additional requests

**API Response Parsing Error:**
- Scenario: API returns unexpected response format
- Handling: Display generic error message, log details to console
- Recovery: User can retry operation

### UI Errors

**Selection Lost:**
- Scenario: User's text selection is cleared before "Explain" is clicked
- Handling: Dismiss selection toolbar, no error message needed
- Recovery: User can make a new selection

**Scroll During Selection:**
- Scenario: Document scrolls while selection toolbar is displayed
- Handling: Dismiss selection toolbar to avoid misalignment
- Recovery: User can make a new selection

## Accessibility

Accessibility is a non-goal for the MVP. The application will not be tested for screen reader compatibility or WCAG compliance in this phase.

The following baseline practices should still be followed during development to avoid creating irreversible accessibility debt:
- Use semantic HTML elements (`button`, `nav`, `main`, `dialog`) rather than `div` with click handlers
- Provide `alt` text on all images and icons used for meaning
- Ensure all interactive controls are reachable and activatable via keyboard (Tab, Enter, Space)
- Do not rely solely on color to convey state (e.g., error indicators should also use text or iconography)

Full accessibility work — ARIA roles, screen reader testing, focus management, contrast auditing — is deferred to a post-MVP phase.

## Testing Strategy

### Testing Framework and Tools

**Unit and Integration Tests:**
- Test runner: Vitest (fast, Vite-native, ESM support)
- Component testing: React Testing Library (user-centric queries, no implementation details)
- Mocking: Vitest's built-in mocking (`vi.mock()`, `vi.fn()`)
- Property-based testing: fast-check (TypeScript-native, 100+ iterations per property)

**Tauri API Mocking:**
- Tauri commands (`invoke()`) are not available in the test environment
- Mock Tauri APIs using Vitest: `vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))`
- For database tests, mock the `database.ts` service layer rather than testing actual SQLite calls
- For LLM tests, mock the `llm.ts` service to return predefined responses
- Integration tests that require real Tauri APIs should use Tauri's WebDriver testing (deferred to post-MVP)

**Test Organization:**
- Co-locate unit tests with source files: `Component.test.tsx` next to `Component.tsx`
- Integration tests in `src/__tests__/integration/`
- Property-based tests in `src/__tests__/properties/`
- Test utilities and fixtures in `src/__tests__/utils/`

### Unit Testing

Unit tests validate specific examples, edge cases, and error conditions for individual components and functions.

**Document Management:**
- Test file type detection for various extensions (.pdf, .PDF, .epub, .EPUB, .txt, .doc)
- Test filename extraction from paths with various formats
- Test UUID generation for uniqueness
- Test document insertion with duplicate file paths (should replace)

**PDF Viewer:**
- Test page navigation boundary conditions (page 0, page > total)
- Test zoom level clamping (< 0.5, > 3.0)
- Test coordinate normalization with various viewport sizes
- Test text layer positioning calculations

**EPUB Viewer:**
- Test CFI parsing and validation
- Test chapter navigation with single-chapter EPUBs
- Test theme application to iframe content

**Database Service:**
- Test connection initialization and reuse
- Test query parameter binding
- Test error handling for malformed queries
- Test transaction rollback on errors

**LLM Service:**
- Test request formatting with various message histories
- Test response parsing with different API response structures
- Test error extraction from API error responses
- Test system prompt formatting

**Settings Service:**
- Test default values when settings file doesn't exist
- Test JSON serialization/deserialization
- Test concurrent access to settings store

### Property-Based Testing

Property tests validate universal properties across all inputs using randomized test data. Each test should run a minimum of 100 iterations. **Only use property-based tests where the property is genuinely input-agnostic** — i.e., the correctness claim holds for *any* value in the input domain. UI rendering, visual indicators, and click interactions are not suitable for property-based testing; use component tests (React Testing Library) for those.

**Configuration:**
- Use fast-check library for TypeScript property-based testing
- Configure 100+ iterations per property test
- Tag each test with feature name and property number

**Test Tag Format:**
```typescript
// Feature: study-buddy, Property 1: File type validation
```

**Property-Testable (pure logic / data layer):**

*Document Management:*
- Property 2: Generate random document data → insert into database → retrieve → verify all fields match
- Property 3: Generate random document sets with arbitrary timestamps → verify retrieval is sorted descending by `last_opened`

*PDF Viewer (pure functions):*
- Property 6: For any N ∈ [1, 10000], a PDF with N pages should disable prev at page 1 and next at page N
- Property 7: For any page number P ∈ [1, N], navigating to P should result in `currentPage === P`
- Property 8: For any scale S ∈ [0.5, 3.0], clamping should return S unchanged; values outside the range should clamp to the boundary
- Property 9: For any selection rectangle in pixel space, normalizing then denormalizing with the same viewport dimensions should recover the original values within floating-point tolerance

*EPUB:*
- Property 12: For any CFI string produced by the renderer, `isValidCfi(cfi)` should return true

*Annotation data layer:*
- Property 17: For any annotation record, all required fields (text, location, position_data, created_at) should be non-null after insertion
- Property 18: For any annotation retrieved from the database, its `document_id` should match an existing document
- Property 19: For any annotation, `created_at` should parse as a valid ISO 8601 date
- Property 21: For any document with K annotations, `getAnnotationsForDocument` should return exactly K results
- Property 28: For any array of messages, serializing to JSON, storing, then parsing should produce equivalent content
- Property 29: For any conversation with N messages, the outgoing API request should contain all N messages in order
- Property 36: For any API key string and model string, saving then loading should return identical values
- Property 37: Deleting a document should result in zero annotations and conversations referencing that document_id
- Property 38: Inserting a document with `file_type` not in ('pdf', 'epub') should throw a constraint error

**Component Tests (React Testing Library) — not property-based:**

These properties involve UI rendering and user interaction; they should be written as focused component tests with specific inputs, not randomized generators:
- Property 4 (clicking recent document opens it), Property 15 (toolbar positioning), Properties 20/22/23 (visual indicators, detail display, toolbar dismissal), Properties 24–27/30–32 (conversation UI flows), Properties 33–35 (markdown/math rendering), Property 39 (toast display), Property 40 (viewer selection)

Using fast-check generators for these would produce meaningless tests since the assertions ultimately depend on DOM rendering side-effects that cannot be meaningfully varied by arbitrary input data.

### Integration Testing

Integration tests validate interactions between components and external systems.

**End-to-End Document Flow:**
1. Open PDF file
2. Verify document appears in database
3. Verify PDF viewer displays
4. Select text
5. Click "Explain"
6. Verify annotation created
7. Verify conversation created
8. Verify AI panel opens
9. Close document
10. Reopen from recent files
11. Verify annotations loaded

**API Integration:**
1. Configure API key
2. Test connection
3. Verify success feedback
4. Make explanation request
5. Verify response received
6. Verify conversation persisted

**Database Integration:**
1. Insert document
2. Insert annotation
3. Insert conversation
4. Verify foreign key relationships
5. Delete document
6. Verify cascade delete

### Manual Testing

Some aspects require manual verification:

**UI/UX:**
- Visual appearance of dark theme
- Selection toolbar positioning accuracy
- AI panel overlay behavior
- Toast notification timing and positioning
- Markdown rendering quality
- Math rendering quality

**Performance:**
- PDF rendering speed for large documents
- EPUB loading time
- Database query performance with many annotations
- API response time

**Accessibility:**
- Keyboard navigation
- Screen reader compatibility
- Focus management

**Cross-Platform:**
- File picker behavior on Windows/macOS/Linux
- Database file location on different platforms
- Font rendering consistency
