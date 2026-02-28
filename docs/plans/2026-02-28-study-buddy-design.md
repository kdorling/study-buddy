# Study Buddy — Design Document

> AI-powered document reader for PDFs and EPUBs with interactive comprehension assistance, step-by-step math guidance, and a cross-document knowledge base.

## Overview

Study Buddy is a desktop application for Ubuntu Linux that lets you read PDFs and EPUBs, highlight passages or select regions you don't understand, and interact with an LLM to get explanations, simplified translations, and guided step-by-step math problem solving. All interactions are persisted in a local knowledge base with cross-document concept linking.

**Target:** Local desktop app for Ubuntu Linux, open source.

## Technology Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Desktop shell | **Tauri v2** | Lightweight (~15MB), uses system WebView, Rust backend |
| Frontend | **React + TypeScript** | Rich interactive UI, large ecosystem |
| PDF rendering | **PDF.js** | Gold standard for web-based PDF rendering |
| EPUB rendering | **epub.js** | Mature EPUB rendering library |
| Math rendering | **KaTeX** | Fast LaTeX rendering in the browser |
| Database | **SQLite** (via Tauri plugin) | Local persistence, no server needed |
| LLM (Phase 1) | **Google Gemini API** | User provides API key |
| LLM (Phase 2+) | **OpenAI-compatible APIs + Ollama** | Multi-provider support |
| Styling | **CSS** | Vanilla CSS with custom design system |

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   Tauri Shell                    │
│  ┌─────────────────────────────────────────────┐│
│  │              React Frontend                 ││
│  │                                             ││
│  │  ┌──────────────┐  ┌─────────────────────┐ ││
│  │  │ Document     │  │  AI Assistant Panel  │ ││
│  │  │ Viewer       │  │                      │ ││
│  │  │              │  │  • Chat thread        │ ││
│  │  │ • PDF.js     │  │  • Whiteboard mode   │ ││
│  │  │ • epub.js    │  │  • Math rendering    │ ││
│  │  │              │  │  • History browser   │ ││
│  │  │ [highlight]──┼──▶                      │ ││
│  │  │ [screenshot]─┼──▶                      │ ││
│  │  └──────────────┘  └─────────────────────┘ ││
│  └──────────────────┬──────────────────────────┘│
│                     │ Tauri Commands (IPC)       │
│  ┌──────────────────▼──────────────────────────┐│
│  │              Rust Backend                    ││
│  │  • File system access                       ││
│  │  • SQLite database (annotations, links)     ││
│  │  • Configuration management                 ││
│  │  • LLM API proxy (keeps API keys secure)    ││
│  └─────────────────────────────────────────────┘│
└─────────────────────────────────────────────────┘
```

### Key Design Decisions

- **Split-panel layout** — document on the left, AI assistant on the right (resizable/collapsible)
- **Rust backend is thin** — handles file I/O, SQLite, config, and proxies LLM API calls
- **LLM calls go through Rust** — keeps API keys secure, not exposed in WebView JS
- **All rendering in WebView** — PDF.js and epub.js handle documents, React handles UI

## Data Model (SQLite)

### `documents`

| Column | Type | Purpose |
|--------|------|---------|
| `id` | TEXT (UUID) | Primary key |
| `title` | TEXT | Document title (extracted or user-set) |
| `file_path` | TEXT | Absolute path on disk |
| `file_hash` | TEXT | SHA-256 to detect moves/changes |
| `file_type` | TEXT | `pdf` or `epub` |
| `last_opened` | TEXT (ISO 8601) | For recent files list |
| `metadata` | TEXT (JSON) | Author, page count, etc. |

### `annotations`

| Column | Type | Purpose |
|--------|------|---------|
| `id` | TEXT (UUID) | Primary key |
| `document_id` | TEXT (FK) | Which document |
| `page_or_chapter` | TEXT | Page number or EPUB chapter ID |
| `selection_type` | TEXT | `text` or `region` |
| `selected_text` | TEXT | Highlighted text (null for regions) |
| `region_image` | BLOB | Screenshot of region (null for text) |
| `position_data` | TEXT (JSON) | Coordinates/offsets for highlight restoration |
| `created_at` | TEXT (ISO 8601) | |

### `conversations`

| Column | Type | Purpose |
|--------|------|---------|
| `id` | TEXT (UUID) | Primary key |
| `annotation_id` | TEXT (FK) | Which annotation |
| `mode` | TEXT | `explain`, `translate`, `whiteboard`, `freeform` |
| `messages` | TEXT (JSON) | Full message history |
| `summary` | TEXT | Auto-generated summary for search |
| `created_at` | TEXT (ISO 8601) | |
| `updated_at` | TEXT (ISO 8601) | |

### `tags`

| Column | Type |
|--------|------|
| `id` | TEXT (UUID) |
| `name` | TEXT (UNIQUE) |

### `annotation_tags`

| Column | Type |
|--------|------|
| `annotation_id` | TEXT (FK) |
| `tag_id` | TEXT (FK) |

### `annotation_links`

| Column | Type | Purpose |
|--------|------|---------|
| `source_id` | TEXT (FK → annotations) | |
| `target_id` | TEXT (FK → annotations) | |
| `relationship` | TEXT | `related`, `builds_on`, `contradicts` |

## Annotation Persistence

### PDF Highlights

PDF.js renders two layers: a canvas (pixels) and a text layer (positioned HTML spans). Highlights are stored with:

- **`selected_text`** — the actual text (primary matching strategy)
- **`position_data`** — page number, character offsets, normalized bounding rects

Restoration strategy (in order of reliability):
1. Text matching — search for `selected_text` on the stored page
2. Normalized coordinates — fall back to stored rects (scale-independent)
3. Character offsets — last resort

### PDF Region Selection

User draws a rectangle on a page. Stored as normalized coordinates + a screenshot blob. Rendered as a dashed-border overlay.

### EPUB Highlights

Use EPUB CFI (Canonical Fragment Identifier) for stable location pointers:
```json
{ "cfi": "epubcfi(/6/14!/4/2/8/1:0)", "chapter": "chapter-03.xhtml" }
```

### Resilience

Storing the actual selected text alongside position data means annotations survive even if the file changes slightly. If the text can't be found, the conversation remains accessible in the knowledge base with a "highlight not found" indicator.

## AI Interaction Modes

### 1. Explain 💡

Highlight text or select region → "Explain". LLM explains the passage clearly, defines jargon, uses analogies. User can ask follow-ups in the same thread.

### 2. Simplify 📖

Highlight text → "Simplify". LLM rewrites in plain language. Side-by-side comparison of original vs. simplified. Adjustable difficulty level (dropdown: high school → graduate).

### 3. Whiteboard (Step-by-Step) 🧮

Highlight a proof or exercise → "Work Through". The LLM breaks the problem into steps and guides the user:

- **"Check my work"** — evaluates the user's attempt
- **"Give me a hint"** — nudges without revealing the answer
- **"Show me the solution"** — reveals the full answer (with confirmation dialog)
- Supports LaTeX input/rendering for math
- Sessions are resumable

### 4. Freeform Chat 💬

Open-ended conversation, optionally with highlighted context. Full markdown + math rendering.

### Shared Features

- **Model selector** — dropdown for configured providers
- **Conversation history** — filterable by document, tag, or mode
- **Auto-tagging** — LLM suggests concept tags after conversations; user can accept/edit

## Feature Phasing

### Phase 1 — Core Reader (MVP)
- Tauri + React project scaffold
- PDF rendering with PDF.js (page nav, zoom)
- EPUB rendering with epub.js
- File open dialog, recent files list
- Text selection → "Explain" mode (single Q&A + follow-ups)
- Google Gemini API support (API key in settings)
- SQLite database (documents + annotations)
- Basic highlight persistence

### Phase 2 — Rich AI Interaction
- "Simplify" mode with difficulty slider
- Whiteboard/step-by-step mode for math
- Region/screenshot selection
- Multi-provider LLM support (OpenAI-compatible + Ollama)
- Conversation history panel
- KaTeX rendering in chat

### Phase 3 — Knowledge Base
- Auto-tagging after conversations
- Tag management UI
- Cross-document "related annotations" panel
- Manual annotation linking with relationship labels
- Full-text search across annotations and conversations
- Knowledge base browser (standalone view)

### Phase 4 — Polish
- Freeform chat mode
- Dark mode / theme support
- Keyboard shortcuts
- Export annotations (markdown, PDF)
- Document library management
