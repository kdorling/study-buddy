---
inclusion: always
---

# Project Structure

## Current Organization

```
.
├── .git/                    # Git repository
├── .kiro/                   # Kiro configuration
│   ├── specs/              # Feature specifications
│   │   └── study-buddy/    # Study Buddy feature spec
│   └── steering/           # AI assistant guidance documents
├── .vscode/                # VS Code configuration
│   ├── extensions.json     # Recommended extensions
│   └── settings.json       # Workspace settings
└── README.md               # Project documentation
```

## Expected Structure (Post-Implementation)

Based on Tauri + React + TypeScript template:

```
.
├── src/                    # Frontend source code
│   ├── components/        # React components
│   ├── hooks/            # Custom React hooks
│   ├── services/         # API and database services
│   ├── types/            # TypeScript type definitions
│   ├── utils/            # Utility functions
│   ├── App.tsx           # Main application component
│   └── main.tsx          # Application entry point
├── src-tauri/             # Tauri backend (Rust)
│   ├── src/              # Rust source code
│   ├── Cargo.toml        # Rust dependencies
│   └── tauri.conf.json   # Tauri configuration
├── public/                # Static assets
└── package.json          # Node dependencies and scripts
```

## Key Architectural Patterns

- **Component-based UI**: React components for modular interface
- **Service layer**: Separate services for Gemini API, database operations
- **Tauri commands**: Rust backend exposes commands to frontend via IPC
- **SQLite persistence**: Local database for all user data
- **Settings store**: Tauri store plugin for configuration
- **Dark theme**: Consistent dark mode throughout application
