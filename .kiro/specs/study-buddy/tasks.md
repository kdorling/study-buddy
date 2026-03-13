# Implementation Plan: Study Buddy

## Overview

Study Buddy is a cross-platform desktop application built with Tauri 2 (Rust backend) and React 19 (TypeScript frontend). The implementation follows a layered architecture: Tauri backend handles file system access, database operations, and API calls; React frontend manages UI rendering and user interactions. The application uses SQLite for local data persistence and integrates with Google's Gemini API for AI-powered explanations.

Implementation will proceed incrementally, starting with core infrastructure (database, file handling), then document viewing capabilities (PDF and EPUB), followed by annotation features, and finally AI integration. Each major component includes tests to validate correctness properties from the design document — property-based tests (fast-check) for data and logic layers, and component tests (React Testing Library) for UI rendering and interactions.

**Architectural decision — Gemini API calls:** Per the design, all Gemini HTTP traffic and API key access live in the Tauri Rust backend (`src-tauri/src/llm.rs`). The frontend `llm.ts` is a thin IPC shim that invokes `call_gemini` via Tauri's `invoke()` and subscribes to streamed chunk events. The API key never enters the webview context. Any existing frontend code that calls the Gemini API directly must be replaced with this architecture.

## Tasks

- [ ] 1. Project setup and core infrastructure
  - [ ] 1.1 Initialize Tauri 2 project with React 19 and TypeScript
    - Create new Tauri project with React template
    - Configure TypeScript with strict mode
    - Set up Vite build configuration
    - Configure Tauri permissions for file system, dialog, store, and HTTP
    - Configure CSP in tauri.conf.json: allow `worker-src 'self'` (PDF.js), `img-src 'self' data:` (EPUB images)
    - _Requirements: 15.1_

  - [ ] 1.2 Set up SQLite database with schema and migrations
    - Install Tauri SQL plugin
    - Create database schema with documents, annotations, and conversations tables
    - Implement migration system with schema_version tracking
    - Add foreign key constraints and indexes
    - Create database initialization logic in Rust backend
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 15.1, 15.4_

  - [ ] (optional) 1.3 Write property test for database schema constraints
    - **Property 38: Check constraint enforcement**
    - **Validates: Requirements 12.5**

  - [ ] 1.4 Create database service layer in TypeScript
    - Implement DatabaseService interface with typed methods per design
    - Add methods for documents: insert, getRecent (with limit/offset), getAll (with limit/offset), updateLastOpened, updateLastPosition, hideFromRecent, restoreToRecent, deleteDocument (cascade)
    - Add methods for annotations: insert, getByDocument, updateNote, delete (cascade)
    - Add methods for conversations: insert, updateMessages, getByAnnotation
    - Handle connection initialization (lazy singleton) and error cases
    - _Requirements: 12.1, 12.2, 12.3, 15.2_

  - [ ] (optional) 1.5 Write property tests for database operations
    - **Property 2: Document persistence**
    - **Property 3: Recent documents ordering**
    - **Property 37: Foreign key cascade**
    - **Validates: Requirements 1.7, 1.9, 12.4**

- [ ] 2. Settings management and API configuration
  - [ ] 2.1 Implement settings service using Tauri Store plugin
    - Create SettingsService interface for API key and model management
    - Implement getApiKey, setApiKey, getModel, setModel methods
    - Configure store to use settings.json in app data directory
    - Handle default values and lazy initialization
    - Note: API key is stored in Tauri app data directory and read exclusively by Rust backend
    - _Requirements: 11.7, 11.8, 15.5_

  - [ ] 2.2 Create Settings dialog UI component
    - Build modal dialog with API key input (masked by default)
    - Add show/hide toggle for API key visibility
    - Implement model selection dropdown: load model list from `settings.json`; if no list is defined or the file is invalid, fall back to built-in defaults (gemini-2.5-flash, gemini-2.5-pro, gemini-2.5-flash-lite)
    - Implement save functionality
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

  - [ ] 2.3 Implement connection test in Settings
    - Add "Test Connection" button
    - Temporarily save API key and model, send test message via Rust backend
    - Display success or error feedback
    - _Requirements: 11.5, 11.6_

  - [ ] (optional) 2.4 Write property test for settings persistence
    - **Property 36: Settings persistence round-trip**
    - **Validates: Requirements 11.7**

- [ ] 3. File handling and document management
  - [ ] 3.1 Implement file picker dialog
    - Create file picker dialog filtered to PDF and EPUB files
    - Add file type validation (reject unsupported types with error message)
    - _Requirements: 1.1, 1.5, 1.6_

  - [ ] 3.2 Implement drag-and-drop file opening
    - Accept single file drops, attempt to open as if selected via file picker
    - Reject unsupported file types with error message per Req 1.6
    - Open only the first file when multiple files are dropped, ignore the rest
    - Display error message when a folder is dropped
    - _Requirements: 1.2, 1.3, 1.4_

  - [ ] 3.3 Implement file hash computation in Rust backend
    - Create compute_file_hash Tauri command
    - Use SHA-256 for file hashing
    - Run hash computation asynchronously to avoid blocking UI
    - _Requirements: 1.7, 1.14_

  - [ ] 3.4 Create document opening and persistence logic
    - Extract document title from filename
    - Generate UUID for document ID (used only for new inserts; on conflict, the existing row's ID is preserved)
    - Compute file hash and check for duplicates by file_path using `ON CONFLICT(file_path) DO UPDATE SET title = excluded.title, last_opened = excluded.last_opened, file_hash = excluded.file_hash` (do NOT use INSERT OR REPLACE — it cascade-deletes child annotations/conversations)
    - When hash matches an existing document at a different path, warn user (advisory deduplication per design)
    - Insert document record into database
    - Update last_opened timestamp
    - If document is already open, bring focus to it without creating duplicate
    - _Requirements: 1.5, 1.7, 1.8, 1.11_

  - [ ] (optional) 3.5 Write property test for file type validation
    - **Property 1: File type validation**
    - **Validates: Requirements 1.6**

  - [ ] (optional) 3.6 Write property test for document persistence
    - **Property 2: Document persistence**
    - **Validates: Requirements 1.5, 1.7**

- [ ] 4. Main application UI and navigation
  - [ ] 4.1 Set up zustand store with slices pattern
    - Create DocumentSlice for document state management (currentFile, recentFiles, highlights, lastPosition, documentState)
    - Create UISlice for UI state (selection, conversation, settingsOpen, annotationsPanelOpen, toast)
    - Create ConversationSlice for conversation state machine (activeConversationId, streamingText, conversationState: idle | streaming | complete | error)
    - Implement selectors for efficient component subscriptions
    - _Requirements: 14.1, 14.2, 14.3_

  - [ ] 4.2 Create main App component with routing
    - Implement sidebar with navigation buttons (Open File, Home, Library, Settings)
    - Create welcome screen with app description and recent files
    - Implement screen routing (home, document viewer, library)
    - Apply dark theme styling
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.7_

  - [ ] 4.3 Implement recent files list on home screen
    - Load recent documents from database on app launch (initial page of 20, with "Show more" or infinite scroll)
    - Display recent files ordered by last_opened (most recent first)
    - Show warning indicator for files that no longer exist on disk
    - Show warning indicator for files modified externally (file_hash mismatch)
    - Handle click to open document
    - Implement right-click menu to hide from recent list (data preserved per Req 1.12)
    - _Requirements: 1.9, 1.10, 1.12, 1.13, 1.14_

  - [ ] (optional) 4.4 Write property test for recent documents ordering
    - **Property 3: Recent documents ordering**
    - **Validates: Requirements 1.9**

  - [ ] 4.5 Implement toast notification system
    - Create toast component with error and success variants
    - Auto-dismiss success toasts after 4 seconds
    - Keep error toasts visible until manually dismissed
    - _Requirements: 13.1, 13.2_

  - [ ] 4.6 Implement keyboard shortcuts
    - Add Ctrl+O for open file dialog
    - Add Escape for closing AI panel and dismissing toolbar
    - Add Ctrl+, for opening settings
    - Add Left/Right Arrow for PDF page navigation (when document viewer has focus, no text input focused)
    - Add +/- keys for zoom in/out (when document viewer has focus)
    - Add Ctrl+W for closing current document and returning to home screen
    - Add Ctrl+B for toggling annotations panel
    - Add Ctrl+F for focusing annotation search field
    - _Requirements: 14.8_

  - [ ] 4.7 Implement React error boundaries
    - Wrap PdfViewer with error boundary
    - Wrap EpubViewer with error boundary
    - Wrap AiPanel with error boundary
    - Render fallback UI with error message and "Close document" button
    - Reset state to home screen on error
    - _Design: Error Boundaries section_

- [ ] 5. PDF viewer implementation
  - [ ] 5.1 Set up PDF.js with worker configuration
    - Install pdfjs-dist library
    - Configure PDF.js worker URL explicitly: `pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.js'`
    - Copy pdf.worker.js from pdfjs-dist/build/ to public directory
    - Verify CSP allows worker-src 'self' (configured in task 1.1)
    - _Requirements: 2.1_

  - [ ] 5.2 Create PdfViewer component with page rendering
    - Load PDF file from file system using Tauri FS plugin
    - Parse PDF using PDF.js getDocument()
    - Render current page to canvas at specified scale
    - Display loading indicator for renders > 500ms
    - Handle PDF loading errors
    - _Requirements: 2.1, 20.3, 20.4_

  - [ ] 5.3 Implement PDF navigation controls
    - Add previous/next buttons with bounds checking
    - Add page number input with Enter key submission
    - Disable previous button on first page
    - Disable next button on last page
    - Add keyboard navigation (Page Up/Down for prev/next page)
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.9, 2.10_

  - [ ] (optional) 5.4 Write property tests for PDF navigation
    - **Property 5: PDF initial page**
    - **Property 6: PDF page navigation bounds**
    - **Property 7: PDF page navigation**
    - **Validates: Requirements 2.1, 2.3, 2.4, 2.5, 2.9, 2.10**

  - [ ] 5.5 Implement PDF zoom controls
    - Add zoom controls with range 50% to 300%
    - Support mouse wheel zoom adjustment
    - Re-render page when zoom changes
    - _Requirements: 2.6, 2.7_

  - [ ] (optional) 5.6 Write property test for PDF zoom rendering
    - **Property 8: PDF zoom rendering**
    - **Validates: Requirements 2.7**

  - [ ] 5.7 Implement PDF text layer for selection
    - Extract text content from PDF page
    - Create text layer overlay on canvas
    - Position text spans using transform matrices to match PDF layout
    - _Requirements: 2.8_

  - [ ] 5.8 Implement PDF text selection capture
    - Listen for mouseup events on text layer
    - Capture browser selection using window.getSelection()
    - Extract bounding rectangles for selected text
    - Normalize coordinates relative to page dimensions (0-1 range)
    - Highlight text while user clicks and drags with mouse button held
    - Invoke onTextSelected callback with text, page number, and normalized rectangles
    - _Requirements: 4.1, 4.4, 4.6_

  - [ ] (optional) 5.9 Write property test for PDF coordinate normalization
    - **Property 9: PDF coordinate normalization**
    - **Validates: Requirements 4.4**

- [ ] 6. EPUB viewer implementation
  - [ ] 6.1 Create EpubViewer component with react-reader
    - Install react-reader library
    - Load EPUB file from file system using Tauri FS plugin
    - Create Blob from file data with MIME type application/epub+zip
    - Generate object URL and pass to ReactReader component
    - Apply dark theme overrides to EPUB content
    - Revoke object URL on component unmount via `URL.revokeObjectURL()` to prevent memory leaks
    - _Requirements: 3.1, 3.3_

  - [ ] 6.2 Implement EPUB chapter navigation
    - Add chapter navigation controls
    - Update display when navigating between chapters
    - _Requirements: 3.2, 3.4_

  - [ ] 6.3 Implement EPUB CFI location tracking
    - Track current reading location using CFI (Canonical Fragment Identifier)
    - Validate CFI format
    - _Requirements: 3.5_

  - [ ] (optional) 6.4 Write property tests for EPUB viewer
    - **Property 10: EPUB initial chapter**
    - **Property 11: EPUB chapter navigation**
    - **Property 12: EPUB CFI tracking**
    - **Validates: Requirements 3.1, 3.4, 3.5**

  - [ ] 6.5 Implement EPUB text selection capture
    - Register selected event listener on rendition
    - Capture CFI range from selection
    - Extract selected text from iframe window
    - Invoke onTextSelected callback with text, chapter href, and CFI
    - Implement polling fallback for platforms with broken selection events (poll window.getSelection() in iframe every 100ms for up to 500ms on mouseup)
    - _Requirements: 4.2_

  - [ ] (optional) 6.6 Write property test for EPUB text selection capture
    - **Property 14: EPUB text selection capture**
    - **Validates: Requirements 4.2**

- [ ] 7. Checkpoint — Document viewing
  - Verify PDF viewing, navigation, zoom, and text selection work
  - Verify EPUB viewing, chapter navigation, and text selection work
  - Ensure all tests pass; ask the user if questions arise

- [ ] 8. Selection toolbar and annotation creation
  - [ ] 8.1 Create SelectionToolbar component
    - Build floating toolbar with "Annotate" and "Explain" buttons
    - Calculate position based on selection bounding rectangle
    - Center toolbar horizontally, position 50px above selection
    - Update position when selection changes
    - Dismiss toolbar and clear the selection on click outside, document scroll, or window resize
    - _Requirements: 4.3, 4.5, 5.1_

  - [ ] (optional) 8.2 Write component test for selection toolbar positioning
    - **Property 15: Selection toolbar positioning**
    - **Validates: Requirements 4.3**

  - [ ] 8.3 Implement annotation creation via "Annotate" button
    - Handle "Annotate" button click
    - Generate UUID for annotation ID
    - Create annotation record with selected text, page/chapter location, and position data
    - Store annotation in database with creation timestamp
    - Dismiss toolbar and clear selection
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.6_

  - [ ] (optional) 8.4 Write property tests for annotation creation
    - **Property 16: Annotation creation without conversation**
    - **Property 17: Annotation data storage**
    - **Property 18: Annotation-document association**
    - **Property 19: Annotation timestamps**
    - **Validates: Requirements 5.2, 5.3, 5.4, 5.5**

- [ ] 9. Annotation display and management
  - [ ] 9.1 Implement annotation visual indicators in PDF viewer
    - Load annotations for current document on open
    - Render highlight overlays for annotations on current page
    - Use position data to draw semi-transparent rectangles (yellow highlight, 30% opacity)
    - Make annotation overlays clickable
    - Update display when page or zoom changes
    - _Requirements: 5.7, 5.8, 5.9_

  - [ ] 9.2 Implement annotation visual indicators in EPUB viewer
    - Load annotations for current document on open
    - Use react-reader's annotation API to display highlights
    - Apply CFI ranges from annotation position data
    - Render highlights with semi-transparent styling
    - Make annotation highlights clickable
    - Persist display across chapter navigation
    - _Requirements: 5.7, 5.8, 5.9_

  - [ ] (optional) 9.3 Write component tests for annotation display
    - **Property 21: Annotation retrieval**
    - **Property 22: Annotation visual indicators**
    - **Property 23: Annotation detail display**
    - **Validates: Requirements 5.7, 5.8, 5.9**

  - [ ] 9.4 Create annotations panel component
    - Display list of all annotations for current document
    - Show selected text preview and creation timestamp for each
    - Implement click to scroll to annotation in document and show details
    - Display editable text field for personal notes on each annotation
    - Save note changes to database
    - Add search field to filter annotations by selected text or note content
    - Display all annotations when search is empty
    - _Requirements: 16.1, 16.2, 16.3, 16.8, 16.9, 5.10, 5.11_

  - [ ] 9.5 Implement annotation deletion
    - Add right-click context menu with "Delete" option
    - Display confirmation dialog warning about permanent removal of annotation and all associated conversations
    - Delete annotation and cascade to conversations in database
    - Remove visual indicator from document view
    - _Requirements: 16.4, 16.5, 16.6, 16.7_

- [ ] 10. LLM service and Gemini API integration
  - [ ] 10.1 Implement Gemini API streaming in Rust backend
    - Create `call_gemini` Tauri command in `src-tauri/src/llm.rs`
    - Read API key from Tauri Store (never expose to webview)
    - Construct request with system instruction, message history, and generation config (temperature: 0.7, maxOutputTokens: 4096)
    - Hardcode system prompt in Rust backend (per design)
    - Open SSE stream to Gemini API
    - Emit `gemini_chunk_<streamId>` events for each text delta
    - Emit `gemini_done_<streamId>` or `gemini_error_<streamId>` on completion
    - _Requirements: 7.1, 7.5, 7.6, 7.7_

  - [ ] 10.2 Implement stream cancellation in Rust backend
    - Maintain `HashMap<String, AbortHandle>` to track active streams
    - Create `cancel_gemini` Tauri command that aborts the HTTP request
    - Handle race condition: if cancel arrives after done is emitted, frontend checks conversation state before persisting
    - If two streams start for the same annotation in quick succession, cancel the first before starting the second
    - _Requirements: 7.8_

  - [ ] 10.3 Create LLM service shim in TypeScript frontend
    - Implement streamMessage method that invokes `call_gemini` via Tauri `invoke()`
    - Subscribe to `gemini_chunk_<streamId>` events and invoke onChunk callback
    - Handle `gemini_done_<streamId>` and `gemini_error_<streamId>` events
    - Return UnlistenFn; calling it cancels the stream via `invoke('cancel_gemini', { streamId })`
    - Replace any existing frontend code that calls Gemini API directly
    - _Requirements: 7.5, 7.6_

  - [ ] 10.4 Handle API errors and missing API key
    - Rust backend checks for configured API key before making request; emits error event if not set
    - Frontend displays error message and opens Settings dialog if key missing
    - Parse and display descriptive error responses from Gemini (invalid key, rate limit, network error)
    - API errors displayed in AI panel remain visible until dismissed (not auto-dismissed)
    - _Requirements: 7.1, 7.2, 13.4_

- [ ] 11. AI Panel and conversation management
  - [ ] 11.1 Create AiPanel component with conversation display
    - Display selected text at top of panel
    - Render conversation history with user and model messages
    - Show conversation picker when annotation has multiple conversations
    - Allow switching between conversations for same annotation
    - Provide "New conversation" button to start a fresh conversation for the same annotation (does not delete previous ones)
    - Most recent conversation shown by default when opening an annotation
    - _Requirements: 6.2, 6.3, 6.4, 7.4, 10.2, 10.3_

  - [ ] 11.2 Implement markdown and math rendering
    - Use react-markdown for markdown rendering
    - Add remark-math and rehype-katex for LaTeX support
    - Render inline math ($equation$) and block math ($$equation$$)
    - Preserve formatting for code blocks, lists, and other markdown elements
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [ ] (optional) 11.3 Write component tests for markdown and math rendering
    - **Property 33: Markdown rendering**
    - **Property 34: Inline math rendering**
    - **Property 35: Block math rendering**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.5**

  - [ ] 11.4 Implement annotation creation via "Explain" button
    - Handle "Explain" button click from selection toolbar
    - Check for configured API key; if missing, show error and open Settings
    - Create annotation record in database (reuse logic from task 8.3)
    - _Requirements: 6.1, 7.1, 7.2_

  - [ ] 11.5 Implement conversation initiation
    - Generate UUID for conversation ID
    - Create conversation record in database with mode='explain'
    - Open AI panel with selected text displayed
    - Auto-send initial explanation request to Gemini API via Rust backend
    - Display loading indicator while waiting for response
    - _Requirements: 6.1, 7.3, 7.4, 7.5, 7.6_

  - [ ] (optional) 11.6 Write tests for annotation-and-conversation creation
    - **Property 24: Annotation creation with explanation**
    - **Property 25: Deferred explanation creation**
    - **Property 27: Conversation creation**
    - **Validates: Requirements 6.1, 7.3**

  - [ ] 11.7 Implement streaming response display
    - Stream AI response token-by-token via chunk events
    - Progressively render response with markdown as tokens arrive
    - Accumulate streaming text in temporary state (ConversationSlice.streamingText)
    - On stream completion: commit accumulated text to messages array, reset streamingText to ''
    - _Requirements: 7.7_

  - [ ] 11.8 Implement partial response and persistence behavior
    - On network interruption mid-stream: preserve partial response text already rendered, display error indicator
    - Do NOT persist incomplete exchanges to database; only persist after complete (non-interrupted) response
    - On successful completion: persist the full conversation messages to database
    - _Requirements: 7.8, 7.9_

  - [ ] 11.9 Implement follow-up question input
    - Add input field for follow-up questions
    - Handle Enter key to send message
    - Support Shift+Enter for multi-line input
    - Disable input while streaming
    - Clear input field after sending
    - _Requirements: 8.1, 8.6_

  - [ ] 11.10 Implement conversation continuation
    - Send follow-up message with full conversation history (all previous messages included in API request)
    - Append new response to conversation display
    - Update conversation record in database with new messages
    - _Requirements: 8.2, 8.3, 8.4, 8.5_

  - [ ] (optional) 11.11 Write property tests for conversation management
    - **Property 28: Conversation persistence round-trip**
    - **Property 29: Conversation context preservation**
    - **Property 30: Conversation message accumulation**
    - **Property 31: Conversation retrieval**
    - **Property 32: Conversation continuation**
    - **Validates: Requirements 7.9, 8.2, 8.3, 8.4, 8.5, 10.1, 10.2, 10.3, 10.4**

- [ ] 12. Checkpoint — AI features
  - Verify end-to-end "Explain" flow: select text → create annotation → stream response → persist conversation
  - Verify follow-up questions preserve full context
  - Verify partial responses are displayed but not persisted
  - Verify stream cancellation works (close panel mid-stream)
  - Ensure all tests pass; ask the user if questions arise

- [ ] 13. Reading position persistence
  - [ ] 13.1 Implement position tracking for PDF
    - Save current page number to database on navigation
    - Debounce updates to avoid excessive writes (500ms interval)
    - Restore saved page number when reopening document
    - _Requirements: 17.1, 17.3, 17.4, 17.6_

  - [ ] 13.2 Implement position tracking for EPUB
    - Save current CFI location to database on navigation
    - Debounce updates to avoid excessive writes (500ms interval)
    - Restore saved CFI location when reopening document
    - _Requirements: 17.2, 17.3, 17.5, 17.6_

- [ ] 14. Library screen and document management
  - [ ] 14.1 Create Library screen component
    - Display all documents from database (including those hidden from recent list)
    - Show document title, file type, last opened date, and annotation count
    - Handle click to open document; if file no longer exists on disk, display error and offer to delete stored data
    - _Requirements: 18.1, 18.2, 18.3_

  - [ ] 14.2 Implement document data deletion from Library
    - Add right-click context menu with "Delete stored data" option
    - Display confirmation dialog warning action is permanent and cannot be undone
    - Delete document record with cascade to annotations and conversations
    - _Requirements: 18.4, 18.5_

  - [ ] 14.3 Implement restore to recent list
    - Add right-click option on hidden documents to restore them to the recent list
    - Update hidden_from_recent flag in database
    - _Requirements: 18.6_

- [ ] 15. Offline mode and error handling
  - [ ] 15.1 Implement offline mode behavior
    - Allow document viewing, navigation, and annotation creation without network access
    - Allow viewing existing conversations and annotations offline
    - Display error message when attempting to create new AI explanation while offline
    - Display error message when attempting to send follow-up question while offline
    - Display error message when attempting to test API connection while offline
    - Allow AI features to function normally when connectivity is restored (no restart required)
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.6_

  - [ ] 15.2 Implement comprehensive error handling
    - Handle file not found errors (toast + remain on current screen)
    - Handle file read permission errors
    - Handle corrupted file errors
    - Handle database errors (not initialized, write failure, foreign key violation)
    - Handle network errors
    - Handle API rate limit errors
    - Handle API response parsing errors
    - Log all errors to console for debugging
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

- [ ] 16. Performance optimizations and limits
  - [ ] 16.1 Implement document size warnings
    - Warn when PDF exceeds 2000 pages
    - Warn when EPUB exceeds 50MB
    - Display loading indicators for slow renders (> 500ms)
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5_

  - [ ] 16.2 Implement annotation pagination
    - Limit displayed annotations to 500 per document
    - Add pagination or virtual scrolling for larger sets
    - _Requirements: 20.6_

  - [ ] 16.3 Implement database size warning
    - Check database size on startup
    - Warn when database exceeds 1GB
    - Recommend export and archive
    - _Requirements: 20.7_

- [ ] 17. Final integration and polish
  - [ ] 17.1 Cross-platform testing
    - Test file dialogs on Windows, macOS, Linux
    - Verify database location on all platforms
    - Test PDF.js worker loading on all platforms
    - Test EPUB text selection on all platforms

  - [ ] (optional) 17.2 Write integration tests for end-to-end flows
    - Test complete document opening flow
    - Test annotation creation and retrieval flow
    - Test AI explanation flow
    - Test conversation continuation flow
    - Test document reopening with position restoration

- [ ] 18. Final checkpoint — Complete testing and validation
  - Run full test suite
  - Verify all requirements are covered
  - Ask the user if questions arise

## Post-MVP

These tasks are mentioned in the design document but are not covered by the requirements. They should be implemented after the MVP is stable.

- [ ] P1. Database backup and recovery
  - [ ] P1.1 Implement automatic database backup
    - Check last backup date on startup
    - Create backup if > 7 days old
    - Run backup asynchronously on background thread
    - Keep 3 most recent backups, delete older ones

  - [ ] P1.2 Implement backup restoration
    - Add "Restore from Backup" option in Settings
    - List available backups with timestamps
    - Copy selected backup to studybuddy.db
    - Restart application after restore

  - [ ] P1.3 Implement database corruption recovery
    - Detect corruption on startup
    - Offer to restore from most recent backup
    - Offer to create new empty database if no backup exists
    - Log corruption events

- [ ] P2. Dynamic model list
  - Fetch available models from Gemini API on Settings dialog open
  - Add "Refresh Models" button
  - Fall back to hardcoded list if fetch fails

- [ ] P3. File reconnection
  - When opening a file whose hash matches an existing document at a different path, offer to migrate annotations
  - In Library view, detect missing files and offer to "Reconnect" by selecting new location

- [ ] P4. System prompt versioning
  - Store system prompt in database with version tracking
  - Add prompt_version field to conversations table
  - Allow A/B testing and rollback

## Notes

- Tasks marked with `(optional)` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at major milestones
- Property tests (fast-check) validate universal correctness properties; component tests (React Testing Library) validate UI behavior — see design document Testing Strategy for which properties suit which approach
- The implementation follows a bottom-up approach: infrastructure → viewing → annotations → AI
- Error boundaries are included in task 4.7 (not deferred) since they prevent crashes from propagating
