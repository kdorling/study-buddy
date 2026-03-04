import { useState, useEffect } from 'react';
import { getApiKey, setApiKey, getModel, setModel } from '../services/settings';
import { sendMessage } from '../services/llm';

interface SettingsDialogProps {
    open: boolean;
    onClose: () => void;
}

const MODELS = [
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    { value: 'gemini-2.0-pro', label: 'Gemini 2.0 Pro' },
    { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
    { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
];

export default function SettingsDialog({ open, onClose }: SettingsDialogProps) {
    const [apiKey, setApiKeyState] = useState('');
    const [selectedModel, setSelectedModel] = useState('gemini-2.0-flash');
    const [showKey, setShowKey] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

    useEffect(() => {
        if (open) {
            loadSettings();
        }
    }, [open]);

    const loadSettings = async () => {
        const key = await getApiKey();
        const model = await getModel();
        if (key) setApiKeyState(key);
        setSelectedModel(model);
        setTestResult(null);
    };

    const handleSave = async () => {
        await setApiKey(apiKey);
        await setModel(selectedModel);
        onClose();
    };

    const handleTest = async () => {
        setTesting(true);
        setTestResult(null);
        try {
            // Temporarily save the key so the test uses it
            await setApiKey(apiKey);
            await setModel(selectedModel);
            await sendMessage(
                [{ role: 'user', parts: [{ text: 'Say "Connection successful!" in exactly those words.' }] }],
                'You are a test assistant. Respond exactly as instructed.'
            );
            setTestResult({ ok: true, message: 'Connection successful!' });
        } catch (err) {
            setTestResult({
                ok: false,
                message: err instanceof Error ? err.message : 'Connection failed',
            });
        } finally {
            setTesting(false);
        }
    };

    if (!open) return null;

    return (
        <div className="dialog-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="dialog-card">
                <div className="dialog-header">
                    <h2>⚙️ Settings</h2>
                    <button className="toolbar-btn" onClick={onClose}>✕</button>
                </div>

                <div className="dialog-body">
                    <div className="dialog-field">
                        <label>Gemini API Key</label>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <input
                                type={showKey ? 'text' : 'password'}
                                value={apiKey}
                                onChange={(e) => setApiKeyState(e.target.value)}
                                placeholder="Enter your Gemini API key..."
                                style={{ flex: 1 }}
                            />
                            <button
                                className="dialog-btn"
                                onClick={() => setShowKey(!showKey)}
                                style={{ width: 40, padding: 0 }}
                            >
                                {showKey ? '🙈' : '👁'}
                            </button>
                        </div>
                    </div>

                    <div className="dialog-field">
                        <label>Model</label>
                        <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}>
                            {MODELS.map(m => (
                                <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
                        </select>
                    </div>

                    {testResult && (
                        <div className={`toast ${testResult.ok ? 'success' : 'error'}`} style={{ position: 'relative', bottom: 'auto', left: 'auto', transform: 'none' }}>
                            {testResult.message}
                        </div>
                    )}
                </div>

                <div className="dialog-footer">
                    <button className="dialog-btn" onClick={handleTest} disabled={testing || !apiKey}>
                        {testing ? 'Testing...' : '🔌 Test Connection'}
                    </button>
                    <button className="dialog-btn" onClick={onClose}>Cancel</button>
                    <button className="dialog-btn primary" onClick={handleSave}>Save</button>
                </div>
            </div>
        </div>
    );
}
