CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    file_path TEXT NOT NULL UNIQUE,
    file_hash TEXT NOT NULL,
    file_type TEXT NOT NULL CHECK(file_type IN ('pdf', 'epub')),
    last_opened TEXT NOT NULL,
    metadata TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS annotations (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    page_or_chapter TEXT NOT NULL,
    selection_type TEXT NOT NULL CHECK(selection_type IN ('text', 'region')),
    selected_text TEXT,
    region_image BLOB,
    position_data TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    annotation_id TEXT NOT NULL REFERENCES annotations(id) ON DELETE CASCADE,
    mode TEXT NOT NULL CHECK(mode IN ('explain', 'translate', 'whiteboard', 'freeform')),
    messages TEXT NOT NULL DEFAULT '[]',
    summary TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX idx_annotations_document ON annotations(document_id);
CREATE INDEX idx_conversations_annotation ON conversations(annotation_id);
