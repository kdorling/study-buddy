# Requirements Document: Study Buddy

## Introduction

Study Buddy is an AI-powered study companion desktop application that helps students understand difficult passages from textbooks, research papers, and other academic documents. The application provides document viewing capabilities for PDF and EPUB files, text selection and annotation features, and AI-powered explanations through integration with Google's Gemini API.

## Glossary

- **System**: The Study Buddy desktop application
- **Document**: A PDF or EPUB file opened by the user
- **Annotation**: A record of text selected by the user, including position data and metadata
- **Conversation**: A chat session between the user and AI assistant about a specific annotation
- **Selection_Toolbar**: The floating UI element that appears when text is selected
- **AI_Panel**: The side panel displaying conversation history and input for follow-up questions
- **Database**: The SQLite database storing documents, annotations, and conversations
- **Gemini_API**: Google's Generative AI API used for AI responses
- **PDF_Viewer**: The component responsible for rendering and interacting with PDF files
- **EPUB_Viewer**: The component responsible for rendering and interacting with EPUB files
- **Settings_Store**: Persistent storage for user configuration (API key, model selection)

## Requirements

### Requirement 1: Document Opening and Management

**User Story:** As a student, I want to open and manage PDF and EPUB documents, so that I can study from various academic materials.

#### Acceptance Criteria

1. WHEN a user clicks the open file button, THE System SHALL display a file picker dialog filtered to PDF and EPUB files
2. WHEN a user drags and drops a single file onto the application window, THE System SHALL attempt to open it as if selected via the file picker; unsupported file types SHALL be rejected with an error message per criterion 6
3. WHEN a user drags and drops multiple files onto the application window, THE System SHALL open only the first file and ignore the rest
4. WHEN a user drags and drops a folder onto the application window, THE System SHALL display an error message indicating that folders are not supported
5. WHEN a user selects a valid PDF or EPUB file, THE System SHALL open and display the document
6. WHEN a user attempts to open an unsupported file type, THE System SHALL display an error message and prevent opening
7. WHEN a document is opened, THE System SHALL store document metadata in the Database
8. THE System SHALL track the last opened timestamp for each document
9. WHEN a user returns to the home screen, THE System SHALL display a list of recently opened documents ordered by last opened time
10. WHEN a user clicks a recent document, THE System SHALL open that document
11. WHEN a user attempts to open a document that is already open, THE System SHALL bring focus to the already-open document without creating a duplicate instance
12. WHEN a user right-clicks a recent document, THE System SHALL offer an option to remove it from the recent files list; this SHALL hide the document from the recent list only — annotations and conversations for that document SHALL be preserved
13. WHEN a document file no longer exists on disk, THE System SHALL display a warning indicator on that recent file entry
14. WHEN a document file has been modified externally since last opened (detected via file_hash comparison), THE System SHALL display a warning indicator on that recent file entry

### Requirement 2: PDF Viewing and Navigation

**User Story:** As a student, I want to view and navigate PDF documents, so that I can read and study PDF textbooks and papers.

#### Acceptance Criteria

1. WHEN a PDF is opened, THE PDF_Viewer SHALL render the first page
2. THE PDF_Viewer SHALL display page navigation controls (previous, next, jump to page)
3. WHEN a user clicks the next button, or presses the page down button on the keyboard, THE PDF_Viewer SHALL advance to the next page
4. WHEN a user clicks the previous button, or presses the page up button on the keyboard, THE PDF_Viewer SHALL go to the previous page
5. WHEN a user enters a page number and presses Enter, THE PDF_Viewer SHALL navigate to that page
6. THE PDF_Viewer SHALL display zoom controls with range from 50% to 300%, and allow the mouse wheel to adjust the zoom level
7. WHEN a user adjusts zoom, THE PDF_Viewer SHALL re-render the current page at the new scale
8. THE PDF_Viewer SHALL render a text layer over the PDF canvas for text selection
9. WHEN the current page is the first page, THE System SHALL disable the previous button
10. WHEN the current page is the last page, THE System SHALL disable the next button

### Requirement 3: EPUB Viewing and Navigation

**User Story:** As a student, I want to view and navigate EPUB documents, so that I can read digital textbooks and ebooks.

#### Acceptance Criteria

1. WHEN an EPUB is opened, THE EPUB_Viewer SHALL render the first chapter
2. THE EPUB_Viewer SHALL provide chapter navigation controls
3. THE EPUB_Viewer SHALL apply dark theme styling to EPUB content
4. WHEN a user navigates between chapters, THE EPUB_Viewer SHALL update the display
5. THE EPUB_Viewer SHALL track the current reading location using CFI (Canonical Fragment Identifier)

### Requirement 4: Text Selection

**User Story:** As a student, I want to select text passages in documents, so that I can mark content I need help understanding.

#### Acceptance Criteria

1. WHEN a user selects text in a PDF, THE System SHALL capture the selected text and position data
2. WHEN a user selects text in an EPUB, THE System SHALL capture the selected text and CFI location
3. WHEN text is selected, THE Selection_Toolbar SHALL appear near the selection
4. THE System SHALL normalize PDF selection coordinates relative to page dimensions
5. WHEN a user clicks outside the Selection_Toolbar, THE System SHALL dismiss the toolbar and clear the selection
6. WHEN a user clicks and drags the mouse while holding the left mouse button down, THE system SHALL highlight text until the mouse button is released

### Requirement 5: Annotation Creation and Management

**User Story:** As a student, I want to save highlighted text as annotations, so that I can mark passages for later review and return to important content.

#### Acceptance Criteria

1. WHEN text is selected, THE Selection_Toolbar SHALL display both "Annotate" and "Explain" buttons
2. WHEN a user clicks "Annotate" on selected text, THE System SHALL create an annotation record in the Database
3. THE System SHALL store the selected text, page or chapter location, and position data in the annotation
4. THE System SHALL associate each annotation with its parent document
5. THE System SHALL timestamp each annotation with creation time
6. WHEN an annotation is created via "Annotate", THE System SHALL dismiss the Selection_Toolbar and clear the selection
7. WHEN a document is opened, THE System SHALL load all annotations for that document
8. WHEN a document is opened, THE System SHALL display visual indicators for all saved annotations
9. WHEN a user clicks on a saved annotation indicator, THE System SHALL display the annotation details
10. WHEN viewing annotation details, THE System SHALL provide an editable text field for the user to add or edit a personal note on the annotation
11. WHEN a user saves changes to an annotation note, THE System SHALL persist the updated note text to the Database

### Requirement 6: AI Explanations for Annotations

**User Story:** As a student, I want to get AI explanations for my annotations, so that I can better understand difficult passages I've marked.

#### Acceptance Criteria

1. WHEN a user clicks "Explain" on selected text, THE System SHALL create an annotation record in the Database and initiate a new AI conversation
2. WHEN a user clicks "Explain" on an existing annotation, THE System SHALL create a new conversation for that annotation
3. WHEN a user clicks on an existing annotation, THE System SHALL open the AI_Panel showing the most recent conversation; if the annotation has more than one conversation THE AI_Panel SHALL provide a way to switch between them
4. An annotation MAY have zero, one, or many associated conversations; conversations are never automatically deleted when a new one is started

### Requirement 7: AI Conversation Initiation

**User Story:** As a student, I want to get AI explanations of difficult passages, so that I can better understand complex material.

#### Acceptance Criteria

1. WHEN a user clicks "Explain" on selected text, THE System SHALL check for a configured Gemini API key
2. IF no API key is configured, THEN THE System SHALL display an error message and open the Settings dialog
3. WHEN an API key is configured, THE System SHALL create a conversation record in the Database
4. THE System SHALL open the AI_Panel with the selected text displayed
5. THE System SHALL automatically send an initial explanation request to the Gemini_API
6. THE System SHALL display a loading indicator while waiting for the AI response
7. THE System SHALL stream the AI response token-by-token, progressively rendering it in the AI_Panel with markdown rendering as tokens arrive
8. WHEN a streaming response is interrupted by a network error, THE System SHALL preserve any partial response text already received and display an error indicator, rather than discarding the partial content
9. THE System SHALL persist the conversation messages to the Database only after a complete (non-interrupted) response is received; partial responses interrupted mid-stream SHALL NOT be persisted

### Requirement 8: AI Conversation Continuation

**User Story:** As a student, I want to ask follow-up questions about passages, so that I can deepen my understanding through dialogue.

#### Acceptance Criteria

1. WHEN the AI_Panel is open, THE System SHALL provide an input field for follow-up questions
2. WHEN a user enters a question and presses Enter, THE System SHALL send the message to the Gemini_API with conversation history
3. THE System SHALL maintain conversation context by including all previous messages
4. WHEN a new AI response is received, THE System SHALL append it to the conversation display
5. THE System SHALL update the conversation record in the Database with new messages
6. THE System SHALL support Shift+Enter for multi-line input without sending

### Requirement 9: Markdown and Math Rendering

**User Story:** As a student studying technical subjects, I want AI responses to render mathematical notation properly, so that I can understand explanations involving equations.

#### Acceptance Criteria

1. WHEN displaying AI responses, THE System SHALL parse and render markdown formatting
2. THE System SHALL render inline LaTeX math expressions enclosed in single dollar signs
3. THE System SHALL render block LaTeX math expressions enclosed in double dollar signs
4. THE System SHALL use KaTeX for math rendering
5. THE System SHALL preserve formatting for code blocks, lists, and other markdown elements

### Requirement 10: Conversation History Persistence

**User Story:** As a student, I want my conversations to be saved, so that I can review previous explanations.

#### Acceptance Criteria

1. WHEN a conversation is created or updated, THE System SHALL persist messages to the Database
2. WHEN a user clicks on a previous annotation, THE System SHALL load the associated conversation
3. THE System SHALL display the full conversation history in the AI_Panel
4. THE System SHALL allow users to continue previous conversations with new questions

### Requirement 11: Settings Management

**User Story:** As a user, I want to configure my Gemini API key and model preferences, so that I can use the AI features.

#### Acceptance Criteria

1. WHEN a user opens Settings, THE System SHALL display the current API key (masked) and selected model
2. THE System SHALL provide a toggle to show/hide the API key
3. THE System SHALL offer model selection from available Gemini models
4. THE System SHALL fetch the list of available models from the Gemini API or maintain a configurable list that can be updated without code changes
5. WHEN a user clicks "Test Connection", THE System SHALL send a test request to the Gemini_API
6. THE System SHALL display success or error feedback for the connection test
7. WHEN a user saves settings, THE System SHALL persist the API key and model to the Settings_Store
8. THE Settings_Store SHALL use Tauri's store plugin for persistent storage

### Requirement 12: Database Schema and Migrations

**User Story:** As a developer, I want a well-structured database schema, so that the application can reliably store and retrieve data.

#### Acceptance Criteria

1. THE Database SHALL include a documents table with columns: id, title, file_path, file_hash, file_type, last_opened, last_position, hidden_from_recent, metadata
2. THE Database SHALL include an annotations table with columns: id, document_id, page_or_chapter, selected_text, position_data, note, created_at
3. THE Database SHALL include a conversations table with columns: id, annotation_id, mode, messages, summary, created_at, updated_at
4. THE Database SHALL enforce foreign key constraints (annotations → documents, conversations → annotations)
5. THE Database SHALL enforce check constraints on file_type (pdf, epub)
6. THE Database SHALL create indexes on document_id in annotations and annotation_id in conversations
7. THE System SHALL apply database migrations on first launch

### Requirement 13: Error Handling and User Feedback

**User Story:** As a user, I want clear feedback when errors occur, so that I understand what went wrong and how to fix it.

#### Acceptance Criteria

1. WHEN an error occurs, THE System SHALL display a toast notification with the error message
2. THE System SHALL automatically dismiss success toast notifications after 4 seconds; error toasts SHALL remain visible until the user explicitly dismisses them
3. WHEN a file fails to load, THE System SHALL display an error message and remain on the current screen
4. WHEN an API request fails, THE System SHALL display the error message in the AI_Panel
5. THE System SHALL log errors to the console for debugging purposes

### Requirement 14: User Interface Layout

**User Story:** As a user, I want an intuitive interface layout, so that I can easily access all features.

#### Acceptance Criteria

1. THE System SHALL display a vertical sidebar with navigation buttons
2. THE sidebar SHALL include buttons for: Open File, Home, Library, and Settings
3. THE System SHALL display the main content area adjacent to the sidebar
4. WHEN no document is open, THE System SHALL display a welcome screen with app description and recent files
5. WHEN a document is open, THE System SHALL display the appropriate viewer (PDF or EPUB)
6. WHEN a conversation is active, THE AI_Panel SHALL appear as an overlay on the right side
7. THE System SHALL use a dark theme throughout the interface
8. THE System SHALL support keyboard shortcuts: Ctrl+O (open file), Escape (close AI panel / dismiss toolbar), Ctrl+, (open settings), Left/Right Arrow (previous/next PDF page when the document viewer has focus and no text input is focused), +/- keys (zoom in/out when the document viewer has focus), Ctrl+W (close current document and return to home screen), Ctrl+B (toggle annotations panel), Ctrl+F (focus annotation search field)

### Requirement 15: Application Initialization

**User Story:** As a user, I want the application to start quickly and load my previous state, so that I can resume studying efficiently.

#### Acceptance Criteria

1. WHEN the application launches, THE System SHALL initialize the Database connection
2. THE System SHALL load recent documents from the Database
3. THE System SHALL display the welcome screen by default
4. THE System SHALL handle database initialization errors gracefully on first launch
5. THE System SHALL load user settings from the Settings_Store

### Requirement 16: Annotation List and Management

**User Story:** As a student, I want to view and manage all my annotations, so that I can review and organize my study highlights.

#### Acceptance Criteria

1. WHEN a document is open, THE System SHALL provide an annotations panel listing all annotations for that document
2. THE annotations panel SHALL display the selected text preview and creation timestamp for each annotation
3. WHEN a user clicks an annotation in the list, THE System SHALL scroll to that annotation in the document and show its details
4. WHEN a user right-clicks an annotation, THE System SHALL offer a "Delete" option
5. WHEN a user selects "Delete" for an annotation, THE System SHALL display a confirmation dialog warning that this action will permanently remove the annotation and all associated conversations
6. WHEN a user confirms deletion of an annotation, THE System SHALL remove the annotation and its associated conversation from the Database
7. WHEN an annotation is deleted, THE System SHALL remove its visual indicator from the document view
8. THE annotations panel SHALL provide a search field that filters the annotation list to entries whose selected text or note contains the search query
9. WHEN the search field is empty, THE annotations panel SHALL display all annotations for the document

### Requirement 17: Reading Position Persistence

**User Story:** As a student, I want the app to remember where I left off in each document, so that I can resume reading without manually finding my place.

#### Acceptance Criteria

1. WHEN a user navigates to a page in a PDF, THE System SHALL save the current page number to the Database
2. WHEN a user navigates in an EPUB, THE System SHALL save the current CFI location to the Database
3. WHEN a document is reopened from the recent files list, THE System SHALL restore the last saved reading position
4. WHEN a PDF is restored, THE System SHALL display the saved page number
5. WHEN an EPUB is restored, THE System SHALL navigate to the saved CFI location
6. THE System SHALL update the saved position each time the user navigates (debounced to avoid excessive writes)

### Requirement 18: Document Library

**User Story:** As a student, I want to see all documents I have ever studied, so that I can access my stored annotations and conversations even for documents I've hidden from the recent list.

#### Acceptance Criteria

1. THE System SHALL provide a Library screen accessible from the sidebar that lists all documents stored in the Database, including those hidden from the recent files list
2. THE Library screen SHALL display each document's title, file type, last opened date, and annotation count
3. WHEN a user clicks a document in the Library, THE System SHALL attempt to open it; if the file no longer exists on disk THE System SHALL display an error and offer to delete the document data
4. WHEN a user right-clicks a document in the Library, THE System SHALL offer a "Delete stored data" option that permanently removes the document record and all associated annotations and conversations from the Database
5. WHEN a user confirms deletion of stored data, THE System SHALL display a warning that this action cannot be undone
6. WHEN a user right-clicks a document in the Library that is hidden from the recent list, THE System SHALL offer an option to restore it to the recent files list

### Requirement 19: Offline Mode and Degraded Functionality

**User Story:** As a student, I want to continue using core features when offline, so that I can study without an internet connection after initial setup.

#### Acceptance Criteria

1. WHEN the System is offline, THE System SHALL allow users to open documents, view documents, navigate pages, and create annotations without network access
2. WHEN the System is offline, THE System SHALL allow users to view existing conversations and annotations that were previously saved
3. WHEN the System is offline and a user attempts to create a new AI explanation, THE System SHALL display an error message indicating that network access is required for AI features
4. WHEN the System is offline and a user attempts to send a follow-up question in an existing conversation, THE System SHALL display an error message indicating that network access is required
5. WHEN the System is offline and a user attempts to test the API connection in Settings, THE System SHALL display an error message indicating that network access is required
6. WHEN the System regains network connectivity after being offline, THE System SHALL allow AI features to function normally without requiring an application restart

### Requirement 20: Performance and Document Size Limits

**User Story:** As a student, I want the application to handle large documents efficiently, so that I can study from comprehensive textbooks without performance degradation.

#### Acceptance Criteria

1. THE System SHALL support PDF documents up to 2000 pages without crashing or freezing
2. THE System SHALL support EPUB documents up to 50MB in file size without crashing or freezing
3. WHEN a PDF page is rendered, THE System SHALL complete the rendering within 3 seconds for pages up to 10MB in size
4. WHEN a user navigates to a new page in a PDF, THE System SHALL display a loading indicator if rendering takes longer than 500ms
5. WHEN a document exceeds recommended size limits (PDF > 2000 pages or EPUB > 50MB), THE System SHALL display a warning that performance may be degraded
6. THE System SHALL limit the number of annotations displayed simultaneously to 500 per document; if more exist, THE System SHALL provide pagination or virtual scrolling in the annotations panel
7. WHEN the Database exceeds 1GB in size, THE System SHALL display a warning recommending the user export and archive old annotations

