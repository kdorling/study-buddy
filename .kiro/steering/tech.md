---
inclusion: always
---

# Technology Stack

## Framework

- **Tauri**: Desktop application framework combining Rust backend with web frontend
- **React**: UI framework with TypeScript
- **Vite**: Build tool and development server

## Key Technologies

- **TypeScript**: Primary language for frontend
- **Rust**: Backend language for Tauri
- **SQLite**: Local database for documents, annotations, and conversations
- **Google Gemini API**: AI-powered explanations (specific models configured in design.md and settings.json)
- **KaTeX**: LaTeX math rendering
- **Markdown**: Response formatting

## Development Tools

- **VS Code**: Recommended IDE
- **Tauri VS Code Extension**: For Tauri development
- **rust-analyzer**: Rust language support

## Common Commands

Since the project is not yet implemented, standard Tauri commands will apply:

```bash
# Install dependencies
npm install

# Development mode
npm run tauri dev

# Build for production
npm run tauri build

# Run tests
npm test
```

## Database

- SQLite with tables: documents, annotations, conversations
- Tauri store plugin for settings persistence
- Foreign key constraints enforced
- Migrations applied on first launch
