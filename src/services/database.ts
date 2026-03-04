import Database from '@tauri-apps/plugin-sql';

let db: Database | null = null;

export async function getDb(): Promise<Database> {
    if (!db) {
        db = await Database.load('sqlite:studybuddy.db');
    }
    return db;
}

// --- Documents ---

export interface Document {
    id: string;
    title: string;
    file_path: string;
    file_hash: string;
    file_type: 'pdf' | 'epub';
    last_opened: string;
    metadata: string;
}

export async function insertDocument(doc: Omit<Document, 'last_opened'>): Promise<void> {
    const database = await getDb();
    await database.execute(
        'INSERT OR REPLACE INTO documents (id, title, file_path, file_hash, file_type, last_opened, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [doc.id, doc.title, doc.file_path, doc.file_hash, doc.file_type, new Date().toISOString(), doc.metadata || '{}']
    );
}

export async function getRecentDocuments(limit = 20): Promise<Document[]> {
    const database = await getDb();
    return await database.select<Document[]>(
        'SELECT * FROM documents ORDER BY last_opened DESC LIMIT ?',
        [limit]
    );
}

export async function updateLastOpened(id: string): Promise<void> {
    const database = await getDb();
    await database.execute(
        'UPDATE documents SET last_opened = ? WHERE id = ?',
        [new Date().toISOString(), id]
    );
}

// --- Annotations ---

export interface Annotation {
    id: string;
    document_id: string;
    page_or_chapter: string;
    selection_type: 'text' | 'region';
    selected_text: string | null;
    region_image: Uint8Array | null;
    position_data: string;
    created_at: string;
}

export async function insertAnnotation(ann: Omit<Annotation, 'created_at'>): Promise<void> {
    const database = await getDb();
    await database.execute(
        'INSERT INTO annotations (id, document_id, page_or_chapter, selection_type, selected_text, region_image, position_data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [ann.id, ann.document_id, ann.page_or_chapter, ann.selection_type, ann.selected_text, ann.region_image, ann.position_data, new Date().toISOString()]
    );
}

export async function getAnnotationsForDocument(documentId: string): Promise<Annotation[]> {
    const database = await getDb();
    return await database.select<Annotation[]>(
        'SELECT * FROM annotations WHERE document_id = ? ORDER BY created_at ASC',
        [documentId]
    );
}

// --- Conversations ---

export interface Conversation {
    id: string;
    annotation_id: string;
    mode: 'explain' | 'translate' | 'whiteboard' | 'freeform';
    messages: string;
    summary: string;
    created_at: string;
    updated_at: string;
}

export async function insertConversation(conv: Omit<Conversation, 'created_at' | 'updated_at'>): Promise<void> {
    const database = await getDb();
    const now = new Date().toISOString();
    await database.execute(
        'INSERT INTO conversations (id, annotation_id, mode, messages, summary, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [conv.id, conv.annotation_id, conv.mode, conv.messages, conv.summary, now, now]
    );
}

export async function updateConversationMessages(id: string, messages: string): Promise<void> {
    const database = await getDb();
    await database.execute(
        'UPDATE conversations SET messages = ?, updated_at = ? WHERE id = ?',
        [messages, new Date().toISOString(), id]
    );
}

export async function getConversationsForAnnotation(annotationId: string): Promise<Conversation[]> {
    const database = await getDb();
    return await database.select<Conversation[]>(
        'SELECT * FROM conversations WHERE annotation_id = ? ORDER BY created_at DESC',
        [annotationId]
    );
}
