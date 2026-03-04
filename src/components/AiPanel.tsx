import { useState, useRef, useEffect, useCallback } from 'react';
import { sendMessage, ChatMessage, createExplainPrompt } from '../services/llm';
import { updateConversationMessages } from '../services/database';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

interface DisplayMessage {
    role: 'user' | 'model';
    text: string;
}

interface AiPanelProps {
    selectedText: string | null;
    conversationId: string | null;
    annotationId: string | null;
    existingMessages?: DisplayMessage[];
    onClose: () => void;
}

export default function AiPanel({ selectedText, conversationId, existingMessages, onClose }: AiPanelProps) {
    const [messages, setMessages] = useState<DisplayMessage[]>(existingMessages || []);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const initialSent = useRef(false);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, loading]);

    // Auto-send explain request on first load
    useEffect(() => {
        if (selectedText && messages.length === 0 && !initialSent.current) {
            initialSent.current = true;
            handleSendExplain(selectedText);
        }
    }, [selectedText]); // eslint-disable-line react-hooks/exhaustive-deps

    const persistMessages = useCallback(async (msgs: DisplayMessage[]) => {
        if (!conversationId) return;
        const chatMessages = msgs.map(m => ({
            role: m.role,
            parts: [{ text: m.text }],
        }));
        await updateConversationMessages(conversationId, JSON.stringify(chatMessages));
    }, [conversationId]);

    const handleSendExplain = async (text: string) => {
        const userMsg: DisplayMessage = { role: 'user', text: `Please explain this passage:\n\n"${text}"` };
        const newMessages = [...messages, userMsg];
        setMessages(newMessages);
        setLoading(true);
        setError(null);

        try {
            const chatHistory: ChatMessage[] = newMessages.map(m => ({
                role: m.role,
                parts: [{ text: m.text }],
            }));
            const response = await sendMessage(chatHistory, createExplainPrompt());
            const aiMsg: DisplayMessage = { role: 'model', text: response };
            const updatedMessages = [...newMessages, aiMsg];
            setMessages(updatedMessages);
            await persistMessages(updatedMessages);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to get response');
        } finally {
            setLoading(false);
        }
    };

    const handleSendFollowUp = async () => {
        if (!input.trim() || loading) return;

        const userMsg: DisplayMessage = { role: 'user', text: input.trim() };
        const newMessages = [...messages, userMsg];
        setMessages(newMessages);
        setInput('');
        setLoading(true);
        setError(null);

        try {
            const chatHistory: ChatMessage[] = newMessages.map(m => ({
                role: m.role,
                parts: [{ text: m.text }],
            }));
            const response = await sendMessage(chatHistory, createExplainPrompt());
            const aiMsg: DisplayMessage = { role: 'model', text: response };
            const updatedMessages = [...newMessages, aiMsg];
            setMessages(updatedMessages);
            await persistMessages(updatedMessages);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to get response');
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendFollowUp();
        }
    };

    return (
        <div className="ai-panel">
            <div className="ai-panel-header">
                <div className="ai-panel-header-title">
                    <span>💡</span>
                    <span>Explain</span>
                </div>
                <button className="toolbar-btn" onClick={onClose}>✕</button>
            </div>

            {selectedText && (
                <div className="ai-panel-context">
                    <div className="ai-panel-context-label">Selected passage</div>
                    <div className="ai-panel-context-text">{selectedText}</div>
                </div>
            )}

            <div className="ai-panel-messages">
                {messages.map((msg, i) => (
                    <div key={i} className={`chat-message ${msg.role}`}>
                        <div className="chat-message-role">
                            {msg.role === 'user' ? 'You' : 'Study Buddy'}
                        </div>
                        <div className="chat-message-content">
                            {msg.role === 'model' ? (
                                <ReactMarkdown
                                    remarkPlugins={[remarkMath]}
                                    rehypePlugins={[rehypeKatex]}
                                >
                                    {msg.text}
                                </ReactMarkdown>
                            ) : (
                                msg.text
                            )}
                        </div>
                    </div>
                ))}

                {loading && (
                    <div className="ai-panel-loading">
                        <div className="loading-dots">
                            <span /><span /><span />
                        </div>
                        <span>Thinking...</span>
                    </div>
                )}

                {error && (
                    <div className="toast error" style={{ position: 'relative', bottom: 'auto', left: 'auto', transform: 'none' }}>
                        {error}
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            <div className="ai-panel-input">
                <input
                    placeholder="Ask a follow-up question..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={loading}
                />
                <button className="send-btn" onClick={handleSendFollowUp} disabled={loading || !input.trim()}>
                    ↑
                </button>
            </div>
        </div>
    );
}
